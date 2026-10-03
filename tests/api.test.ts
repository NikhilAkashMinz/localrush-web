// Tests for the backend, run through the real HTTP handler.
// They cover the rules that matter most: roles, the order steps, stock, and delivery claims.
//
// By default they use the in-memory database. To run the same tests against a real MongoDB,
// point TEST_MONGODB_URI at a database you do not mind being emptied before every test:
//   TEST_MONGODB_URI=mongodb://localhost:27017/localrush_test npm test

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { PLACES, stockKey } from '../lib/data';
import type { Order } from '../lib/orders';
import { SAMPLE } from '../lib/sample';
import { handle } from '../server/api';
import { clock } from '../server/clock';
import { createMongoRepo } from '../server/mongo';
import { useFreshMemoryRepo, useRepo } from '../server/repo';
import { ownerPhone, partnerPhone } from '../server/seed';
import type { Repo } from '../server/types';

const PES = PLACES[0];
const WHITEFIELD = PLACES.find((p) => p.label === 'Whitefield')!;
let repo: Repo;

const MONGO = process.env.TEST_MONGODB_URI;

beforeEach(async () => {
  repo = MONGO ? useRepo(await createMongoRepo(MONGO, { reset: true })) : useFreshMemoryRepo();
  // 11 am in India, when every sample shop is open.
  clock.now = () => new Date('2026-01-05T11:00:00+05:30').getTime();
});

afterEach(() => repo.close());

type Reply<T = any> = { status: number; data: T; cookie: string };

