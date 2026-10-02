// Smart store selection: the core idea of LocalRush.
// Given a cart and a location, decide which nearby shop fulfils which items by
// comparing distance, stock, price, workload and estimated delivery time.

import { product, stockAt } from './data';
import { usable, type Near } from './nearby';

export type Mode = 'balanced' | 'fastest' | 'cheapest';

export const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'balanced', label: 'Balanced', hint: 'A fair mix of speed and price' },
  { key: 'fastest', label: 'Fastest', hint: 'Whichever shop gets it to you soonest' },
  { key: 'cheapest', label: 'Cheapest', hint: 'Lowest bill, even if it takes longer' },
];

export type Factor = 'distance' | 'price' | 'workload' | 'eta';

export const FACTOR_LABEL: Record<Factor, string> = {
  distance: 'Distance',
  price: 'Price',
  workload: 'Shop workload',
  eta: 'Delivery time',
};

export const WEIGHTS: Record<Mode, Record<Factor, number>> = {
  balanced: { distance: 0.25, price: 0.25, workload: 0.2, eta: 0.3 },
  fastest: { distance: 0.2, price: 0.05, workload: 0.15, eta: 0.6 },
  cheapest: { distance: 0.1, price: 0.7, workload: 0.05, eta: 0.15 },
};

export const FREE_DELIVERY_FROM = 199;
export const DELIVERY_FEE = 25;

export type Line = { pid: string; qty: number; price: number };

export type Candidate = {
  near: Near;
  lines: Line[];
  missing: string[];
  subtotal: number;
  priceRatio: number;
  /** 0 to 1 for each factor, where 1 is the best among the shops compared. */
  parts: Record<Factor, number>;
  score: number;
};

export type Shipment = {
  near: Near;
  lines: Line[];
  subtotal: number;
  fee: number;
  etaMin: number;
  candidates: Candidate[];
};

export type Plan = {
  shipments: Shipment[];
  unavailable: string[];
  items: number;
  subtotal: number;
  mrpTotal: number;
  fees: number;
  total: number;
};

function goodness(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v) => (hi === lo ? 1 : (hi - v) / (hi - lo)));
}

function rank(remaining: [string, number][], shops: Near[], mode: Mode): Candidate[] {
  const raw = shops
    .map((near) => {
      const lines: Line[] = [];
      const missing: string[] = [];
      let subtotal = 0;
      let mrp = 0;
      for (const [pid, qty] of remaining) {
        const st = stockAt(near.store.id, pid);
        const p = product(pid);
        if (st && p && st.stock >= qty) {
          lines.push({ pid, qty, price: st.price });
          subtotal += st.price * qty;
          mrp += p.mrp * qty;
        } else {
          missing.push(pid);
        }
      }
      return { near, lines, missing, subtotal, priceRatio: mrp ? subtotal / mrp : 1 };
    })
    .filter((c) => c.lines.length > 0);
  if (!raw.length) return [];

  const g = {
    distance: goodness(raw.map((c) => c.near.distKm)),
    price: goodness(raw.map((c) => c.priceRatio)),
    workload: goodness(raw.map((c) => c.near.load)),
    eta: goodness(raw.map((c) => c.near.etaMin)),
  };
  const w = WEIGHTS[mode];
  const ranked: Candidate[] = raw.map((c, i) => {
    const parts = { distance: g.distance[i], price: g.price[i], workload: g.workload[i], eta: g.eta[i] };
    const score = Math.round(
      100 * (parts.distance * w.distance + parts.price * w.price + parts.workload * w.workload + parts.eta * w.eta),
    );
    return { ...c, parts, score };
  });
  // Fewer deliveries first: a shop that covers more of the cart always outranks one that covers less.
  return ranked.sort((a, b) => b.lines.length - a.lines.length || b.score - a.score || a.near.distKm - b.near.distKm);
}

export function planOrder(cart: Record<string, number>, near: Near[], mode: Mode): Plan {
  const shops = usable(near);
  let remaining = Object.entries(cart).filter(([pid, qty]) => qty > 0 && product(pid));
  const shipments: Shipment[] = [];
  let unavailable: string[] = [];

  while (remaining.length) {
    const candidates = rank(remaining, shops, mode);
    const best = candidates[0];
    if (!best) {
      unavailable = remaining.map(([pid]) => pid);
      break;
    }
    shipments.push({
      near: best.near,
      lines: best.lines,
      subtotal: best.subtotal,
      fee: best.subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE,
      etaMin: best.near.etaMin,
      candidates,
    });
    const taken = new Set(best.lines.map((l) => l.pid));
    remaining = remaining.filter(([pid]) => !taken.has(pid));
  }

  const subtotal = shipments.reduce((s, x) => s + x.subtotal, 0);
  const fees = shipments.reduce((s, x) => s + x.fee, 0);
  const mrpTotal = shipments.reduce(
    (s, x) => s + x.lines.reduce((t, l) => t + (product(l.pid)?.mrp ?? l.price) * l.qty, 0),
    0,
  );
  const items = shipments.reduce((s, x) => s + x.lines.reduce((t, l) => t + l.qty, 0), 0);
  return { shipments, unavailable, items, subtotal, mrpTotal, fees, total: subtotal + fees };
}
