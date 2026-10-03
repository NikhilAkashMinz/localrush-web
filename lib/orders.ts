// Orders: the shape shared by the website, the dashboards and the server.
//
// An order is the permanent record of a sale. It keeps everything needed to read it back
// later without looking anything else up: who ordered (by mobile number), what was bought
// and at what price, which shop sold it, and what the delivery partner was paid.

import { product } from './data';
import type { Line } from './select';

/**
 * One item of an order. The name and pack size are copied from the catalogue when the
 * order is placed, so order history, shop sales and receipts read the same even if the
 * product is renamed or removed later. Orders placed before this was added have no copy.
 */
export type OrderLine = Line & { name?: string; unit?: string };

export type Status =
  | 'placed' // sent to the shop, waiting for it to accept
  | 'accepted' // the shop is packing it
  | 'packed' // ready, waiting for a delivery partner
  | 'assigned' // a partner has claimed it and is riding to the shop
  | 'picked' // the partner has it and is riding to the customer
  | 'delivered'
  | 'rejected' // the shop said no and nobody else nearby could take it
  | 'cancelled'; // the customer cancelled before the shop accepted

export type Order = {
  id: string;
  customerId: string;
  customerName: string;
  /** The customer's mobile number. Order history is found by this, not by account id. */
  customerPhone: string;
  storeId: string;
  storeName: string;
  lines: OrderLine[];
  subtotal: number;
  fee: number;
  total: number;
  address: string;
  lat: number;
  lng: number;
  payment: 'cod' | 'online';
  etaMin: number;
  distKm: number;
  /** The code the customer gives at the door. Only the customer is ever sent this. */
  otp?: string;
  status: Status;
  partnerId: string | null;
  partnerName: string | null;
  /** The partner's ride to the shop in km, measured when they took the delivery. */
  pickupKm?: number;
  /**
   * What the delivery partner earns for this delivery, in rupees. Fixed when they take it,
   * so the amount they accepted is the amount they get. On a job not yet taken, an estimate.
   */
  partnerPay?: number;
  deliveredAt?: number;
  /** Shops that turned this order down, so it is not offered to them again. */
  rejectedBy: string[];
  note?: string;
  history: { status: Status; at: number; note?: string }[];
  createdAt: number;
  updatedAt: number;
};

export const STAGES = [
  { key: 'placed', label: 'Order placed', note: 'Waiting for the shop to accept' },
  { key: 'accepted', label: 'Shop accepted', note: 'Your items are being packed' },
  { key: 'packed', label: 'Packed', note: 'Looking for a delivery partner nearby' },
  { key: 'assigned', label: 'Partner assigned', note: 'Riding to the shop' },
  { key: 'picked', label: 'Picked up', note: 'On the way to you' },
  { key: 'delivered', label: 'Delivered', note: 'Enjoy' },
] as const;

export const STATUS_LABEL: Record<Status, string> = {
  placed: 'Waiting for the shop',
  accepted: 'Being packed',
  packed: 'Packed, finding a partner',
  assigned: 'Partner on the way to the shop',
  picked: 'On the way to you',
  delivered: 'Delivered',
  rejected: 'Not accepted',
  cancelled: 'Cancelled',
};

export const stageIndex = (s: Status) => Math.max(0, STAGES.findIndex((x) => x.key === s));
export const isActive = (s: Status) => s !== 'delivered' && s !== 'rejected' && s !== 'cancelled';
export const isOver = (s: Status) => !isActive(s);

const since = (o: Order, status: Status) => [...o.history].reverse().find((h) => h.status === status)?.at;

/**
 * Where to draw the rider on the tracking map: 0 to 1 is the ride to the shop, 1 to 2 the
 * ride to the customer. There is no GPS yet, so this is an estimate from how long ago each
 * step happened. It holds just short of each arrival until the real step is confirmed.
 */
export function riderPosition(o: Order, now: number) {
  if (o.status === 'delivered') return 2;
  if (o.status === 'assigned') {
    const t = (now - (since(o, 'assigned') ?? now)) / 45_000;
    return Math.min(0.92, Math.max(0, t));
  }
  if (o.status === 'picked') {
    const ride = Math.max(45_000, o.distKm * 25_000);
    const t = (now - (since(o, 'picked') ?? now)) / ride;
    return 1 + Math.min(0.92, Math.max(0, t));
  }
  return 0;
}

export function minutesLeft(o: Order, now: number) {
  if (isOver(o.status)) return 0;
  const elapsed = (now - o.createdAt) / 60_000;
  return Math.max(1, Math.ceil(o.etaMin - elapsed));
}

/** A line's product name: the copy saved with the order, else today's catalogue. */
export const lineName = (l: OrderLine) => l.name ?? product(l.pid)?.name ?? l.pid;
export const lineUnit = (l: OrderLine) => l.unit ?? product(l.pid)?.unit ?? '';
export const itemCount = (o: Pick<Order, 'lines'>) => o.lines.reduce((a, l) => a + l.qty, 0);

/** When the order was handed over. Older orders only have it in their history. */
export const deliveredAt = (o: Order) =>
  o.deliveredAt ?? [...o.history].reverse().find((h) => h.status === 'delivered')?.at ?? o.updatedAt;

// ---------- Delivery partner pay ----------

/** Every delivery pays a fixed amount plus a rate for each km ridden. */
export const PAY_BASE = 20;
export const PAY_PER_KM = 5;

/** What a partner earns for riding `pickupKm` to the shop and then `dropKm` to the customer. */
export const partnerPay = (pickupKm: number, dropKm: number) => Math.round(PAY_BASE + PAY_PER_KM * (pickupKm + dropKm));

/** The pay for a delivery. Orders delivered before pay was recorded count only the ride to the customer. */
export const payOf = (o: Order) => o.partnerPay ?? partnerPay(o.pickupKm ?? 0, o.distKm);
