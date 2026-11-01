'use client';

// Google Maps in the browser: loading the Maps JavaScript API once, and finding the real
// shops near a place with Places "Nearby Search". Everything here needs an API key in
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; without one the site keeps its own 3D scene instead.
//
// The key needs two APIs switched on in Google Cloud: "Maps JavaScript API" (the 3D map)
// and "Places API (New)" (the nearby shops). Only fields billed as Nearby Search "Pro" are
// asked for: rating and opening hours would move every search to the dearer "Enterprise" tier.

import { useEffect, useState } from 'react';
import type { Place, StoreKind } from './data';
import { RADIUS_KM, roadKm } from './geo';
import type { RealShop, RealShops } from './realshops';

export const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type LatLngObject = { lat(): number; lng(): number };
/** The small part of the Google Maps API this site uses. */
export type GoogleMaps = { maps: { importLibrary(name: string): Promise<Record<string, unknown>> } };
type GoogleWindow = Window & { google?: GoogleMaps; gm_authFailure?: () => void; __lrGoogleReady?: () => void };

let loading: Promise<GoogleMaps> | null = null;
let authFailure = '';
const authListeners = new Set<(message: string) => void>();

/** What to do about each way Google can refuse the key. The codes are Google's own. */
const KEY_ERRORS: Record<string, string> = {
  InvalidKeyMapError: 'Google says the Maps API key is not valid. Check it was copied in full.',
  MissingKeyMapError: 'Google did not receive a Maps API key.',
  ExpiredKeyMapError: 'The Maps API key has expired. Create a new one.',
  ApiNotActivatedMapError: 'Switch on "Maps JavaScript API" in the Google Cloud project the key belongs to.',
  BillingNotEnabledMapError: 'Turn on billing for the Google Cloud project the key belongs to.',
  RefererNotAllowedMapError: `This site's address is not allowed to use the key. Add ${typeof location === 'undefined' ? 'it' : location.origin + '/*'} to the key's website restrictions.`,
  ApiTargetBlockedMapError: 'The key\'s API restrictions block "Maps JavaScript API". Allow it for the key.',
};

function refuse(code?: string) {
  if (authFailure) return;
  authFailure = (code && KEY_ERRORS[code]) || `Google did not accept the Maps API key${code ? ` (${code})` : ''}.`;
  authListeners.forEach((f) => f(authFailure));
}

/**
 * For the 3D map, Google reports a refused key only as a console error such as
 * "Google Maps JavaScript API error: InvalidKeyMapError", and the map just keeps spinning.
 * Watching for that message is the only way to notice and show the built-in map instead.
 */
function watchForKeyErrors() {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const code = /Google Maps JavaScript API error: (\w+MapError)/.exec(args.map(String).join(' '))?.[1];
    if (code) refuse(code);
  };
}

