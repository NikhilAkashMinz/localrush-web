// Types used by the server. The website has its own, smaller view of a user in lib/api.ts.

import type { Dataset, Place, Product, Stock, Store } from '../lib/data';
import type { Order, Status } from '../lib/orders';

export type Role = 'customer' | 'shop' | 'partner';

export type Address = { id: string; tag: string; line: string; place: Place };

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
  addresses: Address[];
  createdAt: number;
};

export type OrderFilter = {
  customerId?: string;
  storeId?: string;
  partnerId?: string;
  statuses?: Status[];
  unassigned?: boolean;
  since?: number;
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
}
