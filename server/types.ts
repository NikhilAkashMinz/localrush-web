// Types used by the server. The website has its own, smaller view of a user in lib/api.ts.

import type { Dataset, Place, Product, Stock, Store } from '../lib/data';
import type { Order, Status } from '../lib/orders';

export type Role = 'customer' | 'shop' | 'partner';

export type Address = { id: string; tag: string; line: string; place: Place };

/** One GPS position on a delivery partner's way, and when it was taken. */
export type TrailPoint = { lat: number; lng: number; at: number };

export type User = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  /** Shop owners: the shop they run. */
  storeId?: string;
  /** Delivery partners: whether they are taking deliveries, and roughly where they are. */
  online?: boolean;
  place?: Place;
  /**
   * Delivery partners: when `place` last came from their phone's GPS. Not set when they chose
   * an area from the list instead. The customer is shown a GPS position only while it is fresh.
   */
  gpsAt?: number;
  /**
   * Delivery partners: the GPS positions of the delivery under way, oldest first, so the
   * customer's map can draw the way the partner has come. Cleared when no delivery is under way.
   */
  trail?: TrailPoint[];
  addresses: Address[];
  createdAt: number;
};

export type OrderFilter = {
  customerId?: string;
  /** A customer's orders are found by mobile number, so history follows the number. */
  customerPhone?: string;
  storeId?: string;
  partnerId?: string;
  statuses?: Status[];
  unassigned?: boolean;
  since?: number;
  /** Most orders to return, newest first. 300 if not given; 0 means all (for reports). */
  limit?: number;
};

export type HistoryEntry = { status: Status; at: number; note?: string };

/**
 * Everything the server needs from a database. There are two implementations: one that
 * keeps data in memory (for running without a database, and for tests) and one for MongoDB.
 */
export interface Repo {
  kind: 'memory' | 'mongo';
  ping(): Promise<boolean>;
  /** Let go of the database connection. Used by the tests. */
  close(): Promise<void>;

  dataset(): Promise<Omit<Dataset, 'rev'>>;
  patchStore(id: string, patch: Partial<Pick<Store, 'paused'>>): Promise<void>;
  putProduct(p: Product): Promise<void>;
  putStock(storeId: string, productId: string, stock: Stock): Promise<void>;
  /** Take `qty` from stock only if that many are left. Returns false, changing nothing, if not. */
  takeStock(storeId: string, productId: string, qty: number): Promise<boolean>;
  giveStock(storeId: string, productId: string, qty: number): Promise<void>;

  userByPhone(phone: string): Promise<User | null>;
  userById(id: string): Promise<User | null>;
  putUser(u: User): Promise<void>;

  insertOrder(o: Order): Promise<void>;
  orderById(id: string): Promise<Order | null>;
  orders(filter: OrderFilter): Promise<Order[]>;
  /**
   * Change an order only if its status is still one of `from` (and, when asked, nobody has
   * claimed it). Returns the updated order, or null if someone else got there first.
   */
  moveOrder(id: string, from: Status[], patch: Partial<Order>, entry: HistoryEntry, onlyIfUnassigned?: boolean): Promise<Order | null>;

  /** Counters that go up whenever something on a channel changes; the live stream watches them. */
  bump(channels: string[]): Promise<void>;
  versions(channels: string[]): Promise<number[]>;

  /**
   * A saved copy of something slow to fetch from elsewhere (real shops from OpenStreetMap),
   * with when it was fetched. Kept in the database so it survives a restart.
   */
  getCached<T>(key: string): Promise<{ at: number; value: T } | null>;
  putCached<T>(key: string, value: T, at: number): Promise<void>;
}
