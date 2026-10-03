// Orders: the shape shared by the website, the dashboards and the server.

import type { Line } from './select';

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
  customerPhone: string;
  storeId: string;
  storeName: string;
  lines: Line[];
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
