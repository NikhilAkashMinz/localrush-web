// The rules of LocalRush, independent of any web framework or database:
// who may do what, how an order moves from step to step, and how stock stays correct.

import { randomBytes } from 'node:crypto';
import { CATEGORIES, setDataset, type Dataset, type PackShape, type Place, type Product } from '../lib/data';
import { roadKm } from '../lib/geo';
import { shopsNear } from '../lib/nearby';
import type { Order, Status } from '../lib/orders';
import { planOrder, type Mode } from '../lib/select';
import { clock } from './clock';
import type { Address, Repo, User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const id = (prefix: string, bytes = 4) => prefix + randomBytes(bytes).toString('hex').toUpperCase();
const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isText = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

function isPlace(v: unknown): v is Place {
  const p = v as Place;
  return (
    !!p && isText(p.label, 1, 80) && typeof p.sub === 'string' && p.sub.length <= 120 &&
    typeof p.lat === 'number' && Math.abs(p.lat) <= 90 && typeof p.lng === 'number' && Math.abs(p.lng) <= 180
  );
}

/** How far a delivery partner will ride to a shop to pick up, in km by road. */
export const PARTNER_RANGE_KM = 6;

// ---------- Catalogue ----------

let cache: { repo: Repo; data: Dataset } | null = null;

/** The whole catalogue, with how busy each shop is. Re-read only when something has changed. */
export async function catalogue(repo: Repo): Promise<Dataset> {
  const [rev] = await repo.versions(['catalog']);
  if (cache && cache.repo === repo && cache.data.rev === rev) return cache.data;
  const [base, working] = await Promise.all([repo.dataset(), repo.orders({ statuses: ['placed', 'accepted'] })]);
  const busy = new Map<string, number>();
  for (const o of working) busy.set(o.storeId, (busy.get(o.storeId) ?? 0) + 1);
  const data: Dataset = {
    rev,
    products: base.products,
    stores: base.stores.map((s) => ({ ...s, busy: busy.get(s.id) ?? 0 })),
    stock: base.stock,
  };
  cache = { repo, data };
  return data;
}

// ---------- Accounts ----------

export function publicUser(u: User) {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role, storeId: u.storeId, online: u.online, place: u.place, addresses: u.addresses };
}

export async function login(repo: Repo, input: { name?: unknown; phone?: unknown; code?: unknown }): Promise<User> {
  if (typeof input.phone !== 'string' || !/^[6-9]\d{9}$/.test(input.phone)) throw new ApiError(400, 'Enter a 10-digit mobile number.');
  // Demo login: there is no SMS provider yet, so any 4 digits are accepted.
  if (typeof input.code !== 'string' || !/^\d{4}$/.test(input.code)) throw new ApiError(400, 'Enter the 4-digit code.');
  const existing = await repo.userByPhone(input.phone);
  if (existing) return existing;
  if (!isText(input.name, 2, 60)) throw new ApiError(400, 'Enter your name.');
  const user: User = { id: id('u-', 6), name: input.name.trim(), phone: input.phone, role: 'customer', addresses: [], createdAt: clock.now() };
  await repo.putUser(user);
  return user;
}

export async function rename(repo: Repo, user: User, name: unknown): Promise<User> {
  if (!isText(name, 2, 60)) throw new ApiError(400, 'Enter a name of at least 2 letters.');
  const next = { ...user, name: name.trim() };
  await repo.putUser(next);
  return next;
}

export async function deleteAddress(repo: Repo, user: User, addressId: string): Promise<User> {
  const next = { ...user, addresses: user.addresses.filter((a) => a.id !== addressId) };
  await repo.putUser(next);
  return next;
}

// ---------- Orders ----------

/** What each kind of user is allowed to see of an order. Only the customer gets the door code. */
export function viewOrder(o: Order, user: User): Order {
  if (user.role === 'customer') return o;
  const { otp, ...rest } = o;
  void otp;
  if (user.role === 'partner' && o.partnerId !== user.id) return { ...rest, customerPhone: '' };
  return rest;
}

const channelsFor = (o: Order, extra: string[] = []) => [
  'user:' + o.customerId,
  'store:' + o.storeId,
  ...(o.partnerId ? ['partner:' + o.partnerId] : []),
  ...extra,
];

type PlaceInput = { cart?: unknown; place?: unknown; line?: unknown; tag?: unknown; payment?: unknown; mode?: unknown };

