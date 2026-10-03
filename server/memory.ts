// The in-memory database. Used when no MONGODB_URI is set, and by the tests.
// Data lives only as long as the server process, and is not shared between copies of it.

import type { Product, Stock, Store } from '../lib/data';
import { stockKey } from '../lib/data';
import type { Order } from '../lib/orders';
import { seedCatalogue, seedUsers } from './seed';
import type { OrderFilter, Repo, User } from './types';

const copy = <T>(v: T): T => structuredClone(v);

export function createMemoryRepo(): Repo {
  const seed = seedCatalogue();
  const products = new Map<string, Product>(seed.products.map((p) => [p.id, p]));
  const stores = new Map<string, Store>(seed.stores.map((s) => [s.id, s]));
  const stock = new Map<string, Stock>(Object.entries(seed.stock));
  const users = new Map<string, User>(seedUsers().map((u) => [u.id, u]));
  const orders = new Map<string, Order>();
  const counters = new Map<string, number>();

  return {
    kind: 'memory',
    ping: async () => true,
    close: async () => undefined,

    async dataset() {
      return copy({ products: [...products.values()], stores: [...stores.values()], stock: Object.fromEntries(stock) });
    },
    async patchStore(id, patch) {
      const s = stores.get(id);
      if (s) stores.set(id, { ...s, ...patch });
    },
    async putProduct(p) {
      products.set(p.id, copy(p));
    },
    async putStock(storeId, productId, value) {
      stock.set(stockKey(storeId, productId), { ...value });
    },
    async takeStock(storeId, productId, qty) {
      const key = stockKey(storeId, productId);
      const s = stock.get(key);
      if (!s || s.stock < qty) return false;
      stock.set(key, { ...s, stock: s.stock - qty });
      return true;
    },
    async giveStock(storeId, productId, qty) {
      const key = stockKey(storeId, productId);
      const s = stock.get(key);
      if (s) stock.set(key, { ...s, stock: s.stock + qty });
    },

    async userByPhone(phone) {
      for (const u of users.values()) if (u.phone === phone) return copy(u);
      return null;
    },
    async userById(id) {
      const u = users.get(id);
      return u ? copy(u) : null;
    },
    async putUser(u) {
      users.set(u.id, copy(u));
    },

    async insertOrder(o) {
      orders.set(o.id, copy(o));
    },
    async orderById(id) {
      const o = orders.get(id);
      return o ? copy(o) : null;
    },
    async orders(f: OrderFilter) {
      const out = [...orders.values()].filter(
        (o) =>
          (f.customerId === undefined || o.customerId === f.customerId) &&
          (f.storeId === undefined || o.storeId === f.storeId) &&
          (f.partnerId === undefined || o.partnerId === f.partnerId) &&
          (f.statuses === undefined || f.statuses.includes(o.status)) &&
          (!f.unassigned || o.partnerId === null) &&
          (f.since === undefined || o.createdAt >= f.since),
      );
      return copy(out.sort((a, b) => b.createdAt - a.createdAt));
    },
    async moveOrder(id, from, patch, entry, onlyIfUnassigned) {
      const o = orders.get(id);
      if (!o || !from.includes(o.status)) return null;
      if (onlyIfUnassigned && o.partnerId !== null) return null;
      const next: Order = { ...o, ...patch, history: [...o.history, entry], updatedAt: entry.at };
      orders.set(id, next);
      return copy(next);
    },

    async bump(channels) {
      for (const c of channels) counters.set(c, (counters.get(c) ?? 0) + 1);
    },
    async versions(channels) {
      return channels.map((c) => counters.get(c) ?? 0);
    },
  };
}
