// The shapes the LocalRush server sends. They match the website's (lib/data.ts, lib/orders.ts,
// lib/reports.ts); only the fields the vendor app uses are listed.

/** The logged-in shop owner. */
export type Me = {
  id: string;
  name: string;
  phone: string;
  role: 'customer' | 'shop' | 'partner';
  /** The shop they run. */
  storeId?: string;
};

export type Status = 'placed' | 'accepted' | 'packed' | 'assigned' | 'picked' | 'delivered' | 'rejected' | 'cancelled';

export type OrderLine = { pid: string; qty: number; price: number; name?: string; unit?: string };

export type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  storeId: string;
  storeName: string;
  lines: OrderLine[];
  /** What the items cost: the shop's sale. */
  subtotal: number;
  fee: number;
  total: number;
  address: string;
  payment: 'cod' | 'online';
  status: Status;
  partnerId: string | null;
  partnerName: string | null;
  deliveredAt?: number;
  note?: string;
  history: { status: Status; at: number; note?: string }[];
  createdAt: number;
  updatedAt: number;
};

export type Product = {
  id: string;
  name: string;
  unit: string;
  mrp: number;
  emoji: string;
  cat: string;
  keywords: string;
};

export type Store = {
  id: string;
  name: string;
  kind: string;
  area: string;
  lat: number;
  lng: number;
  /** Opening and closing hour, 24 h clock, Indian time. */
  open: [number, number];
  rating: number;
  /** Set by the shop owner to stop taking orders for a while. */
  paused?: boolean;
};

/** What a shop charges for a product and how many it has. */
export type Stock = { price: number; stock: number };

export type Catalog = {
  rev: number;
  products: Product[];
  stores: Store[];
  /** Keyed by "storeId|productId". A missing key means that shop does not sell that product. */
  stock: Record<string, Stock>;
};

export type NewProduct = { name: string; unit: string; cat: string; mrp: number; price: number; stock: number; emoji: string };

export type Period = 'today' | 'week' | 'all';

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

export type DemoAccount = { role: 'shop' | 'partner'; name: string; phone: string; storeId?: string };

export type Health = { status: string; version?: string; storage?: string; database?: string };