export async function placeOrder(repo: Repo, user: User, input: PlaceInput) {
  if (user.role !== 'customer') throw new ApiError(403, 'Only customers can place orders.');
  if (!isPlace(input.place)) throw new ApiError(400, 'Choose a delivery location.');
  if (!isText(input.line, 6, 200)) throw new ApiError(400, 'Add your flat, building and street so the delivery partner can find you.');
  const payment = input.payment === 'online' ? 'online' : 'cod';
  const mode: Mode = input.mode === 'fastest' || input.mode === 'cheapest' ? input.mode : 'balanced';
  const cart: Record<string, number> = {};
  const entries = input.cart && typeof input.cart === 'object' ? Object.entries(input.cart as Record<string, unknown>) : [];
  if (entries.length === 0 || entries.length > 40) throw new ApiError(400, 'Your cart is empty.');
  for (const [pid, qty] of entries) {
    if (!isInt(qty, 1, 12)) throw new ApiError(400, 'One of the quantities in your cart is not valid.');
    cart[pid] = qty;
  }
  const place = input.place;
  const line = input.line.trim();

  // Two tries: if someone else buys the last one between planning and taking stock, plan again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await catalogue(repo);
    setDataset(data);
    const plan = planOrder(cart, shopsNear(place.lat, place.lng, new Date(clock.now())), mode);
    if (plan.shipments.length === 0) {
      throw new ApiError(409, 'None of these items can be delivered to you right now.', 'unavailable');
    }

    const taken: { storeId: string; pid: string; qty: number }[] = [];
    let short = false;
    for (const s of plan.shipments) {
      for (const l of s.lines) {
        if (await repo.takeStock(s.near.store.id, l.pid, l.qty)) taken.push({ storeId: s.near.store.id, pid: l.pid, qty: l.qty });
        else short = true;
        if (short) break;
      }
      if (short) break;
    }
    if (short) {
      await Promise.all(taken.map((t) => repo.giveStock(t.storeId, t.pid, t.qty)));
      await repo.bump(['catalog']);
      continue;
    }

    const at = clock.now();
    const orders: Order[] = plan.shipments.map((s) => ({
      id: id('LR', 3),
      customerId: user.id,
      customerName: user.name,
      customerPhone: user.phone,
      storeId: s.near.store.id,
      storeName: s.near.store.name,
      lines: s.lines,
      subtotal: s.subtotal,
      fee: s.fee,
      total: s.subtotal + s.fee,
      address: `${line}, ${place.label}`,
      lat: place.lat,
      lng: place.lng,
      payment,
      etaMin: s.etaMin,
      distKm: s.near.distKm,
      otp: String(1000 + (randomBytes(2).readUInt16BE() % 9000)),
      status: 'placed',
      partnerId: null,
      partnerName: null,
      rejectedBy: [],
      history: [{ status: 'placed', at }],
      createdAt: at,
      updatedAt: at,
    }));
    for (const o of orders) await repo.insertOrder(o);

    if (!user.addresses.some((a) => a.line === line && a.place.label === place.label)) {
      const tag = isText(input.tag, 1, 20) ? input.tag.trim() : 'Home';
      const address: Address = { id: id('a-'), tag, line, place };
      await repo.putUser({ ...user, addresses: [address, ...user.addresses].slice(0, 8) });
    }
    await repo.bump(['catalog', ...orders.flatMap((o) => channelsFor(o))]);
    return { orders, leftOut: plan.unavailable };
  }
  throw new ApiError(409, 'Stock changed while you were ordering. Check your cart and try again.', 'stock');
}

export async function listOrders(repo: Repo, user: User) {
  if (user.role === 'customer') return { orders: await repo.orders({ customerId: user.id }) };
  if (user.role === 'shop') {
    const orders = await repo.orders({ storeId: user.storeId });
    return { orders: orders.map((o) => viewOrder(o, user)) };
  }
  const mine = await repo.orders({ partnerId: user.id });
  let available: (Order & { pickupKm: number })[] = [];
  if (user.online && user.place) {
    const here = user.place;
    const data = await catalogue(repo);
    const ready = await repo.orders({ statuses: ['packed'], unassigned: true });
    available = ready
      .map((o) => {
        const s = data.stores.find((x) => x.id === o.storeId);
        return { ...viewOrder(o, user), pickupKm: s ? roadKm(here.lat, here.lng, s.lat, s.lng) : Infinity };
      })
      .filter((o) => o.pickupKm <= PARTNER_RANGE_KM)
      .sort((a, b) => a.pickupKm - b.pickupKm);
  }
  return { orders: mine.map((o) => viewOrder(o, user)), available };
}

export async function getOrder(repo: Repo, user: User, orderId: string): Promise<Order> {
  const o = await repo.orderById(orderId);
  const allowed =
    o &&
    ((user.role === 'customer' && o.customerId === user.id) ||
      (user.role === 'shop' && o.storeId === user.storeId) ||
      (user.role === 'partner' && (o.partnerId === user.id || (o.status === 'packed' && o.partnerId === null))));
  if (!o || !allowed) throw new ApiError(404, 'We could not find that order.');
  return viewOrder(o, user);
}

