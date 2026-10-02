import { STORES, stockAt, type Store } from './data';
import { offsetKm, RADIUS_KM, roadKm } from './geo';

export type Near = {
  store: Store;
  distKm: number;
  etaMin: number;
  load: number;
  open: boolean;
  inRange: boolean;
  /** Position relative to the customer in km: x east, z south. */
  x: number;
  z: number;
};

export type Offer = { near: Near; price: number; stock: number };

export function isOpen(s: Store, hour: number) {
  return hour >= s.open[0] && hour < s.open[1];
}

/** Shops get busier around breakfast and in the evening. */
export function loadAt(s: Store, hour: number) {
  const peak = (hour >= 8 && hour < 10) || (hour >= 18 && hour < 21) ? 0.2 : 0;
  return Math.min(1, s.load + peak);
}

export function etaFor(s: Store, distKm: number, load: number) {
  const packing = s.prep * (1 + load * 0.6);
  const riding = distKm * 3; // about 20 km/h through city streets
  return Math.round(packing + riding + 2);
}

let cacheKey = '';
let cache: Near[] = [];

/** Every shop, measured from the customer's location, nearest first. */
export function shopsNear(lat: number, lng: number, now = new Date()): Near[] {
  const hour = now.getHours();
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${hour}`;
  if (key === cacheKey) return cache;
  cache = STORES.map((s) => {
    const distKm = roadKm(lat, lng, s.lat, s.lng);
    const load = loadAt(s, hour);
    const { x, z } = offsetKm(lat, lng, s.lat, s.lng);
    return {
      store: s,
      distKm,
      load,
      etaMin: etaFor(s, distKm, load),
      open: isOpen(s, hour),
      inRange: distKm <= RADIUS_KM,
      x,
      z,
    };
  }).sort((a, b) => a.distKm - b.distKm);
  cacheKey = key;
  return cache;
}

export const usable = (near: Near[]) => near.filter((n) => n.inRange && n.open);

/** Shops that can deliver this product right now, fastest first. */
export function offersFor(pid: string, near: Near[]): Offer[] {
  const out: Offer[] = [];
  for (const n of near) {
    if (!n.inRange || !n.open) continue;
    const st = stockAt(n.store.id, pid);
    if (st && st.stock > 0) out.push({ near: n, price: st.price, stock: st.stock });
  }
  return out.sort((a, b) => a.near.etaMin - b.near.etaMin);
}

export type Availability =
  | { state: 'available'; best: Offer; offers: Offer[]; maxQty: number }
  | { state: 'closed'; opensAt: number }
  | { state: 'out' }
  | { state: 'none' };

export function availability(pid: string, near: Near[]): Availability {
  const offers = offersFor(pid, near);
  if (offers.length) {
    return { state: 'available', best: offers[0], offers, maxQty: Math.min(12, Math.max(...offers.map((o) => o.stock))) };
  }
  let closedOpens = -1;
  let carried = false;
  for (const n of near) {
    if (!n.inRange) continue;
    const st = stockAt(n.store.id, pid);
    if (!st) continue;
    carried = true;
    if (!n.open && st.stock > 0 && (closedOpens < 0 || n.store.open[0] < closedOpens)) closedOpens = n.store.open[0];
  }
  if (closedOpens >= 0) return { state: 'closed', opensAt: closedOpens };
  return carried ? { state: 'out' } : { state: 'none' };
}
