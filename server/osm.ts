// Real shops near a place, from OpenStreetMap's Overpass API. Free and needs no key, and the
// Shops page map is drawn from OpenStreetMap too, so its shops belong on it. (Google's terms
// do not allow Google's shop data on a map that is not Google's.)
//
// Overpass is a shared public service: a search can take ten seconds or more, and at busy
// times it answers "504, too busy" or not at all. So the server asks once per area of about
// 1 km and saves the answer in the database for everyone. A saved area shows at once, even
// after a restart; once it is a day old it is looked up again in the background while the
// saved one keeps showing. Overpass is only ever sent the middle of the area, never the
// customer's exact location.

import type { StoreKind } from '../lib/data';
import { RADIUS_KM, roadKm } from '../lib/geo';
import type { RealShop } from '../lib/realshops';
import { getRepo } from './repo';
import { ApiError } from './service';

const MAIN = 'https://overpass-api.de/api/interpreter';
const MIRROR = 'https://overpass.private.coffee/api/interpreter';
/** The main server twice (its "too busy" often clears in seconds), then a public mirror. */
const ATTEMPTS = [MAIN, MAIN, MIRROR];
const PAUSE_MS = 3000;
/** Give up on a search after this long; the page tries once more by itself. */
const DEADLINE_MS = 55_000;
// Overpass asks every app to say who it is.
const USER_AGENT = 'LocalRush/1.0 (student project; https://github.com/NikhilAkashMinz/localrush-web)';

/** The OpenStreetMap shop types LocalRush cares about, the kind each is closest to, and how to say it. */
const TYPES: Record<string, { kind: StoreKind | null; label: string }> = {
  supermarket: { kind: 'supermarket', label: 'Supermarket' },
  department_store: { kind: 'supermarket', label: 'Department store' },
  wholesale: { kind: 'supermarket', label: 'Wholesale store' },
  variety_store: { kind: 'supermarket', label: 'Variety store' },
  convenience: { kind: 'kirana', label: 'Convenience store' },
  general: { kind: 'kirana', label: 'General store' },
  grocery: { kind: 'kirana', label: 'Grocery store' },
  kiosk: { kind: 'kirana', label: 'Kiosk' },
  dairy: { kind: 'kirana', label: 'Dairy' },
  beverages: { kind: 'kirana', label: 'Drinks shop' },
  deli: { kind: 'kirana', label: 'Delicatessen' },
  health_food: { kind: 'kirana', label: 'Health food store' },
  butcher: { kind: 'kirana', label: 'Butcher' },
  marketplace: { kind: 'fresh', label: 'Market' },
  greengrocer: { kind: 'fresh', label: 'Fruits and vegetables' },
  bakery: { kind: 'bakery', label: 'Bakery' },
  confectionery: { kind: 'bakery', label: 'Sweet shop' },
  pastry: { kind: 'bakery', label: 'Pastry shop' },
  pharmacy: { kind: 'pharmacy', label: 'Pharmacy' },
  chemist: { kind: 'pharmacy', label: 'Chemist' },
  medical_supply: { kind: 'pharmacy', label: 'Medical supplies' },
  electronics: { kind: 'electronics', label: 'Electronics shop' },
  mobile_phone: { kind: 'electronics', label: 'Mobile phone shop' },
  computer: { kind: 'electronics', label: 'Computer shop' },
  electrical: { kind: 'electronics', label: 'Electrical shop' },
  stationery: { kind: 'stationery', label: 'Stationery shop' },
  books: { kind: 'stationery', label: 'Book shop' },
  copyshop: { kind: 'stationery', label: 'Xerox and printing' },
  hardware: { kind: null, label: 'Hardware shop' },
};
const AMENITIES = ['pharmacy', 'marketplace'];
const SHOPS = Object.keys(TYPES).filter((t) => !AMENITIES.includes(t));

/** About 1.1 km: every location inside one square shares a search. */
const CELL = 0.01;
/** Wide enough that 5 km by road from anywhere in the square is covered. */
const SEARCH_M = Math.round((RADIUS_KM / 1.3) * 1000) + 800;
/** After this, a saved area is looked up again in the background. */
const FRESH_MS = 24 * 3600_000;
/** After this, a saved area is too old to show at all. */
const KEEP_MS = 30 * 24 * 3600_000;
/** Searches allowed to run against Overpass at the same moment, to be a polite user of it. */
const MAX_RUNNING = 2;

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
/** A shop as kept for an area: everything except its distance, which depends on who asks. */
type Found = Omit<RealShop, 'distKm'>;

