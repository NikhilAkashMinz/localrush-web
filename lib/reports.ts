// Shop sales and delivery partner earnings, worked out from delivered orders.
// Orders are the only record of a sale: these reports are always calculated from them, so a
// report can never disagree with the orders behind it. The server runs these functions and
// the pages show the result.

import { deliveredAt, itemCount, lineName, lineUnit, payOf, type Order } from './orders';

export type Period = 'today' | 'week' | 'all';
export const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'all', label: 'All time' },
];
export const isPeriod = (v: unknown): v is Period => v === 'today' || v === 'week' || v === 'all';

const DAY = 86_400_000;
const IST = 5.5 * 3600_000;

/** The start of today in India, as a timestamp, so "today" means the shop's and rider's day. */
export const startOfDayIST = (now: number) => Math.floor((now + IST) / DAY) * DAY - IST;

/** The first moment that counts towards a period. "Last 7 days" is today and the six days before. */
export function periodStart(period: Period, now: number) {
  if (period === 'all') return 0;
  return startOfDayIST(now) - (period === 'week' ? 6 * DAY : 0);
}

const delivered = (orders: Order[]) => orders.filter((o) => o.status === 'delivered');
const within = (orders: Order[], period: Period, now: number) => {
  const from = periodStart(period, now);
  return orders.filter((o) => deliveredAt(o) >= from).sort((a, b) => deliveredAt(b) - deliveredAt(a));
};
/** At most this many orders are listed; the totals always count every one. */
const LIST_MAX = 100;

// ---------- Shop sales ----------

export type SalesTotals = { orders: number; items: number; revenue: number };
/** One product's sales. `low` and `high` are the lowest and highest price it sold for. */
export type ProductSales = { pid: string; name: string; unit: string; qty: number; revenue: number; low: number; high: number };
export type SalesReport = {
  period: Period;
  totals: Record<Period, SalesTotals>;
  /** What sold in the chosen period, best sellers first. */
  products: ProductSales[];
  /** Delivered orders in the chosen period, newest first. */
  orders: Order[];
};

/** A shop's sales: what it sold, how many and for how much. Revenue is the item value, without the delivery fee. */
export function salesReport(orders: Order[], period: Period, now: number): SalesReport {
  const sold = delivered(orders);
  const total = (p: Period): SalesTotals => {
    const list = within(sold, p, now);
    return { orders: list.length, items: list.reduce((a, o) => a + itemCount(o), 0), revenue: list.reduce((a, o) => a + o.subtotal, 0) };
  };
  const chosen = within(sold, period, now);
  const byProduct = new Map<string, ProductSales>();
  for (const o of chosen) {
    for (const l of o.lines) {
      const row = byProduct.get(l.pid) ?? { pid: l.pid, name: lineName(l), unit: lineUnit(l), qty: 0, revenue: 0, low: l.price, high: l.price };
      row.qty += l.qty;
      row.revenue += l.qty * l.price;
      row.low = Math.min(row.low, l.price);
      row.high = Math.max(row.high, l.price);
      byProduct.set(l.pid, row);
    }
  }
  return {
    period,
    totals: { today: total('today'), week: total('week'), all: total('all') },
    products: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue || b.qty - a.qty),
    orders: chosen.slice(0, LIST_MAX),
  };
}

// ---------- Delivery partner earnings ----------

export type EarningsTotals = { deliveries: number; earned: number; km: number; cash: number };
export type EarningsReport = {
  period: Period;
  totals: Record<Period, EarningsTotals>;
  /** Pay for the delivery under way, if there is one: earned once it is handed over. */
  pending: number;
  /** Delivered orders in the chosen period, newest first. */
  orders: Order[];
};

/**
 * A delivery partner's earnings. "cash" is the cash-on-delivery money collected at the door,
 * which the partner hands over to LocalRush; it is not part of what they earn.
 */
export function earningsReport(orders: Order[], period: Period, now: number): EarningsReport {
  const done = delivered(orders);
  const total = (p: Period): EarningsTotals => {
    const list = within(done, p, now);
    return {
      deliveries: list.length,
      earned: list.reduce((a, o) => a + payOf(o), 0),
      km: Math.round(list.reduce((a, o) => a + (o.pickupKm ?? 0) + o.distKm, 0) * 10) / 10,
      cash: list.reduce((a, o) => a + (o.payment === 'cod' ? o.total : 0), 0),
    };
  };
  const pending = orders.filter((o) => o.status === 'assigned' || o.status === 'picked').reduce((a, o) => a + payOf(o), 0);
  return {
    period,
    totals: { today: total('today'), week: total('week'), all: total('all') },
    pending,
    orders: within(done, period, now).slice(0, LIST_MAX),
  };
}