async function returnStock(repo: Repo, o: Order) {
  await Promise.all(o.lines.map((l) => repo.giveStock(o.storeId, l.pid, l.qty)));
}

/** A shop turned the order down: offer it to the next-best shop, or close it if there is none. */
async function reroute(repo: Repo, o: Order, at: number): Promise<Order | null> {
  const rejectedBy = [...o.rejectedBy, o.storeId];
  const rejected = await repo.moveOrder(
    o.id,
    ['placed'],
    { status: 'rejected', rejectedBy, note: 'No other shop nearby could take this order.' },
    { status: 'rejected', at, note: `${o.storeName} could not take it` },
  );
  if (!rejected) return null;
  await returnStock(repo, o);
  await repo.bump(['catalog']);

  const data = await catalogue(repo);
  setDataset(data);
  const near = shopsNear(o.lat, o.lng, new Date(at)).filter((n) => !rejectedBy.includes(n.store.id));
  const cart = Object.fromEntries(o.lines.map((l) => [l.pid, l.qty]));
  const best = planOrder(cart, near, 'balanced').shipments[0];
  if (!best || best.lines.length < o.lines.length) return rejected;

  const taken: string[] = [];
  for (const l of best.lines) {
    if (await repo.takeStock(best.near.store.id, l.pid, l.qty)) taken.push(l.pid);
    else break;
  }
  if (taken.length < best.lines.length) {
    await Promise.all(best.lines.filter((l) => taken.includes(l.pid)).map((l) => repo.giveStock(best.near.store.id, l.pid, l.qty)));
    return rejected;
  }
  const moved = await repo.moveOrder(
    o.id,
    ['rejected'],
    {
      status: 'placed',
      storeId: best.near.store.id,
      storeName: best.near.store.name,
      lines: best.lines,
      subtotal: best.subtotal,
      fee: best.fee,
      total: best.subtotal + best.fee,
      etaMin: best.etaMin,
      distKm: best.near.distKm,
      note: `${o.storeName} could not take it, so it moved to ${best.near.store.name}.`,
    },
    { status: 'placed', at, note: `Moved to ${best.near.store.name}` },
  );
  await repo.bump(['catalog', 'store:' + best.near.store.id]);
  return moved ?? rejected;
}

export type Action = 'accept' | 'reject' | 'pack' | 'claim' | 'pickup' | 'deliver' | 'cancel';

export async function act(repo: Repo, user: User, orderId: string, action: string, body: { otp?: unknown }): Promise<Order> {
  const o = await repo.orderById(orderId);
  if (!o) throw new ApiError(404, 'We could not find that order.');
  const at = clock.now();
  const ownShop = user.role === 'shop' && o.storeId === user.storeId;
  const ownDelivery = user.role === 'partner' && o.partnerId === user.id;
  const forbidden = new ApiError(403, 'You cannot do that with this order.');
  const step = (from: Status[], status: Status, patch: Partial<Order> = {}, unassigned = false) =>
    repo.moveOrder(o.id, from, { status, ...patch }, { status, at }, unassigned);

  let moved: Order | null;
  const extra: string[] = [];
  switch (action) {
    case 'accept':
      if (!ownShop) throw forbidden;
      moved = await step(['placed'], 'accepted');
      break;
    case 'reject':
      if (!ownShop) throw forbidden;
      moved = await reroute(repo, o, at);
      extra.push('store:' + o.storeId);
      break;
    case 'pack':
      if (!ownShop) throw forbidden;
      moved = await step(['accepted'], 'packed');
      extra.push('partners', 'catalog');
      break;
    case 'claim': {
      if (user.role !== 'partner') throw forbidden;
      if (!user.online) throw new ApiError(409, 'Go online before accepting a delivery.');
      const current = await repo.orders({ partnerId: user.id, statuses: ['assigned', 'picked'] });
      if (current.length > 0) throw new ApiError(409, 'Finish your current delivery first.', 'busy');
      moved = await step(['packed'], 'assigned', { partnerId: user.id, partnerName: user.name }, true);
      if (!moved) throw new ApiError(409, 'Another partner has already taken this delivery.', 'taken');
      extra.push('partners');
      break;
    }
    case 'pickup':
      if (!ownDelivery) throw forbidden;
      moved = await step(['assigned'], 'picked');
      break;
    case 'deliver':
      if (!ownDelivery) throw forbidden;
      if (o.status === 'picked' && String(body.otp ?? '') !== o.otp) {
        throw new ApiError(400, 'That code does not match. Ask the customer to read it out again.', 'otp');
      }
      moved = await step(['picked'], 'delivered');
      break;
    case 'cancel':
      if (user.role !== 'customer' || o.customerId !== user.id) throw forbidden;
      moved = await step(['placed'], 'cancelled', { note: 'You cancelled this order.' });
      if (moved) {
        await returnStock(repo, o);
        extra.push('catalog');
      }
      break;
    default:
      throw new ApiError(400, 'Unknown action.');
  }
  if (!moved) throw new ApiError(409, 'This order has already moved on. Refresh to see where it stands.', 'stale');
  await repo.bump([...channelsFor(moved), ...extra]);
  return viewOrder(moved, user);
}

