// The shapes the LocalRush server sends. They match the website's (lib/orders.ts, lib/api.ts,
// lib/reports.ts); only the fields the partner app uses are listed.

export type Place = { label: string; sub: string; lat: number; lng: number };

/** The logged-in delivery partner. */
export type Me = {
  id: string;
  name: string;
  phone: string;
  role: 'customer' | 'shop' | 'partner';
  online?: boolean;
  place?: Place;
};

export type Status = 'placed' | 'accepted' | 'packed' | 'assigned' | 'picked' | 'delivered' | 'rejected' | 'cancelled';

export type OrderLine = { pid: string; qty: number; price: number; name?: string; unit?: string };

export type Order = {
  id: string;
  customerName: string;
  /** Empty on a job nobody has taken yet. */
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
  /** From the shop to the customer, by road. */
  distKm: number;
  status: Status;
  partnerId: string | null;
  partnerName: string | null;
  /** From the partner to the shop, measured when they took the delivery. */
  pickupKm?: number;
  /** What the partner earns for this delivery. */
  partnerPay?: number;
  deliveredAt?: number;
  history: { status: Status; at: number; note?: string }[];
  createdAt: number;
  updatedAt: number;
};

/** A packed order waiting for a partner, with how far it is from this partner and what it pays. */
export type Job = Order & { pickupKm: number; partnerPay: number };

export type Period = 'today' | 'week' | 'all';

export type EarningsTotals = { deliveries: number; earned: number; km: number; cash: number };

export type EarningsReport = {
  period: Period;
  totals: Record<Period, EarningsTotals>;
  /** Pay for the delivery under way: earned once it is handed over. */
  pending: number;
  /** Delivered orders in the chosen period, newest first. */
  orders: Order[];
};

/** What the app needs to know about a LocalRush shop: where it is, for directions. */
export type Shop = { id: string; name: string; area: string; lat: number; lng: number };

export type DemoAccount = { role: 'shop' | 'partner'; name: string; phone: string };

export type Health = { status: string; version?: string; storage?: string; database?: string };
