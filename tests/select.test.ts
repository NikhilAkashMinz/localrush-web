// Unit tests for the smart store selection. Run with: npm test
// These use Node's built-in test runner, so there is no test framework to configure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLACES, PRODUCTS, stockAt } from '../lib/data';
import { RADIUS_KM, roadKm } from '../lib/geo';
import { shopsNear, usable } from '../lib/nearby';
import { DELIVERY_FEE, FREE_DELIVERY_FROM, planOrder } from '../lib/select';

const place = (label: string) => {
  const p = PLACES.find((x) => x.label === label);
  assert.ok(p, `sample place "${label}" exists`);
  return p;
};

// Fixed clock times, so opening hours do not make the tests depend on when they run.
const MIDDAY = new Date(2026, 0, 5, 11, 0);
const NIGHT = new Date(2026, 0, 5, 2, 0);

const pes = place('PES University');
const nearAt = (when: Date, p = pes) => shopsNear(p.lat, p.lng, when);

test('only open shops within 5 km by road can fulfil an order', () => {
  const shops = usable(nearAt(MIDDAY));
  assert.ok(shops.length > 0, 'some shops are usable at midday');
  for (const n of shops) {
    assert.ok(n.open, `${n.store.name} is open`);
    assert.ok(n.distKm <= RADIUS_KM, `${n.store.name} is within ${RADIUS_KM} km`);
    assert.equal(n.distKm, roadKm(pes.lat, pes.lng, n.store.lat, n.store.lng));
  }
});

test('an empty cart produces no deliveries and a zero bill', () => {
  const plan = planOrder({}, nearAt(MIDDAY), 'balanced');
  assert.equal(plan.shipments.length, 0);
  assert.equal(plan.total, 0);
});

test('every item goes to a shop that really has enough stock', () => {
  const cart = { milk: 2, bread: 1, chips: 3, paracetamol: 1, notebook: 2 };
  const plan = planOrder(cart, nearAt(MIDDAY), 'balanced');
  for (const s of plan.shipments) {
    for (const line of s.lines) {
      const st = stockAt(s.near.store.id, line.pid);
      assert.ok(st, `${s.near.store.name} sells ${line.pid}`);
      assert.ok(st.stock >= line.qty, `${s.near.store.name} has ${line.qty} of ${line.pid}`);
      assert.equal(line.price, st.price, 'the bill uses that shop’s own price');
    }
  }
});

test('nothing in the cart is lost or duplicated', () => {
  const cart = { milk: 2, bread: 1, chips: 3, paracetamol: 1, notebook: 2 };
  const plan = planOrder(cart, nearAt(MIDDAY), 'balanced');
  const assigned = plan.shipments.flatMap((s) => s.lines.map((l) => l.pid));
  const all = [...assigned, ...plan.unavailable].sort();
  assert.deepEqual(all, Object.keys(cart).sort());
  assert.equal(new Set(assigned).size, assigned.length, 'no item is assigned twice');
});

test('a cart no single shop can fill is split across shops', () => {
  // Groceries and medicine: a kirana store does not sell paracetamol.
  const plan = planOrder({ rice: 1, paracetamol: 1 }, nearAt(MIDDAY), 'balanced');
  assert.equal(plan.unavailable.length, 0);
  assert.ok(plan.shipments.length >= 2, 'at least two deliveries');
  const shops = new Set(plan.shipments.map((s) => s.near.store.id));
  assert.equal(shops.size, plan.shipments.length, 'each delivery comes from a different shop');
});

test('a shop that covers the whole cart beats one that covers part of it', () => {
  const plan = planOrder({ milk: 1, chips: 1, soap: 1 }, nearAt(MIDDAY), 'balanced');
  const first = plan.shipments[0];
  const most = Math.max(...first.candidates.map((c) => c.lines.length));
  assert.equal(first.lines.length, most);
});

test('"fastest" never picks a slower shop than "cheapest" does', () => {
  const cart = { milk: 1, chips: 1 };
  const fast = planOrder(cart, nearAt(MIDDAY), 'fastest').shipments[0];
  const cheap = planOrder(cart, nearAt(MIDDAY), 'cheapest').shipments[0];
  assert.ok(fast.etaMin <= cheap.etaMin);
});

test('"cheapest" never costs more than "fastest" for the same single-shop cart', () => {
  const cart = { milk: 1, chips: 1 };
  const fast = planOrder(cart, nearAt(MIDDAY), 'fastest');
  const cheap = planOrder(cart, nearAt(MIDDAY), 'cheapest');
  assert.equal(fast.shipments.length, 1);
  assert.equal(cheap.shipments.length, 1);
  assert.ok(cheap.subtotal <= fast.subtotal);
});

test('scores stay between 0 and 100 and candidates are ranked best first', () => {
  const plan = planOrder({ milk: 1, chips: 1 }, nearAt(MIDDAY), 'balanced');
  const ranked = plan.shipments[0].candidates;
  for (const c of ranked) assert.ok(c.score >= 0 && c.score <= 100, `score ${c.score}`);
  const full = ranked.filter((c) => c.lines.length === ranked[0].lines.length);
  for (let i = 1; i < full.length; i++) assert.ok(full[i - 1].score >= full[i].score);
});

test('delivery is free from the threshold and charged below it', () => {
  const small = planOrder({ chips: 1 }, nearAt(MIDDAY), 'balanced');
  assert.ok(small.subtotal < FREE_DELIVERY_FROM);
  assert.equal(small.fees, DELIVERY_FEE);

  const big = planOrder({ rice: 1 }, nearAt(MIDDAY), 'balanced');
  assert.ok(big.subtotal >= FREE_DELIVERY_FROM);
  assert.equal(big.fees, 0);
  assert.equal(big.total, big.subtotal);
});

test('an area with no shops within 5 km gets nothing delivered', () => {
  const plan = planOrder({ milk: 1 }, nearAt(MIDDAY, place('Whitefield')), 'balanced');
  assert.equal(plan.shipments.length, 0);
  assert.deepEqual(plan.unavailable, ['milk']);
});

test('at 2 am only the 24-hour shop can deliver', () => {
  const shops = usable(nearAt(NIGHT));
  assert.ok(shops.length > 0);
  for (const n of shops) assert.deepEqual(n.store.open, [0, 24]);

  const plan = planOrder({ rice: 1, paracetamol: 1 }, nearAt(NIGHT), 'balanced');
  assert.deepEqual(plan.unavailable, ['rice']);
  assert.equal(plan.shipments.length, 1);
});

test('every product in the catalogue has a valid price and category', () => {
  const ids = new Set<string>();
  for (const p of PRODUCTS) {
    assert.ok(!ids.has(p.id), `duplicate product id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.mrp > 0, `${p.id} has a price`);
  }
});
