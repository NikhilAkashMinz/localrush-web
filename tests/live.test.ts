// Tests for the live service (LOCALRUSH_MODE=live): SMS login through Firebase, no demo data,
// no demo accounts, and the admin who adds the real shops and partners. Firebase's tokens are
// signed here with a key made for the test, which the server is told to trust instead of Google's.
// This file runs in its own process (Node's test runner does that per file), so the settings
// below never reach the demo tests in api.test.ts.

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { beforeEach, test } from 'node:test';
import { PLACES } from '../lib/data';
import { handle, resetRateLimits } from '../server/api';
import { clock } from '../server/clock';
import { useFirebaseKeys } from '../server/firebase';
import { useFreshMemoryRepo } from '../server/repo';

const PROJECT = 'localrush-test';
const ADMIN = '9800000001';
process.env.LOCALRUSH_MODE = 'live';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.ADMIN_PHONES = `${ADMIN}, 98000 00002`;

const google = generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
useFirebaseKeys(async () => ({ keys: { k1: google.publicKey.export({ type: 'spki', format: 'pem' }).toString() }, maxAgeMs: 3_600_000 }));

/** A Firebase ID token for this number, as Firebase would sign it, with any claim overridden. */
function idToken(phone: string, change: Record<string, unknown> = {}, key = google.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    sub: 'firebase-' + phone,
    iat: now - 5,
    auth_time: now - 5,
    exp: now + 3600,
    phone_number: phone,
    ...change,
  };
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${part({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${part(claims)}`;
  return `${data}.${createSign('RSA-SHA256').update(data).sign(key).toString('base64url')}`;
}

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

async function smsLogin(phone10: string, seat = 'customer', name = 'Asha Rao') {
  const r = await call('POST', 'auth/login', { seat, body: { name, idToken: idToken('+91' + phone10) } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.cookie;
}

const PES = PLACES[0];
const shopInput = {
  name: 'Nandini Milk Parlour',
  kind: 'kirana',
  area: 'Banashankari 3rd Stage',
  lat: PES.lat + 0.003,
  lng: PES.lng,
  open: 6,
  close: 22,
  ownerName: 'Ramesh',
  ownerPhone: '9811111111',
};

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
  assert.equal(config.login, 'sms');
  assert.equal(config.firebase.projectId, PROJECT);
});

test('demo codes are refused; a number proved by SMS logs in, with a secure cookie', async () => {
  const demo = await call('POST', 'auth/login', { body: { name: 'Asha', phone: '9876543210', code: '1234' } });
  assert.equal(demo.status, 400);
  assert.equal(demo.data.code, 'sms-only');

  const r = await call('POST', 'auth/login', { body: { name: 'Asha Rao', idToken: idToken('+919876543210') } });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /; Secure/, 'the live login cookie only travels over https');
  const me = (await call('GET', 'me', { as: r.cookie })).data.user;
  assert.equal(me.phone, '9876543210');
  assert.equal(me.name, 'Asha Rao');
  assert.equal(me.admin, undefined);
});

test('forged, foreign, expired and non-Indian sign-ins are refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const attempts = [
    idToken('+919876543210', {}, stranger.privateKey),
    idToken('+919876543210', { aud: 'someone-elses-project' }),
    idToken('+919876543210', { iss: 'https://securetoken.google.com/someone-elses-project' }),
    idToken('+919876543210', { exp: now - 3600 }),
    idToken('+919876543210', { phone_number: undefined }),
    'not.a.token',
  ];
  for (const token of attempts) {
    const r = await call('POST', 'auth/login', { body: { name: 'Asha', idToken: token } });
    assert.equal(r.status, 401, token.slice(0, 40));
    assert.equal(r.data.code, 'otp');
    assert.equal(r.cookie, '');
  }
  const abroad = await call('POST', 'auth/login', { body: { name: 'Sam', idToken: idToken('+14155550100') } });
  assert.equal(abroad.status, 401);
  assert.match(abroad.data.error, /Indian mobile numbers/);
});

test('an admin adds a shop and a partner; they log in by SMS and the shop can sell', async () => {
  const customer = await smsLogin('9876543210');
  assert.equal((await call('GET', 'admin', { as: customer })).status, 403, 'customers are not admins');

  const boss = await smsLogin(ADMIN, 'customer', 'Nikhil');
  assert.equal((await call('GET', 'me', { as: boss })).data.user.admin, true);

  assert.equal((await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, lat: 0, lng: 0 } })).status, 400, 'needs a location');
  assert.equal((await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, open: 22, close: 6 } })).status, 400, 'closes after it opens');
  const made = await call('POST', 'admin/shops', { as: boss, body: shopInput });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const shopId = made.data.shop.id as string;
  assert.equal(made.data.shop.rating, 0, 'a new shop has no rating yet');
  const again = await call('POST', 'admin/shops', { as: boss, body: { ...shopInput, name: 'Another shop' } });
  assert.equal(again.status, 409, 'one number, one account');

  // The owner logs in on the shop dashboard with the number the admin gave, and stocks milk.
  const owner = await smsLogin(shopInput.ownerPhone, 'shop');
  assert.equal((await call('GET', 'me', { as: owner })).data.user.storeId, shopId);
  assert.equal((await call('PUT', 'shop/stock', { as: owner, body: { pid: 'milk', price: 27, stock: 10 } })).status, 200);

  // A customer nearby can now order from it.
  const placed = await call('POST', 'orders', {
    as: customer,
    body: { cart: { milk: 2 }, place: PES, line: 'Room 214, Boys Hostel Block B', tag: 'Hostel', payment: 'cod', mode: 'balanced' },
  });
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  assert.equal(placed.data.orders[0].storeId, shopId);

  // A number that is not an owner cannot use the dashboard, even with a valid SMS login.
  assert.equal((await call('POST', 'auth/login', { seat: 'shop', body: { idToken: idToken('+919822222222') } })).status, 404);

  const partner = await call('POST', 'admin/partners', { as: boss, body: { name: 'Piyush', phone: '9833333333' } });
  assert.equal(partner.status, 201);
  const rider = await smsLogin('9833333333', 'partner');
  assert.equal((await call('GET', 'me', { as: rider })).data.user.role, 'partner');

  const list = (await call('GET', 'admin', { as: boss })).data;
  assert.equal(list.shops.length, 1);
  assert.equal(list.shops[0].owner.phone, shopInput.ownerPhone);
  assert.equal(list.partners[0].name, 'Piyush');

  // Pausing the shop from the admin page stops new orders from it.
  const paused = await call('PUT', `admin/shops/${shopId}`, { as: boss, body: { ...shopInput, paused: true } });
  assert.equal(paused.status, 200);
  const blocked = await call('POST', 'orders', {
    as: customer,
    body: { cart: { milk: 1 }, place: PES, line: 'Room 214, Boys Hostel Block B', tag: 'Hostel', payment: 'cod', mode: 'balanced' },
  });
  assert.equal(blocked.status, 409);
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