async function call<T = any>(method: string, path: string, opts: { as?: string; body?: unknown } = {}): Promise<Reply<T>> {
  const response = await handle(
    new Request('http://test.local/api/' + path, {
      method,
      headers: { 'content-type': 'application/json', ...(opts.as ? { cookie: opts.as } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { status: response.status, data: (await response.json()) as T, cookie: setCookie.split(';')[0] };
}

async function loginAs(phone: string, name = 'Asha Rao') {
  const r = await call('POST', 'auth/login', { body: { name, phone, code: '1234' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}

const ownerOf = (storeId: string) => loginAs(ownerPhone(SAMPLE.stores.findIndex((s) => s.id === storeId)));

const order = (cart: Record<string, number>, as: string, place = PES) =>
  call<{ orders: Order[]; leftOut: string[]; error?: string; code?: string }>('POST', 'orders', {
    as,
    body: { cart, place, line: 'Room 214, Boys Hostel Block B', tag: 'Hostel', payment: 'cod', mode: 'balanced' },
  });

const stockOf = async (storeId: string, pid: string) => (await repo.dataset()).stock[stockKey(storeId, pid)]?.stock;

async function packedOrder() {
  const customer = await loginAs('9876543210');
  const placed = (await order({ chips: 1 }, customer)).data.orders[0];
  const shop = await ownerOf(placed.storeId);
  assert.equal((await call('POST', `orders/${placed.id}/accept`, { as: shop })).status, 200);
  assert.equal((await call('POST', `orders/${placed.id}/pack`, { as: shop })).status, 200);
  return { customer, shop, placed };
}

async function onlinePartner(index: number, place = PES) {
  const cookie = await loginAs(partnerPhone(index));
  assert.equal((await call('PUT', 'partner', { as: cookie, body: { online: true, place } })).status, 200);
  return cookie;
}

test('the catalogue is public and starts with the sample shops and products', async () => {
  const r = await call('GET', 'catalog');
  assert.equal(r.status, 200);
  assert.equal(r.data.stores.length, SAMPLE.stores.length);
  assert.equal(r.data.products.length, SAMPLE.products.length);
  assert.equal((await call('GET', 'me')).data.user, null);
});

test('logging in creates a customer, and the session cookie cannot be forged', async () => {
  const cookie = await loginAs('9876543210', 'Asha Rao');
  const me = await call('GET', 'me', { as: cookie });
  assert.equal(me.data.user.name, 'Asha Rao');
  assert.equal(me.data.user.role, 'customer');

  const forged = cookie.replace(/\.[^.]+$/, '.not-the-real-signature');
  assert.equal((await call('GET', 'me', { as: forged })).data.user, null);
  assert.equal((await call('GET', 'orders', { as: forged })).status, 401);
});

test('login checks the phone number, the code and the name', async () => {
  assert.equal((await call('POST', 'auth/login', { body: { name: 'A B', phone: '12345', code: '1234' } })).status, 400);
  assert.equal((await call('POST', 'auth/login', { body: { name: 'A B', phone: '9876543210', code: '12' } })).status, 400);
  assert.equal((await call('POST', 'auth/login', { body: { phone: '9876543210', code: '1234' } })).status, 400);
});

test('shop owners and delivery partners log in with their registered numbers', async () => {
  const shop = await call('GET', 'me', { as: await ownerOf('s-lakshmi') });
  assert.equal(shop.data.user.role, 'shop');
  assert.equal(shop.data.user.storeId, 's-lakshmi');
  const partner = await call('GET', 'me', { as: await loginAs(partnerPhone(0)) });
  assert.equal(partner.data.user.role, 'partner');
});

test('placing an order takes stock, saves the address and is private to that customer', async () => {
  const customer = await loginAs('9876543210');
  const r = await order({ chips: 2, milk: 1 }, customer);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  for (const o of r.data.orders) {
    assert.equal(o.status, 'placed');
    assert.match(o.otp!, /^\d{4}$/);
    for (const l of o.lines) {
      const before = SAMPLE.stock[stockKey(o.storeId, l.pid)].stock;
      assert.equal(await stockOf(o.storeId, l.pid), before - l.qty);
    }
  }
  const me = await call('GET', 'me', { as: customer });
  assert.equal(me.data.user.addresses.length, 1);

  const mine = await call('GET', 'orders', { as: customer });
  assert.equal(mine.data.orders.length, r.data.orders.length);

  const stranger = await loginAs('9123456780', 'Someone Else');
  assert.equal((await call('GET', `orders/${r.data.orders[0].id}`, { as: stranger })).status, 404);
  assert.equal((await call('GET', 'orders', { as: stranger })).data.orders.length, 0);
});

test('you must be logged in as a customer to order', async () => {
  assert.equal((await order({ chips: 1 }, '')).status, 401);
  assert.equal((await order({ chips: 1 }, await ownerOf('s-lakshmi'))).status, 403);
});

test('an order outside every shop\'s 5 km is refused', async () => {
  const customer = await loginAs('9876543210');
  const r = await order({ milk: 1 }, customer, WHITEFIELD);
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'unavailable');
});

test('two customers cannot both buy the last one', async () => {
  for (const s of SAMPLE.stores) {
    if (SAMPLE.stock[stockKey(s.id, 'milk')]) await repo.putStock(s.id, 'milk', { price: 25, stock: 0 });
  }
  await repo.putStock('s-lakshmi', 'milk', { price: 25, stock: 1 });
  await repo.bump(['catalog']);

  const a = await loginAs('9876543210', 'First Buyer');
  const b = await loginAs('9123456780', 'Second Buyer');
  const results = await Promise.all([order({ milk: 1 }, a), order({ milk: 1 }, b)]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal(await stockOf('s-lakshmi', 'milk'), 0);
});

test('only the right shop can accept, and steps cannot be skipped', async () => {
  const customer = await loginAs('9876543210');
  const placed = (await order({ chips: 1 }, customer)).data.orders[0];
  const other = SAMPLE.stores.find((s) => s.id !== placed.storeId)!;

  assert.equal((await call('POST', `orders/${placed.id}/accept`, { as: customer })).status, 403);
  assert.equal((await call('POST', `orders/${placed.id}/accept`, { as: await ownerOf(other.id) })).status, 403);

  const shop = await ownerOf(placed.storeId);
  assert.equal((await call('POST', `orders/${placed.id}/pack`, { as: shop })).status, 409, 'cannot pack before accepting');
  assert.equal((await call('POST', `orders/${placed.id}/accept`, { as: shop })).data.order.status, 'accepted');
  assert.equal((await call('POST', `orders/${placed.id}/accept`, { as: shop })).status, 409, 'cannot accept twice');
  assert.equal((await call('POST', `orders/${placed.id}/pack`, { as: shop })).data.order.status, 'packed');

  const seen = await call('GET', 'orders', { as: shop });
  assert.equal(seen.data.orders[0].otp, undefined, 'the shop never sees the door code');
});

test('when two partners tap the same delivery, exactly one gets it', async () => {
  const { placed } = await packedOrder();
  const p1 = await onlinePartner(0);
  const p2 = await onlinePartner(1);

  const jobs = await call('GET', 'orders', { as: p1 });
  assert.equal(jobs.data.available.length, 1);
  assert.equal(jobs.data.available[0].otp, undefined);
  assert.equal(jobs.data.available[0].customerPhone, '');

  const claims = await Promise.all([
    call('POST', `orders/${placed.id}/claim`, { as: p1 }),
    call('POST', `orders/${placed.id}/claim`, { as: p2 }),
  ]);
  assert.deepEqual(claims.map((c) => c.status).sort(), [200, 409]);
  assert.equal(claims.find((c) => c.status === 409)!.data.code, 'taken');
  assert.equal((await call('GET', 'orders', { as: p2 })).data.available.length, 0);
});

test('a partner must be online, in range, and free to take a delivery', async () => {
  const { placed } = await packedOrder();
  const offline = await loginAs(partnerPhone(0));
  assert.equal((await call('POST', `orders/${placed.id}/claim`, { as: offline })).status, 409);

  const far = await onlinePartner(1, WHITEFIELD);
  assert.equal((await call('GET', 'orders', { as: far })).data.available.length, 0);

  const near = await onlinePartner(2);
  assert.equal((await call('POST', `orders/${placed.id}/claim`, { as: near })).status, 200);

  const second = await packedOrder();
  const busy = await call('POST', `orders/${second.placed.id}/claim`, { as: near });
  assert.equal(busy.status, 409);
  assert.equal(busy.data.code, 'busy');
});

test('delivery needs the customer\'s door code', async () => {
  const { customer, placed } = await packedOrder();
  const partner = await onlinePartner(0);
  await call('POST', `orders/${placed.id}/claim`, { as: partner });
  assert.equal((await call('POST', `orders/${placed.id}/deliver`, { as: partner, body: { otp: placed.otp } })).status, 409, 'not picked up yet');
  assert.equal((await call('POST', `orders/${placed.id}/pickup`, { as: partner })).data.order.status, 'picked');

  const wrong = placed.otp === '0000' ? '1111' : '0000';
  const bad = await call('POST', `orders/${placed.id}/deliver`, { as: partner, body: { otp: wrong } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.code, 'otp');

  const good = await call('POST', `orders/${placed.id}/deliver`, { as: partner, body: { otp: placed.otp } });
  assert.equal(good.data.order.status, 'delivered');

  const final = await call('GET', `orders/${placed.id}`, { as: customer });
  assert.deepEqual(final.data.order.history.map((h: { status: string }) => h.status), ['placed', 'accepted', 'packed', 'assigned', 'picked', 'delivered']);
});

test('a rejected order moves to the next-best shop, with stock put back', async () => {
  const customer = await loginAs('9876543210');
  const placed = (await order({ chips: 1 }, customer)).data.orders[0];
  const first = placed.storeId;
  const before = SAMPLE.stock[stockKey(first, 'chips')].stock;
  assert.equal(await stockOf(first, 'chips'), before - 1);

  const r = await call('POST', `orders/${placed.id}/reject`, { as: await ownerOf(first) });
  assert.equal(r.status, 200);
  assert.equal(r.data.order.status, 'placed');
  assert.notEqual(r.data.order.storeId, first);
  assert.equal(await stockOf(first, 'chips'), before, 'the first shop got its stock back');
  const second = r.data.order.storeId;
  assert.equal(await stockOf(second, 'chips'), SAMPLE.stock[stockKey(second, 'chips')].stock - 1);

  const seenByFirst = await call('GET', 'orders', { as: await ownerOf(first) });
  assert.equal(seenByFirst.data.orders.length, 0, 'the order has left the first shop\'s board');
});

test('an order every nearby shop rejects is closed and its stock returned', async () => {
  const customer = await loginAs('9876543210');
  let current = (await order({ chips: 1 }, customer)).data.orders[0];
  for (let i = 0; i < 20 && current.status === 'placed'; i++) {
    const r = await call('POST', `orders/${current.id}/reject`, { as: await ownerOf(current.storeId) });
    assert.equal(r.status, 200);
    current = r.data.order;
  }
  assert.equal(current.status, 'rejected');
  for (const s of SAMPLE.stores) {
    const original = SAMPLE.stock[stockKey(s.id, 'chips')];
    if (original) assert.equal(await stockOf(s.id, 'chips'), original.stock);
  }
});

test('a customer can cancel only before the shop accepts', async () => {
  const customer = await loginAs('9876543210');
  const a = (await order({ chips: 1 }, customer)).data.orders[0];
  const before = SAMPLE.stock[stockKey(a.storeId, 'chips')].stock;
  assert.equal((await call('POST', `orders/${a.id}/cancel`, { as: customer })).data.order.status, 'cancelled');
  assert.equal(await stockOf(a.storeId, 'chips'), before);

  const b = (await order({ chips: 1 }, customer)).data.orders[0];
  await call('POST', `orders/${b.id}/accept`, { as: await ownerOf(b.storeId) });
  assert.equal((await call('POST', `orders/${b.id}/cancel`, { as: customer })).status, 409);
});

test('a shop owner can change price and stock, within the rules', async () => {
  const shop = await ownerOf('s-lakshmi');
  const mrp = SAMPLE.products.find((p) => p.id === 'milk')!.mrp;
  assert.equal((await call('PUT', 'shop/stock', { as: shop, body: { pid: 'milk', price: mrp + 5, stock: 10 } })).status, 400, 'above MRP');
  assert.equal((await call('PUT', 'shop/stock', { as: shop, body: { pid: 'milk', price: 20, stock: -1 } })).status, 400);
  assert.equal((await call('PUT', 'shop/stock', { as: await loginAs('9876543210'), body: { pid: 'milk', price: 20, stock: 5 } })).status, 403);

  const before = (await call('GET', 'catalog')).data.rev;
  assert.equal((await call('PUT', 'shop/stock', { as: shop, body: { pid: 'milk', price: 20, stock: 5 } })).status, 200);
  const after = (await call('GET', 'catalog')).data;
  assert.ok(after.rev > before, 'the catalogue version went up');
  assert.deepEqual(after.stock[stockKey('s-lakshmi', 'milk')], { price: 20, stock: 5 });
});

test('a shop owner can add a new product, and customers can then order it', async () => {
  const shop = await ownerOf('s-lakshmi');
  const bad = await call('POST', 'shop/products', { as: shop, body: { name: 'Jaggery', unit: '500 g', cat: 'nope', mrp: 60, stock: 5 } });
  assert.equal(bad.status, 400);
  const made = await call('POST', 'shop/products', { as: shop, body: { name: 'Organic jaggery', unit: '500 g', cat: 'staples', mrp: 60, price: 55, stock: 5 } });
  assert.equal(made.status, 201);
  const pid = made.data.product.id as string;

  const r = await order({ [pid]: 2 }, await loginAs('9876543210'));
  assert.equal(r.status, 201);
  assert.equal(r.data.orders[0].storeId, 's-lakshmi');
  assert.equal(r.data.orders[0].lines[0].price, 55);
  assert.equal(await stockOf('s-lakshmi', pid), 3);
});

test('a paused shop gets no new orders', async () => {
  const customer = await loginAs('9876543210');
  const first = (await order({ chips: 1 }, customer)).data.orders[0].storeId;
  assert.equal((await call('PUT', 'shop/paused', { as: await ownerOf(first), body: { paused: true } })).status, 200);
  const next = (await order({ chips: 1 }, customer)).data.orders[0];
  assert.notEqual(next.storeId, first);
});

test('a busy shop looks busier to the store selection', async () => {
  const customer = await loginAs('9876543210');
  const placed = (await order({ chips: 1 }, customer)).data.orders[0];
  const shops = (await call('GET', 'catalog')).data.stores as { id: string; busy: number }[];
  assert.equal(shops.find((s) => s.id === placed.storeId)!.busy, 1);
});

test('the live stream tells a customer when their order moves on', async () => {
  const customer = await loginAs('9876543210');
  const placed = (await order({ chips: 1 }, customer)).data.orders[0];
  const shop = await ownerOf(placed.storeId);

  const response = await handle(new Request('http://test.local/api/live', { headers: { cookie: customer } }));
  const reader = response.body!.getReader();
  try {
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const decoder = new TextDecoder();
    let seen = '';
    const until = async (text: string) => {
      const deadline = Date.now() + 5000;
      while (!seen.includes(text) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value);
      }
      assert.ok(seen.includes(text), `stream should contain ${text}, got: ${seen}`);
    };
    await until('"hello":true');
    await call('POST', `orders/${placed.id}/accept`, { as: shop });
    await until('"orders"');
  } finally {
    // What a server does when the browser disconnects.
    await reader.cancel();
  }
});

test('unknown addresses and bad JSON get clear errors', async () => {
  assert.equal((await call('GET', 'nothing-here')).status, 404);
  const response = await handle(new Request('http://test.local/api/auth/login', { method: 'POST', body: '{not json' }));
  assert.equal(response.status, 400);
});
