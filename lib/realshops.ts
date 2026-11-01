'use client';

// Real shops near a place that are not on LocalRush: from OpenStreetMap through our own
// server (server/osm.ts), or from Google Maps when there is a key (lib/google.ts). Nothing
// can be ordered from them; they are shown so the map matches the street.

import { useEffect, useState } from 'react';
import { api, ApiFail, errorText } from './api';
import type { Place, StoreKind } from './data';

export type RealShop = {
  /** "osm-n123" for OpenStreetMap, Google's own place id for Google. Never like a LocalRush shop id. */
  id: string;
  name: string;
  /** What it is, in words, such as "Supermarket" or "Pharmacy". */
  typeLabel: string;
  /** The LocalRush shop kind it is closest to, for its colour and icon. */
  kind: StoreKind | null;
  address: string;
  lat: number;
  lng: number;
  /** Rough distance by road from the place searched from. */
  distKm: number;
  /** Its page on OpenStreetMap or Google Maps. */
  url: string;
  /** Opening hours as the map lists them, when it does, e.g. "Mo-Su 07:00-22:00". */
  hours?: string;
};

export const isRealShopId = (id: string | null | undefined) => !!id && !id.startsWith('s-');

/** Directions from wherever the person is to the shop, in Google Maps. */
export const directionsUrl = (s: Pick<RealShop, 'lat' | 'lng'>) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;

export type RealShops = { shops: RealShop[]; loading: boolean; error: string };

/**
 * The real shops within 5 km of a place, from OpenStreetMap. The first search for an area
 * can take several seconds; the server keeps the answer, so later ones are quick.
 */
export function useOsmShops(place: Place, enabled = true): RealShops {
  const [result, setResult] = useState<RealShops>({ shops: [], loading: enabled, error: '' });
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResult((r) => ({ ...r, loading: true, error: '' }));
    const ask = (triesLeft: number) =>
      api<{ shops: RealShop[] }>('GET', `nearby-shops?lat=${place.lat.toFixed(5)}&lng=${place.lng.toFixed(5)}`).then(
        ({ shops }) => {
          if (!dead) setResult({ shops, loading: false, error: '' });
        },
        (e: unknown) => {
          if (dead) return;
          // OpenStreetMap's servers are often busy for a moment: try once more before giving up.
          if (triesLeft > 0 && e instanceof ApiFail && (e.code === 'osm' || e.code === 'busy')) {
            timer = setTimeout(() => ask(triesLeft - 1), 5000);
            return;
          }
          setResult({ shops: [], loading: false, error: errorText(e) });
        },
      );
    ask(1);
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [place.lat, place.lng, enabled]);
  return result;
}