/** Turn Overpass's answer into shops. Places with no name, or of a type we do not use, are left out. */
export function toShops(elements: OsmElement[]): Found[] {
  const out: Found[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const name = (t['name:en'] || t.name || '').trim();
    const lat = e.center?.lat ?? e.lat;
    const lng = e.center?.lon ?? e.lon;
    const type = AMENITIES.includes(t.amenity) ? t.amenity : t.shop;
    const info = type ? TYPES[type] : undefined;
    if (!name || lat === undefined || lng === undefined || !info) continue;
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
    out.push({
      id: `osm-${e.type[0]}${e.id}`,
      name,
      typeLabel: info.label,
      kind: info.kind,
      address,
      lat,
      lng,
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      ...(t.opening_hours ? { hours: t.opening_hours } : {}),
    });
  }
  return out;
}

function query(lat: number, lng: number) {
  const around = `(around:${SEARCH_M},${lat.toFixed(4)},${lng.toFixed(4)})`;
  return `[out:json][timeout:25];
(
  nwr["shop"~"^(${SHOPS.join('|')})$"]${around};
  nwr["amenity"~"^(${AMENITIES.join('|')})$"]${around};
);
out center tags;`;
}

type Fetcher = (query: string) => Promise<OsmElement[]>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(q: string): Promise<OsmElement[]> {
  const until = Date.now() + DEADLINE_MS;
  let last: unknown = null;
  for (const [i, url] of ATTEMPTS.entries()) {
    if (i > 0) await wait(PAUSE_MS);
    const left = until - Date.now();
    if (left < 5000) break;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(Math.min(30_000, left)),
      });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return ((await response.json()) as { elements?: OsmElement[] }).elements ?? [];
    } catch (e) {
      last = e;
      console.warn(`[localrush] Overpass try ${i + 1} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw last ?? new Error('Overpass took too long.');
}

let fetcher: Fetcher = overpass;
// Kept on globalThis, like the database connection, so a code reload in development does not
// forget what was just found. "pending" lets everyone asking about an area wait for one search.
type Holder = { __localrushOsmShops?: { saved: Map<string, { at: number; shops: Found[] }>; pending: Map<string, Promise<Found[]>> } };
const memo = ((globalThis as Holder).__localrushOsmShops ??= { saved: new Map(), pending: new Map() });
let running = 0;

/** Tests only: answer searches with this instead of asking Overpass, forgetting what this process kept. */
export function useOverpass(f: Fetcher) {
  fetcher = f;
  memo.saved.clear();
  memo.pending.clear();
}

/**
 * The database, if it can keep saved copies. A development server that reloaded its code can
 * still hold a database object from before this existed; then copies are kept in memory only.
 */
async function store() {
  const repo = await getRepo();
  return typeof repo.getCached === 'function' && typeof repo.putCached === 'function' ? repo : null;
}

/** Ask Overpass about one area, and save the answer in this process and the database. */
function search(key: string, cLat: number, cLng: number): Promise<Found[]> {
  const already = memo.pending.get(key);
  if (already) return already;
  if (running >= MAX_RUNNING) {
    throw new ApiError(503, 'Still looking up shops for other areas. Try again in a few seconds.', 'busy');
  }
  running++;
  const shops = fetcher(query(cLat, cLng))
    .then(toShops)
    .then(async (found) => {
      const at = Date.now();
      memo.saved.set(key, { at, shops: found });
      const repo = await store();
      await repo?.putCached('osm-shops:' + key, found, at).catch((e) => console.warn('[localrush] Could not save real shops', e));
      return found;
    })
    .finally(() => {
      running--;
      memo.pending.delete(key);
    });
  memo.pending.set(key, shops);
  return shops;
}

async function area(lat: number, lng: number): Promise<Found[]> {
  const cLat = Math.round(lat / CELL) * CELL;
  const cLng = Math.round(lng / CELL) * CELL;
  const key = `${cLat.toFixed(2)},${cLng.toFixed(2)}`;
  const now = Date.now();

  let saved = memo.saved.get(key) ?? null;
  if (!saved) {
    const repo = await store();
    const stored = repo ? await repo.getCached<Found[]>('osm-shops:' + key).catch(() => null) : null;
    if (stored) memo.saved.set(key, (saved = { at: stored.at, shops: stored.value }));
  }
  if (saved && now - saved.at < KEEP_MS) {
    // A day old: show it now, and look it up again quietly for next time.
    if (now - saved.at >= FRESH_MS && !memo.pending.has(key) && running < MAX_RUNNING) {
      search(key, cLat, cLng).catch(() => undefined);
    }
    return saved.shops;
  }
  return search(key, cLat, cLng);
}

/** The real shops within 5 km by road of a location, nearest first. */
export async function realShopsNear(lat: number, lng: number): Promise<RealShop[]> {
  let found: Found[];
  try {
    found = await area(lat, lng);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.warn('[localrush] OpenStreetMap shop search failed:', e instanceof Error ? e.message : e);
    throw new ApiError(503, 'OpenStreetMap is busy right now, so real shops could not be loaded. Try again in a minute.', 'osm');
  }
  return found
    .map((s) => ({ ...s, distKm: roadKm(lat, lng, s.lat, s.lng) }))
    .filter((s) => s.distKm <= RADIUS_KM)
    .sort((a, b) => a.distKm - b.distKm);
}
