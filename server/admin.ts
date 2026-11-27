// What an admin can do on the live service: add the real shops (each with its owner's email)
// and the delivery partners. There is no self sign-up for shops or partners yet, so this is how
// they join. Owners and partners then log in with that email (Google, or email and password)
// like everyone else; shop owners set their own stock and prices on the dashboard.

import { randomBytes } from 'node:crypto';
import { KIND_LABEL, type Store, type StoreKind } from '../lib/data';
import { SAMPLE } from '../lib/sample';
import { ApiError, contactOf, isAdmin } from './service';
import { clock } from './clock';
import type { Repo, User } from './types';

const isText = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const isPhone = (v: unknown): v is string => typeof v === 'string' && /^[6-9]\d{9}$/.test(v);
const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isHour = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isCoord = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
const KINDS = Object.keys(KIND_LABEL) as StoreKind[];

function requireAdmin(user: User | null) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only LocalRush admins can do that.', 'admin');
}

const person = (u: User) => ({ id: u.id, name: u.name, email: u.email ?? '', mobile: contactOf(u), createdAt: u.createdAt });

/** Everything the admin page shows: every shop with its owner, and every delivery partner. */
export async function overview(repo: Repo, user: User | null) {
  requireAdmin(user);
  const [data, owners, partners] = await Promise.all([repo.dataset(), repo.usersByRole('shop'), repo.usersByRole('partner')]);
  return {
    shops: data.stores.map((s) => {
      const owner = owners.find((o) => o.storeId === s.id);
      return { ...s, owner: owner ? person(owner) : null };
    }),
    partners: partners.map((p) => ({ ...person(p), online: p.online === true })),
  };
}

type ShopInput = { name?: unknown; kind?: unknown; area?: unknown; lat?: unknown; lng?: unknown; open?: unknown; close?: unknown; paused?: unknown };

/** Check the shop fields an admin sends, and give back the ones that may be saved. */
function shopFields(input: ShopInput): Pick<Store, 'name' | 'kind' | 'area' | 'lat' | 'lng' | 'open'> & { paused: boolean } {
  if (!isText(input.name, 2, 60)) throw new ApiError(400, 'Enter the shop name.');
  if (!KINDS.includes(input.kind as StoreKind)) throw new ApiError(400, 'Choose what kind of shop it is.');
  if (!isText(input.area, 2, 60)) throw new ApiError(400, 'Enter the area, for example "Banashankari 3rd Stage".');
  if (!isCoord(input.lat, 90) || !isCoord(input.lng, 180) || (input.lat === 0 && input.lng === 0)) {
    throw new ApiError(400, 'Set the shop\'s location: its latitude and longitude.');
  }
  if (!isHour(input.open, 0, 23) || !isHour(input.close, 1, 24) || input.close <= input.open) {
    throw new ApiError(400, 'Opening hours: it must close after it opens (24 means midnight).');
  }
  return {
    name: input.name.trim(),
    kind: input.kind as StoreKind,
    area: input.area.trim(),
    lat: input.lat,
    lng: input.lng,
    open: [input.open, input.close],
    paused: input.paused === true,
  };
}

/** Check the login email and the optional contact number given for an owner or a partner. */
async function account(repo: Repo, email: unknown, mobile: unknown, who: string) {
  if (!isEmail(email)) throw new ApiError(400, `Enter the ${who}'s email address. They log in with it.`);
  if (mobile !== undefined && mobile !== '' && !isPhone(mobile)) throw new ApiError(400, `The ${who}'s mobile number should be 10 digits.`);
  const clean = email.trim().toLowerCase();
  await emailFree(repo, clean);
  return { email: clean, ...(isPhone(mobile) ? { mobile } : {}) };
}

/** Add a shop and its owner's account. The owner then logs in on the shop dashboard with that email. */
export async function addShop(
  repo: Repo,
  user: User | null,
  input: ShopInput & { ownerName?: unknown; ownerEmail?: unknown; ownerMobile?: unknown },
) {
  requireAdmin(user);
  const fields = shopFields(input);
  if (!isText(input.ownerName, 2, 60)) throw new ApiError(400, 'Enter the shop owner\'s name.');
  const login = await account(repo, input.ownerEmail, input.ownerMobile, 'owner');

  const slug = fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'shop';
  const store: Store = {
    id: `s-${slug}-${randomBytes(2).toString('hex')}`,
    ...fields,
    // Until it has orders of its own: an average packing time and workload, and no rating yet.
    prep: 6,
    load: 0.3,
    rating: 0,
  };
  const owner: User = {
    id: 'u-' + randomBytes(6).toString('hex').toUpperCase(),
    name: input.ownerName.trim(),
    ...login,
    role: 'shop',
    storeId: store.id,
    addresses: [],
    createdAt: clock.now(),
  };
  await repo.putStore(store);
  await repo.putUser(owner);
  await repo.bump(['catalog']);
  return { shop: { ...store, owner: person(owner) } };
}