/** Load the Maps JavaScript API once per page. Libraries are fetched later with importLibrary. */
export function loadGoogleMaps(): Promise<GoogleMaps> {
  if (!GOOGLE_KEY) return Promise.reject(new Error('No Google Maps API key is set.'));
  if (loading) return loading;
  loading = new Promise<GoogleMaps>((resolve, reject) => {
    const w = window as GoogleWindow;
    if (w.google?.maps?.importLibrary) return resolve(w.google);
    // Google calls this global when it refuses the key for a 2D map; the 3D map only logs it.
    w.gm_authFailure = () => refuse();
    watchForKeyErrors();
    w.__lrGoogleReady = () => resolve(w.google!);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&loading=async&callback=__lrGoogleReady`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Google Maps could not be reached. Check your internet connection.'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Be told, with what to do about it, if Google refuses the API key. Returns a function that stops listening. */
export function onGoogleAuthFailure(listener: (message: string) => void) {
  if (authFailure) listener(authFailure);
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

// ---------- Real shops near a place ----------

/** The kinds of shop LocalRush delivers from. Every name must be a Places "Table A" type. */
const SHOP_TYPES: Record<string, StoreKind | null> = {
  grocery_store: 'kirana',
  convenience_store: 'kirana',
  general_store: 'kirana',
  food_store: 'kirana',
  market: 'kirana',
  store: 'kirana',
  supermarket: 'supermarket',
  hypermarket: 'supermarket',
  discount_supermarket: 'supermarket',
  department_store: 'supermarket',
  discount_store: 'supermarket',
  pharmacy: 'pharmacy',
  drugstore: 'pharmacy',
  bakery: 'bakery',
  electronics_store: 'electronics',
  cell_phone_store: 'electronics',
  book_store: 'stationery',
  hardware_store: null,
};

/** Google returns at most 20 places for one search; these are the nearest. */
const MAX_RESULTS = 20;
/** LocalRush's 5 km is by road; this is about that far in a straight line. */
const RADIUS_M = Math.round((RADIUS_KM / 1.3) * 1000);
/** Searching again for the same spot within this time reuses the answer, to keep Google's bill down. */
const KEEP_MS = 30 * 60_000;

type PlaceFound = {
  id: string;
  displayName?: string | null;
  location?: LatLngObject | null;
  primaryType?: string | null;
  primaryTypeDisplayName?: string | null;
  formattedAddress?: string | null;
  googleMapsURI?: string | null;
  businessStatus?: string | null;
};
type PlacesLibrary = {
  Place: { searchNearby(request: Record<string, unknown>): Promise<{ places: PlaceFound[] }> };
  SearchNearbyRankPreference?: { DISTANCE: unknown };
};

const memory = new Map<string, { at: number; shops: RealShop[] }>();
// About 100 m: moving less than that reuses the last search.
const spot = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

function remembered(key: string): RealShop[] | null {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.at < KEEP_MS) return hit.shops;
  try {
    const raw = sessionStorage.getItem('lr:gshops:' + key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at: number; shops: RealShop[] };
    if (now - saved.at >= KEEP_MS) return null;
    memory.set(key, saved);
    return saved.shops;
  } catch {
    return null;
  }
}

function remember(key: string, shops: RealShop[]) {
  const entry = { at: Date.now(), shops };
  memory.set(key, entry);
  try {
    sessionStorage.setItem('lr:gshops:' + key, JSON.stringify(entry));
  } catch {
    // Storage can be full or switched off; the answer is still kept for this page.
  }
}

/** What to do about a failed shop search, from Google's error text. */
function placesErrorText(text: string) {
  if (/API key not valid|API_KEY_INVALID|expired/i.test(text)) return KEY_ERRORS.InvalidKeyMapError;
  if (/referer|referrer/i.test(text)) return KEY_ERRORS.RefererNotAllowedMapError;
  if (/billing/i.test(text)) return KEY_ERRORS.BillingNotEnabledMapError;
  if (/not been used|disabled|blocked|PERMISSION_DENIED|not authorized/i.test(text)) {
    return 'Switch on "Places API (New)" in the Google Cloud project the key belongs to, and allow it in the key\'s API restrictions.';
  }
  return 'Shops from Google Maps could not be loaded right now.';
}

/** The nearest real shops to a place, from Google Maps, nearest first. */
export async function nearbyShops(lat: number, lng: number): Promise<RealShop[]> {
  const key = spot(lat, lng);
  const known = remembered(key);
  if (known) return known.map((s) => ({ ...s, distKm: roadKm(lat, lng, s.lat, s.lng) }));

  const google = await loadGoogleMaps();
  const { Place, SearchNearbyRankPreference } = (await google.maps.importLibrary('places')) as unknown as PlacesLibrary;
  let places: PlaceFound[];
  try {
    ({ places } = await Place.searchNearby({
      fields: ['id', 'displayName', 'location', 'primaryType', 'primaryTypeDisplayName', 'formattedAddress', 'googleMapsURI', 'businessStatus'],
      locationRestriction: { center: { lat, lng }, radius: RADIUS_M },
      includedPrimaryTypes: Object.keys(SHOP_TYPES),
      maxResultCount: MAX_RESULTS,
      rankPreference: SearchNearbyRankPreference?.DISTANCE ?? 'DISTANCE',
    }));
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    console.warn('[localrush] Google Places search failed:', text);
    // Once Google has refused the key for the map, its other calls fail in odd ways: give the real reason.
    if (authFailure) throw new Error(authFailure);
    throw new Error(placesErrorText(text));
  }

  const shops = places
    .filter((p) => p.location && p.displayName && p.businessStatus !== 'CLOSED_PERMANENTLY')
    .map((p): RealShop => {
      const at = p.location!;
      return {
        id: p.id,
        name: p.displayName!,
        typeLabel: p.primaryTypeDisplayName || 'Shop',
        kind: SHOP_TYPES[p.primaryType ?? ''] ?? null,
        address: p.formattedAddress ?? '',
        lat: at.lat(),
        lng: at.lng(),
        distKm: roadKm(lat, lng, at.lat(), at.lng()),
        url: p.googleMapsURI ?? `https://www.google.com/maps/search/?api=1&query=${at.lat()},${at.lng()}&query_place_id=${encodeURIComponent(p.id)}`,
      };
    })
    .sort((a, b) => a.distKm - b.distKm);
  remember(key, shops);
  return shops;
}

/** The real shops near a place, searched again when the place moves. Empty when there is no key. */
export function useRealShops(place: Place): RealShops {
  const [result, setResult] = useState<RealShops>({ shops: [], loading: !!GOOGLE_KEY, error: '' });
  useEffect(() => {
    if (!GOOGLE_KEY) return;
    let dead = false;
    setResult((r) => ({ ...r, loading: true, error: '' }));
    nearbyShops(place.lat, place.lng).then(
      (shops) => {
        if (!dead) setResult({ shops, loading: false, error: '' });
      },
      (e: unknown) => {
        if (!dead) setResult({ shops: [], loading: false, error: e instanceof Error ? e.message : 'Shops from Google Maps could not be loaded.' });
      },
    );
    return () => {
      dead = true;
    };
  }, [place.lat, place.lng]);
  return result;
}