// ---------- Shop owner ----------

function requireShop(user: User): string {
  if (user.role !== 'shop' || !user.storeId) throw new ApiError(403, 'Only shop owners can do that.');
  return user.storeId;
}

export async function setStock(repo: Repo, user: User, input: { pid?: unknown; price?: unknown; stock?: unknown }) {
  const storeId = requireShop(user);
  const data = await catalogue(repo);
  const p = data.products.find((x) => x.id === input.pid);
  if (!p) throw new ApiError(404, 'We could not find that product.');
  if (!isInt(input.price, 1, 100000)) throw new ApiError(400, 'Enter a price in whole rupees.');
  if (input.price > p.mrp) throw new ApiError(400, `The price cannot be more than the MRP of ₹${p.mrp}.`);
  if (!isInt(input.stock, 0, 9999)) throw new ApiError(400, 'Enter stock as a whole number from 0 to 9999.');
  await repo.putStock(storeId, p.id, { price: input.price, stock: input.stock });
  await repo.bump(['catalog']);
  return { pid: p.id, price: input.price, stock: input.stock };
}

const SHAPE_FOR: Record<string, PackShape> = {
  'fruits-veg': 'round', 'dairy-bread': 'carton', staples: 'pouch', snacks: 'pouch', bakery: 'box',
  'personal-home': 'bottle', pharmacy: 'strip', stationery: 'book', electronics: 'box',
};

type NewProduct = { name?: unknown; unit?: unknown; cat?: unknown; mrp?: unknown; emoji?: unknown; price?: unknown; stock?: unknown };

export async function addProduct(repo: Repo, user: User, input: NewProduct): Promise<Product> {
  const storeId = requireShop(user);
  const cat = CATEGORIES.find((c) => c.slug === input.cat);
  if (!isText(input.name, 2, 60)) throw new ApiError(400, 'Enter the product name.');
  if (!isText(input.unit, 1, 40)) throw new ApiError(400, 'Enter the pack size, for example "500 g" or "1 pc".');
  if (!cat) throw new ApiError(400, 'Choose a category.');
  if (!isInt(input.mrp, 1, 100000)) throw new ApiError(400, 'Enter the MRP in whole rupees.');
  const price = input.price === undefined || input.price === null || input.price === '' ? input.mrp : input.price;
  if (!isInt(price, 1, input.mrp)) throw new ApiError(400, 'Your price must be a whole number no higher than the MRP.');
  if (!isInt(input.stock, 0, 9999)) throw new ApiError(400, 'Enter stock as a whole number from 0 to 9999.');
  const emoji = isText(input.emoji, 1, 8) ? input.emoji.trim() : cat.emoji;
  const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'item';
  const product: Product = {
    id: `${slug}-${randomBytes(2).toString('hex')}`,
    name: input.name.trim(),
    unit: input.unit.trim(),
    mrp: input.mrp,
    emoji,
    shape: SHAPE_FOR[cat.slug] ?? 'box',
    color: cat.deep,
    cat: cat.slug,
    keywords: '',
  };
  await repo.putProduct(product);
  await repo.putStock(storeId, product.id, { price, stock: input.stock });
  await repo.bump(['catalog']);
  return product;
}

export async function setPaused(repo: Repo, user: User, paused: unknown) {
  const storeId = requireShop(user);
  await repo.patchStore(storeId, { paused: paused === true });
  await repo.bump(['catalog', 'store:' + storeId]);
  return { paused: paused === true };
}

// ---------- Delivery partner ----------

export async function setPartner(repo: Repo, user: User, input: { online?: unknown; place?: unknown }): Promise<User> {
  if (user.role !== 'partner') throw new ApiError(403, 'Only delivery partners can do that.');
  const next: User = { ...user };
  if (typeof input.online === 'boolean') next.online = input.online;
  if (input.place !== undefined) {
    if (!isPlace(input.place)) throw new ApiError(400, 'Choose your area.');
    next.place = input.place;
  }
  await repo.putUser(next);
  await repo.bump(['partner:' + user.id]);
  return next;
}
