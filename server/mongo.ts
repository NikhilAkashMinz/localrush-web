// The MongoDB database. Used when MONGODB_URI is set, for example:
//   MONGODB_URI=mongodb://localhost:27017/localrush
//
// Collections: products, stores, inventory, users, orders, counters.
// The two operations that must never race (taking stock, claiming a delivery) are each a
// single conditional update, so the database itself decides who wins.

import type { Collection, Db, MongoClient } from 'mongodb';
import type { Product, Stock, Store } from '../lib/data';
import { stockKey } from '../lib/data';
import type { Order } from '../lib/orders';
import { seedCatalogue, seedUsers } from './seed';
import type { OrderFilter, Repo, User } from './types';

type WithId<T> = T & { _id: string };
type InventoryDoc = { _id: string; storeId: string; productId: string; price: number; stock: number };
type CounterDoc = { _id: string; v: number };

function strip<T>(doc: WithId<T> | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as unknown as T;
}

/** Fill an empty database with the sample catalogue and demo accounts. Safe to run twice. */
async function seedIfEmpty(db: Db) {
  const stores = db.collection<WithId<Store>>('stores');
  if ((await stores.estimatedDocumentCount()) > 0) return;
  const seed = seedCatalogue();
  const ignoreDuplicates = (e: unknown) => {
    // Another copy of the server seeded at the same moment; its rows are the same as ours.
    if ((e as { code?: number }).code !== 11000) throw e;
  };
  await Promise.all([
    stores.insertMany(seed.stores.map((s) => ({ ...s, _id: s.id })), { ordered: false }).catch(ignoreDuplicates),
    db
      .collection<WithId<Product>>('products')
      .insertMany(seed.products.map((p) => ({ ...p, _id: p.id })), { ordered: false })
      .catch(ignoreDuplicates),
    db
      .collection<InventoryDoc>('inventory')
      .insertMany(
        Object.entries(seed.stock).map(([key, s]) => {
          const [storeId, productId] = key.split('|');
          return { _id: key, storeId, productId, price: s.price, stock: s.stock };
        }),
        { ordered: false },
      )
      .catch(ignoreDuplicates),
    db
      .collection<WithId<User>>('users')
      .insertMany(seedUsers().map((u) => ({ ...u, _id: u.id })), { ordered: false })
      .catch(ignoreDuplicates),
  ]);
}

/** `reset` empties the database first. Only the tests use it. */
export async function createMongoRepo(uri: string, options: { reset?: boolean } = {}): Promise<Repo> {
  const { MongoClient: Client } = await import('mongodb');
  const client: MongoClient = new Client(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
  } catch (e) {
    await client.close().catch(() => undefined);
    throw e;
  }
  const db = client.db();
  if (options.reset) await db.dropDatabase();

  const products: Collection<WithId<Product>> = db.collection('products');
  const stores: Collection<WithId<Store>> = db.collection('stores');
  const inventory: Collection<InventoryDoc> = db.collection('inventory');
  const users: Collection<WithId<User>> = db.collection('users');
  const orders: Collection<WithId<Order>> = db.collection('orders');
  const counters: Collection<CounterDoc> = db.collection('counters');

  await Promise.all([
    users.createIndex({ phone: 1 }, { unique: true }),
    orders.createIndex({ customerId: 1, createdAt: -1 }),
    orders.createIndex({ storeId: 1, createdAt: -1 }),
    orders.createIndex({ status: 1, partnerId: 1 }),
    inventory.createIndex({ storeId: 1 }),
  ]);
  await seedIfEmpty(db);

  return {
    kind: 'mongo',
    async ping() {
      try {
        await db.command({ ping: 1 });
        return true;
      } catch {
        return false;
      }
    },
    close: () => client.close(),

    async dataset() {
      const [p, s, inv] = await Promise.all([
        products.find().toArray(),
        stores.find().toArray(),
        inventory.find().toArray(),
      ]);
      const stock: Record<string, Stock> = {};
      for (const row of inv) stock[row._id] = { price: row.price, stock: row.stock };
      return {
        products: p.map((d) => strip<Product>(d)!),
        stores: s.map((d) => strip<Store>(d)!),
        stock,
      };
    },
    async patchStore(id, patch) {
      await stores.updateOne({ _id: id }, { $set: patch });
    },
    async putProduct(p) {
      await products.replaceOne({ _id: p.id }, { ...p }, { upsert: true });
    },
    async putStock(storeId, productId, value) {
      const _id = stockKey(storeId, productId);
      await inventory.replaceOne({ _id }, { storeId, productId, price: value.price, stock: value.stock }, { upsert: true });
    },
    async takeStock(storeId, productId, qty) {
      const result = await inventory.updateOne(
        { _id: stockKey(storeId, productId), stock: { $gte: qty } },
        { $inc: { stock: -qty } },
      );
      return result.modifiedCount === 1;
    },
    async giveStock(storeId, productId, qty) {
      await inventory.updateOne({ _id: stockKey(storeId, productId) }, { $inc: { stock: qty } });
    },

    async userByPhone(phone) {
      return strip<User>(await users.findOne({ phone }));
    },
    async userById(id) {
      return strip<User>(await users.findOne({ _id: id }));
    },
    async putUser(u) {
      await users.replaceOne({ _id: u.id }, { ...u }, { upsert: true });
    },

    async insertOrder(o) {
      await orders.insertOne({ ...o, _id: o.id });
    },
    async orderById(id) {
      return strip<Order>(await orders.findOne({ _id: id }));
    },
    async orders(f: OrderFilter) {
      const query: Record<string, unknown> = {};
      if (f.customerId !== undefined) query.customerId = f.customerId;
      if (f.storeId !== undefined) query.storeId = f.storeId;
      if (f.partnerId !== undefined) query.partnerId = f.partnerId;
      if (f.statuses !== undefined) query.status = { $in: f.statuses };
      if (f.unassigned) query.partnerId = null;
      if (f.since !== undefined) query.createdAt = { $gte: f.since };
      const docs = await orders.find(query).sort({ createdAt: -1 }).limit(300).toArray();
      return docs.map((d) => strip<Order>(d)!);
    },
    async moveOrder(id, from, patch, entry, onlyIfUnassigned) {
      const query: Record<string, unknown> = { _id: id, status: { $in: from } };
      if (onlyIfUnassigned) query.partnerId = null;
      const doc = await orders.findOneAndUpdate(
        query,
        { $set: { ...patch, updatedAt: entry.at }, $push: { history: entry } },
        { returnDocument: 'after' },
      );
      return strip<Order>(doc);
    },

    async bump(channels) {
      await Promise.all(channels.map((c) => counters.updateOne({ _id: c }, { $inc: { v: 1 } }, { upsert: true })));
    },
    async versions(channels) {
      const docs = await counters.find({ _id: { $in: channels } }).toArray();
      const byId = new Map(docs.map((d) => [d._id, d.v]));
      return channels.map((c) => byId.get(c) ?? 0);
    },
  };
}
