// Tests for the live service (LOCALRUSH_MODE=live): logging in through Firebase (Google, or an
// email and password), no demo data, no demo accounts, and the admin who adds the real shops
// and partners. Firebase's tokens are signed here with a key made for the test, which the
// server is told to trust instead of Google's. This file runs in its own process (Node's test
// runner does that per file), so the settings below never reach the demo tests in api.test.ts.

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { beforeEach, test } from 'node:test';
import { PLACES } from '../lib/data';
import { handle, resetRateLimits } from '../server/api';
import { clock } from '../server/clock';
import { useFirebaseKeys } from '../server/firebase';
import { useFreshMemoryRepo } from '../server/repo';

const PROJECT = 'localrush-test';
const ADMIN = 'boss@localrush.example';
process.env.LOCALRUSH_MODE = 'live';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.ADMIN_EMAILS = `${ADMIN.toUpperCase()}, other@localrush.example`;

const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
useFirebaseKeys(async () => ({ keys: { k1: google.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, maxAgeMs: 3_600_000 }));

/** A Firebase ID token with these claims, as Firebase would sign it. */
function idToken(claims: Record<string, unknown>, key = google.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const all = {
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: 'firebase-' + String(claims.email ?? claims.phone_number),
    iat: now - 5,
    auth_time: now - 5,
    exp: now + 3600,
    ...claims,
  };
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${part({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${part(all)}`;
  return `${data}.${createSign('RSA-SHA256').update(data).sign(key).toString('base64url')}`;
}

/** What Firebase signs after "Continue with Google": a verified email and the account's name. */
const googleToken = (email: string, name = 'Asha Rao') => idToken({ email, email_verified: true, name });

type Reply = { status: number; data: any; cookie: string; setCookie: string };

async function call(method: string, path: string, opts: { as?: string; seat?: string; body?: unknown } = {}): Promise<Reply> {
  const response = await handle(
    new Request('http://test.local/api/' + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-localrush-seat': opts.seat ?? /^lr_(\w+)=/.exec(opts.as ?? '')?.[1] ?? 'customer',
        ...(opts.as ? { cookie: opts.as } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { status: response.status, data: await response.json(), cookie: setCookie.split(';')[0], setCookie };
}

async function login(email: string, seat = 'customer', name = 'Asha Rao') {
  const r = await call('POST', 'auth/login', { seat, body: { idToken: googleToken(email, name) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}

const PES = PLACES[0];
const orderBody = (extra: Record<string, unknown> = {}) => ({
  cart: { milk: 2 },
  place: PES,
  line: 'Room 214, Boys Hostel Block B',
  tag: 'Hostel',
  payment: 'cod',
  mode: 'balanced',
  ...extra,
});
const shopInput = {
  name: 'Nandini Milk Parlour',
  kind: 'kirana',
  area: 'Banashankari 3rd Stage',
  lat: PES.lat + 0.003,
  lng: PES.lng,
  open: 6,
  close: 22,
  ownerName: 'Ramesh',
  ownerEmail: 'Ramesh.Owner@Gmail.com',
  ownerMobile: '9811111111',
};

/** An admin, one shop with milk in stock, and the admin's cookie. */
async function shopWithMilk() {
  const boss = await login(ADMIN, 'customer', 'Nikhil');
  const made = await call('POST', 'admin/shops', { as: boss, body: shopInput });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const owner = await login('ramesh.owner@gmail.com', 'shop', 'Ramesh');
  assert.equal((await call('PUT', 'shop/stock', { as: owner, body: { pid: 'milk', price: 27, stock: 20 } })).status, 200);
  return { boss, owner, shopId: made.data.shop.id as string };
}

beforeEach(() => {
  resetRateLimits();
  useFreshMemoryRepo();
  // 11 am in India, when the test shop is open.
  clock.now = () => new Date('2026-01-05T11:00:00+05:30').getTime();
});

test('the live service starts with the product catalogue only, and lists no demo accounts', async () => {
  const catalog = (await call('GET', 'catalog')).data;
  assert.ok(catalog.products.length > 0, 'shop owners pick their stock from the catalogue');
  assert.equal(catalog.stores.length, 0, 'no sample shops');
  assert.deepEqual(catalog.stock, {});
  assert.equal((await call('GET', 'demo')).status, 404, 'nobody\'s number is listed');

  const config = (await call('GET', 'config')).data;
  assert.equal(config.mode, 'live');
  assert.equal(config.login, 'firebase');
  assert.equal(config.firebase.projectId, PROJECT);
});

test('demo codes are refused; a Google sign-in logs in, with a secure cookie and the Google name', async () => {
  const demo = await call('POST', 'auth/login', { body: { name: 'Asha', phone: '9876543210', code: '1234' } });
  assert.equal(demo.status, 400);
  assert.equal(demo.data.code, 'firebase-only');

  const r = await call('POST', 'auth/login', { body: { idToken: googleToken('Asha.Rao@Gmail.com', 'Asha Rao') } });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /; Secure/, 'the live login cookie only travels over https');
  const me = (await call('GET', 'me', { as: r.cookie })).data.user;
  assert.equal(me.email, 'asha.rao@gmail.com', 'emails are kept in lower case');
  assert.equal(me.name, 'Asha Rao');
  assert.equal(me.phone, undefined);
  assert.equal(me.admin, undefined);

  // Logging in again finds the same account.
  const again = await login('asha.rao@gmail.com');
  assert.equal((await call('GET', 'me', { as: again })).data.user.id, me.id);
});

test('an email and password account must confirm its email before it can log in', async () => {
  const unconfirmed = await call('POST', 'auth/login', { body: { name: 'Ravi', idToken: idToken({ email: 'ravi@example.com', email_verified: false }) } });
  assert.equal(unconfirmed.status, 401);
  assert.equal(unconfirmed.data.code, 'verify-email');
  assert.equal(unconfirmed.cookie, '');

  // Confirmed, but no name from Google: the name typed on the form is used, and needed.
  const noName = await call('POST', 'auth/login', { body: { idToken: idToken({ email: 'ravi@example.com', email_verified: true }) } });
  assert.equal(noName.status, 400);
  assert.equal(noName.data.code, 'name');
  const ok = await call('POST', 'auth/login', { body: { name: 'Ravi Kumar', idToken: idToken({ email: 'ravi@example.com', email_verified: true }) } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, 'Ravi Kumar');
});

test('forged, foreign and expired sign-ins are refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const attempts = [
    googleToken('asha@gmail.com').replace(/\.[^.]+$/, '.' + Buffer.from('forged').toString('base64url')),
    idToken({ email: 'asha@gmail.com', email_verified: true, name: 'Asha' }, stranger.privateKey),
    idToken({ email: 'asha@gmail.com', email_verified: true, name: 'Asha', aud: 'someone-elses-project' }),
    idToken({ email: 'asha@gmail.com', email_verified: true, name: 'Asha', iss: 'https://securetoken.google.com/x' }),
    idToken({ email: 'asha@gmail.com', email_verified: true, name: 'Asha', exp: now - 3600 }),
    'not.a.token',
  ];
  for (const token of attempts) {
    const r = await call('POST', 'auth/login', { body: { idToken: token } });
    assert.equal(r.status, 401, token.slice(0, 40));
    assert.equal(r.data.code, 'login-failed');
    assert.equal(r.cookie, '');
  }
  // A token with neither an email nor an Indian mobile number proves nothing we can use.
  const abroad = await call('POST', 'auth/login', { body: { name: 'Sam', idToken: idToken({ phone_number: '+14155550100' }) } });
  assert.equal(abroad.status, 401);
});

test('an SMS sign-in still works, for a server that turns it on later', async () => {
  const r = await call('POST', 'auth/login', { body: { name: 'Asha', idToken: idToken({ phone_number: '+919876543210' }) } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.phone, '9876543210');
});

test('an admin adds a shop and a partner by email; they log in and the shop can sell', async () => {
  const customer = await login('asha@gmail.com');
  assert.equal((await call('GET', 'admin', { as: customer })).status, 403, 'customers are not admins');

  const boss = await login(ADMIN, 'customer', 'Nikhil');
  assert.equal((await call('GET', 'me', { as: boss })).data.user.admin, true);

  assert.equal((await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, lat: 0, lng: 0 } })).status, 400, 'needs a location');
  assert.equal((await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, open: 22, close: 6 } })).status, 400, 'closes after it opens');
  assert.equal((await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, ownerEmail: 'not-an-email' } })).status, 400);
  const made = await call('POST', 'admin/shops', { as: boss, body: shopInput });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const shopId = made.data.shop.id as string;
  assert.equal(made.data.shop.rating, 0, 'a new shop has no rating yet');
  assert.equal(made.data.shop.owner.email, 'ramesh.owner@gmail.com');
  assert.equal(made.data.shop.owner.mobile, '9811111111');
  const again = await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, name: 'Another shop', ownerEmail: 'RAMESH.owner@gmail.com' } });
  assert.equal(again.status, 409, 'one email, one account');

  // The owner logs in on the shop dashboard with the email the admin gave, and stocks milk.
  const owner = await login('ramesh.owner@gmail.com', 'shop', 'Ramesh');
  assert.equal((await call('GET', 'me', { as: owner })).data.user.storeId, shopId);
  assert.equal((await call('PUT', 'shop/stock', { as: owner, body: { pid: 'milk', price: 27, stock: 10 } })).status, 200);

  // A customer nearby orders from it, giving the number the partner should call.
  assert.equal((await call('POST', 'orders', { as: customer, body: orderBody() })).data.code, 'mobile', 'a number is needed');
  const placed = await call('POST', 'orders', { as: customer, body: orderBody({ mobile: '9876543210' }) });
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  assert.equal(placed.data.orders[0].storeId, shopId);
  assert.equal(placed.data.orders[0].customerPhone, '9876543210');
  // The number is remembered for next time.
  assert.equal(placed.data.user.mobile, '9876543210');
  assert.equal((await call('POST', 'orders', { as: customer, body: orderBody() })).status, 201);

  // An email that is not an owner cannot use the dashboard, even with a genuine sign-in.
  assert.equal((await call('POST', 'auth/login', { seat: 'shop', body: { idToken: googleToken('someone@gmail.com') } })).status, 404);
  // An owner's email cannot be used to shop as a customer.
  assert.equal((await call('POST', 'auth/login', { body: { idToken: googleToken('ramesh.owner@gmail.com') } })).data.code, 'wrong-seat');

  const partner = await call('POST', 'admin/partners', { as: boss, body: { name: 'Piyush', email: 'piyush@gmail.com', mobile: '9833333333' } });
  assert.equal(partner.status, 201);
  const rider = await login('piyush@gmail.com', 'partner', 'Piyush');
  assert.equal((await call('GET', 'me', { as: rider })).data.user.role, 'partner');

  const list = (await call('GET', 'admin', { as: boss })).data;
  assert.equal(list.shops.length, 1);
  assert.equal(list.shops[0].owner.email, 'ramesh.owner@gmail.com');
  assert.equal(list.partners[0].name, 'Piyush');

  // Pausing the shop from the admin page stops new orders from it.
  assert.equal((await call('PUT', `admin/shops/${shopId}`, { as: boss, body: { ...shopInput, paused: true } })).status, 200);
  assert.equal((await call('POST', 'orders', { as: customer, body: orderBody() })).status, 409);
});

test('order history belongs to the account: a shared delivery number never shows someone else\'s orders', async () => {
  await shopWithMilk();
  const asha = await login('asha@gmail.com', 'customer', 'Asha');
  const placed = await call('POST', 'orders', { as: asha, body: orderBody({ mobile: '9876543210' }) });
  assert.equal(placed.status, 201);

  // Her brother uses the same family phone for deliveries, from his own account.
  const ravi = await login('ravi@gmail.com', 'customer', 'Ravi');
  assert.equal((await call('POST', 'orders', { as: ravi, body: orderBody({ mobile: '9876543210' }) })).status, 201);
  const hers = (await call('GET', 'orders', { as: asha })).data.orders;
  const his = (await call('GET', 'orders', { as: ravi })).data.orders;
  assert.equal(hers.length, 1);
  assert.equal(his.length, 1);
  assert.notEqual(hers[0].id, his[0].id);
  assert.equal((await call('GET', `orders/${hers[0].id}`, { as: ravi })).status, 404);

  // Logging in again later, on any device, brings her history back.
  const later = await login('asha@gmail.com');
  assert.equal((await call('GET', 'orders', { as: later })).data.orders[0].id, hers[0].id);
});

test('an admin can add the labelled sample shops, and give one an owner to run it', async () => {
  const customer = await login('asha@gmail.com');
  assert.equal((await call('POST', 'admin/sample-shops', { as: customer })).status, 403);

  const boss = await login(ADMIN, 'customer', 'Nikhil');
  const first = await call('POST', 'admin/sample-shops', { as: boss });
  assert.equal(first.status, 200);
  assert.equal(first.data.added, 15);
  assert.equal((await call('POST', 'admin/sample-shops', { as: boss })).data.added, 0, 'safe to press twice');

  const catalog = (await call('GET', 'catalog')).data;
  assert.equal(catalog.stores.length, 15);
  assert.ok(catalog.stores.every((s: { sample?: boolean }) => s.sample === true), 'every one is labelled a sample');
  assert.ok(Object.keys(catalog.stock).length > 100, 'with their stock and prices');

  // A customer can order from a sample shop; it waits for whoever runs that shop.
  const placed = await call('POST', 'orders', { as: customer, body: orderBody({ cart: { chips: 1 }, mobile: '9876543210' }) });
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  const storeId = placed.data.orders[0].storeId as string;

  // The admin gives that shop an owner, who then sees the order on the dashboard.
  const ownerless = (await call('GET', 'admin', { as: boss })).data.shops.find((s: { id: string }) => s.id === storeId);
  assert.equal(ownerless.owner, null);
  const owned = await call('POST', `admin/shops/${storeId}/owner`, { as: boss, body: { ownerName: 'Demo Owner', ownerEmail: 'demo.owner@gmail.com' } });
  assert.equal(owned.status, 201, JSON.stringify(owned.data));
  assert.equal((await call('POST', `admin/shops/${storeId}/owner`, { as: boss, body: { ownerName: 'Someone', ownerEmail: 'x@y.com' } })).status, 409, 'one owner per shop');
  const owner = await login('demo.owner@gmail.com', 'shop', 'Demo Owner');
  const board = (await call('GET', 'orders', { as: owner })).data.orders;
  assert.equal(board[0].id, placed.data.orders[0].id);
});

test('with SAMPLE_SHOPS=true the live service starts with the sample shops, labelled, and no demo accounts', async () => {
  process.env.SAMPLE_SHOPS = 'true';
  try {
    useFreshMemoryRepo();
    const catalog = (await call('GET', 'catalog')).data;
    assert.equal(catalog.stores.length, 15);
    assert.ok(catalog.stores.every((s: { sample?: boolean }) => s.sample === true));
    assert.ok(Object.keys(catalog.stock).length > 100);
    assert.equal((await call('GET', 'demo')).status, 404, 'no demo accounts or numbers');
    // Ordering from them works straight away.
    const customer = await login('asha@gmail.com');
    assert.equal((await call('POST', 'orders', { as: customer, body: orderBody({ cart: { chips: 1 }, mobile: '9876543210' }) })).status, 201);
  } finally {
    delete process.env.SAMPLE_SHOPS;
  }
});

/** A request the way the phone apps send it: their seat, and the token instead of a cookie. */
async function appCall(method: string, path: string, seat: string, token?: string, body?: unknown): Promise<Reply> {
  const response = await handle(
    new Request('http://test.local/api/' + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-localrush-seat': seat,
        'x-localrush-client': 'app',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const setCookie = response.headers.get('set-cookie') ?? '';
  return { status: response.status, data: await response.json(), cookie: setCookie.split(';')[0], setCookie };
}

test('the Vendor and Partner apps log in to the live service with an email and password, and get a token', async () => {
  const { boss, shopId } = await shopWithMilk();
  assert.equal((await call('POST', 'admin/partners', { as: boss, body: { name: 'Piyush', email: 'piyush@gmail.com', mobile: '9833333333' } })).status, 201);

  // The apps ask how to log in, and get the public Firebase settings.
  const config = (await appCall('GET', 'config', 'shop')).data;
  assert.equal(config.mode, 'live');
  assert.equal(config.login, 'firebase');
  assert.equal(config.firebase.apiKey, 'test-api-key');
  assert.equal(config.firebase.projectId, PROJECT);

  // The demo's number and code are refused.
  assert.equal((await appCall('POST', 'auth/login', 'shop', undefined, { phone: '9811111111', code: '1234' })).data.code, 'firebase-only');
  // An email and password whose email is not confirmed yet is refused, with the code the app shows a resend button for.
  const unconfirmed = idToken({ email: 'ramesh.owner@gmail.com', email_verified: false });
  assert.equal((await appCall('POST', 'auth/login', 'shop', undefined, { idToken: unconfirmed })).data.code, 'verify-email');

  // A confirmed email and password: the app gets a token, and no cookie.
  const password = (email: string) => idToken({ email, email_verified: true, firebase: { sign_in_provider: 'password' } });
  const vendor = await appCall('POST', 'auth/login', 'shop', undefined, { idToken: password('ramesh.owner@gmail.com') });
  assert.equal(vendor.status, 200, JSON.stringify(vendor.data));
  assert.equal(typeof vendor.data.token, 'string');
  assert.equal(vendor.setCookie, '', 'the app keeps a token, not a cookie');
  assert.equal(vendor.data.user.email, 'ramesh.owner@gmail.com');
  assert.equal(vendor.data.user.storeId, shopId);
  const partner = await appCall('POST', 'auth/login', 'partner', undefined, { idToken: password('piyush@gmail.com') });
  assert.equal(partner.status, 200, JSON.stringify(partner.data));
  assert.equal(partner.data.user.role, 'partner');

  // Each login works only in its own app, with words each app can put its own way.
  const wrong = await appCall('POST', 'auth/login', 'partner', undefined, { idToken: password('ramesh.owner@gmail.com') });
  assert.equal(wrong.data.code, 'wrong-seat');
  assert.match(wrong.data.error, /shop owner/);
  assert.match((await appCall('POST', 'auth/login', 'shop', undefined, { idToken: password('piyush@gmail.com') })).data.error, /partner/);

  // A website order reaches the Vendor app; once packed, the Partner app sees the job.
  const customer = await login('asha@gmail.com');
  const placed = await call('POST', 'orders', { as: customer, body: orderBody({ mobile: '9876543210' }) });
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  const orderId = placed.data.orders[0].id as string;
  const board = await appCall('GET', 'orders', 'shop', vendor.data.token);
  assert.equal(board.status, 200);
  assert.deepEqual(board.data.orders.map((o: { id: string }) => o.id), [orderId]);
  for (const step of ['accept', 'pack']) {
    const moved = await appCall('POST', `orders/${orderId}/${step}`, 'shop', vendor.data.token, {});
    assert.equal(moved.status, 200, `${step}: ${JSON.stringify(moved.data)}`);
  }
  assert.equal((await appCall('PUT', 'partner', 'partner', partner.data.token, { online: true, place: PES })).status, 200);
  const jobs = await appCall('GET', 'orders', 'partner', partner.data.token);
  assert.equal(jobs.status, 200);
  assert.deepEqual(jobs.data.available.map((j: { id: string }) => j.id), [orderId]);
  assert.equal((await appCall('POST', `orders/${orderId}/claim`, 'partner', partner.data.token, {})).status, 200);
});

test('a live server without its own SESSION_SECRET refuses every request', async () => {
  const saved = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    const r = await call('GET', 'me');
    assert.equal(r.status, 503);
    assert.equal(r.data.code, 'setup');
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test('one address cannot flood the login', async () => {
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await call('POST', 'auth/login', { body: { idToken: 'x' } })).status;
  assert.equal(last, 429);
});