/** Change a shop's details, or pause it. Its stock, prices and owner stay as they are. */
export async function updateShop(repo: Repo, user: User | null, storeId: string, input: ShopInput) {
  requireAdmin(user);
  const current = (await repo.dataset()).stores.find((s) => s.id === storeId);
  if (!current) throw new ApiError(404, 'There is no shop with that id.');
  const fields = shopFields(input);
  const next: Store = { ...current, ...fields };
  await repo.putStore(next);
  await repo.bump(['catalog', 'store:' + storeId]);
  return { shop: next };
}

/**
 * Add the sample shops (lib/sample.ts) with their stock and prices, marked as samples, so the
 * live service can be tried before real shops join. They have no owners until the admin gives
 * one an owner. Shops already added are left as they are, so this is safe to run twice.
 */
export async function addSampleShops(repo: Repo, user: User | null) {
  requireAdmin(user);
  const have = new Set((await repo.dataset()).stores.map((s) => s.id));
  let added = 0;
  for (const s of SAMPLE.stores) {
    if (have.has(s.id)) continue;
    await repo.putStore({ ...s, sample: true });
    for (const [key, stock] of Object.entries(SAMPLE.stock)) {
      const [storeId, productId] = key.split('|');
      if (storeId === s.id) await repo.putStock(storeId, productId, { ...stock });
    }
    added++;
  }
  await repo.bump(['catalog']);
  return { added };
}

/** Give a shop that has no owner yet (a sample shop) its owner's account, to run its dashboard. */
export async function setOwner(repo: Repo, user: User | null, storeId: string, input: { ownerName?: unknown; ownerEmail?: unknown; ownerMobile?: unknown }) {
  requireAdmin(user);
  const shop = (await repo.dataset()).stores.find((s) => s.id === storeId);
  if (!shop) throw new ApiError(404, 'There is no shop with that id.');
  if ((await repo.usersByRole('shop')).some((o) => o.storeId === storeId)) {
    throw new ApiError(409, 'This shop already has an owner.', 'has-owner');
  }
  if (!isText(input.ownerName, 2, 60)) throw new ApiError(400, 'Enter the shop owner\'s name.');
  const login = await account(repo, input.ownerEmail, input.ownerMobile, 'owner');
  const owner: User = {
    id: 'u-' + randomBytes(6).toString('hex').toUpperCase(),
    name: input.ownerName.trim(),
    ...login,
    role: 'shop',
    storeId,
    addresses: [],
    createdAt: clock.now(),
  };
  await repo.putUser(owner);
  return { owner: person(owner) };
}

/** Add a delivery partner. They then log in on the delivery screen with that email. */
export async function addPartner(repo: Repo, user: User | null, input: { name?: unknown; email?: unknown; mobile?: unknown }) {
  requireAdmin(user);
  if (!isText(input.name, 2, 60)) throw new ApiError(400, 'Enter the partner\'s name.');
  const login = await account(repo, input.email, input.mobile, 'partner');
  const partner: User = {
    id: 'u-' + randomBytes(6).toString('hex').toUpperCase(),
    name: input.name.trim(),
    ...login,
    role: 'partner',
    online: false,
    addresses: [],
    createdAt: clock.now(),
  };
  await repo.putUser(partner);
  return { partner: { ...person(partner), online: false } };
}

/** One email is one account, so an email already in use cannot be given to someone else. */
async function emailFree(repo: Repo, email: string) {
  const taken = await repo.userByEmail(email);
  if (!taken) return;
  const as = taken.role === 'shop' ? 'a shop owner' : taken.role === 'partner' ? 'a delivery partner' : 'a customer';
  throw new ApiError(409, `That email is already used by ${as} (${taken.name}). Each email can have one account.`, 'email-taken');
}
