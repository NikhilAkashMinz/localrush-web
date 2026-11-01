#!/usr/bin/env node
// Demo ride: moves a delivery partner along the way to the shop and on to the customer, as if
// their phone were sharing GPS from a scooter, so the live map on the customer's order page can
// be shown indoors. It logs in as the partner the way the LocalRush Partner app does and sends a
// position every couple of seconds while that partner has a delivery under way. The steps
// themselves (taking the order, "picked up", the customer's code) are still done in the partner
// app or on the delivery partner screen, as usual.
//
//   npm run demo:ride                                  Ravi K. (9100000001), 30 km/h
//   npm run demo:ride -- --phone 9100000002 --speed 40
//   npm run demo:ride -- --server http://192.168.1.5:3000
//
// If this partner is also logged in to the partner app with GPS on, the phone's real position
// mixes with this one: in the app, choose an area instead (Account → Your location → Change).

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SERVER = option('server', process.env.LOCALRUSH_SERVER || 'http://localhost:3000').replace(/\/+$/, '');
const PHONE = option('phone', '9100000001');
const SPEED_KMH = Math.max(5, Number(option('speed', '30')) || 30);
const EVERY_S = Math.max(1, Number(option('every', '2')) || 2);
const ONCE = args.includes('--once');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rad = (d) => (d * Math.PI) / 180;
/** Straight-line distance in km. */
function crow(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const kmText = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`);
const say = (text) => console.log(`${new Date().toLocaleTimeString('en-IN')}  ${text}`);

let token = '';
async function api(method, path, body) {
  let response;
  try {
    response = await fetch(`${SERVER}/api/${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-localrush-seat': 'partner',
        'x-localrush-client': 'app',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the LocalRush server at ${SERVER}. Is "npm run dev" running?`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `The server answered ${response.status}.`);
  return data;
}

/** Tell the server where the partner is, as the partner app does with the phone's GPS. */
const sendPosition = (p) =>
  api('PUT', 'partner', { place: { label: 'Demo ride', sub: 'Simulated GPS (npm run demo:ride)', lat: p.lat, lng: p.lng }, gps: true });

/** The partner's delivery under way, if any. */
async function underWay() {
  const { orders } = await api('GET', 'orders');
  return orders.find((o) => o.status === 'assigned' || o.status === 'picked') ?? null;
}

/**
 * Ride from `from` to `to`, sending a position every few seconds, for as long as `keepGoing` says.
 * Two legs, one along each direction, which looks more like city streets than a straight line.
 * Returns where the ride ended.
 */
async function ride(from, to, keepGoing) {
  const corner = { lat: from.lat, lng: to.lng };
  const stepKm = (SPEED_KMH / 3600) * EVERY_S;
  let here = from;
  for (const [a, b] of [
    [from, corner],
    [corner, to],
  ]) {
    const steps = Math.max(1, Math.ceil(crow(a, b) / stepKm));
    for (let i = 1; i <= steps; i++) {
      if (!(await keepGoing())) return here;
      here = { lat: a.lat + ((b.lat - a.lat) * i) / steps, lng: a.lng + ((b.lng - a.lng) * i) / steps };
      await sendPosition(here);
      await sleep(EVERY_S * 1000);
    }
  }
  return here;
}

/** Stay at one spot until `done` says so, sending the position now and then so it stays live. */
async function waitAt(spot, done) {
  let sent = 0;
  while (!(await done())) {
    if (Date.now() - sent > 10_000) {
      await sendPosition(spot);
      sent = Date.now();
    }
    await sleep(2000);
  }
}

async function main() {
  const login = await api('POST', 'auth/login', { phone: PHONE, code: '1234' });
  token = login.token;
  const name = login.user.name;
  say(`Demo ride for ${name} (${PHONE}) on ${SERVER}, at ${SPEED_KMH} km/h. Stop it with Ctrl+C.`);
  if (!login.user.online) {
    await api('PUT', 'partner', { online: true });
    say(`${name} is online now.`);
  }
  const stores = new Map((await api('GET', 'catalog')).stores.map((s) => [s.id, s]));

  for (;;) {
    say(`Waiting for ${name} to take a delivery (in the partner app or on the delivery partner screen)…`);
    let order = await underWay();
    while (!order) {
      await sleep(2000);
      order = await underWay();
    }
    const id = order.id;
    const shop = stores.get(order.storeId);
    const home = { lat: order.lat, lng: order.lng };
    const me = (await api('GET', 'me')).user;
    let here = me.place ? { lat: me.place.lat, lng: me.place.lng } : null;
    const stillIs = (status) => async () => {
      const now = await underWay();
      return now?.id === id && now.status === status;
    };

    if (order.status === 'assigned' && shop) {
      // Start from where the partner is, or about 800 m from the shop if that is far off or right there.
      if (!here || crow(here, shop) > 3 || crow(here, shop) < 0.2) here = { lat: shop.lat - 0.004, lng: shop.lng - 0.006 };
      say(`${id}: riding to ${shop.name}, ${kmText(crow(here, shop) * 1.3)} away. Watch the customer's order page.`);
      here = await ride(here, shop, stillIs('assigned'));
      if ((await underWay())?.status === 'assigned') {
        say(`${id}: at the shop. Mark it picked up in the partner app or on the delivery partner screen.`);
        await waitAt(here, async () => (await underWay())?.status !== 'assigned');
      }
    }

    order = await underWay();
    if (order?.id === id && order.status === 'picked') {
      here = here ?? (shop ? { lat: shop.lat, lng: shop.lng } : home);
      say(`${id}: picked up. Riding to ${order.customerName}, ${kmText(crow(here, home) * 1.3)} away.`);
      here = await ride(here, home, stillIs('picked'));
      if ((await underWay())?.id === id) {
        say(`${id}: at the customer's door. Enter their code in the partner app to finish.`);
        await waitAt(here, async () => (await underWay())?.id !== id);
      }
    }
    say(`${id}: done.`);
    if (ONCE) return;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
