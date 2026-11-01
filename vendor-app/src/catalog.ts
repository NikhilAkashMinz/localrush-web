// The shop's part of the LocalRush catalogue: the categories (the same list as the website's
// lib/data.ts, which the server checks new products against), stock levels and shop hours.

import type { Catalog, Stock, Store } from './types';

export type Category = { slug: string; name: string; short: string; emoji: string };

export const CATEGORIES: Category[] = [
  { slug: 'fruits-veg', name: 'Fruits & vegetables', short: 'Fruits & veg', emoji: '🥕' },
  { slug: 'dairy-bread', name: 'Dairy, bread & eggs', short: 'Dairy & bread', emoji: '🥛' },
  { slug: 'staples', name: 'Atta, rice & dal', short: 'Staples', emoji: '🌾' },
  { slug: 'snacks', name: 'Snacks & drinks', short: 'Snacks', emoji: '🍿' },
  { slug: 'bakery', name: 'Bakery & sweets', short: 'Bakery', emoji: '🥐' },
  { slug: 'personal-home', name: 'Personal care & home', short: 'Care & home', emoji: '🧼' },
  { slug: 'pharmacy', name: 'Pharmacy', short: 'Pharmacy', emoji: '💊' },
  { slug: 'stationery', name: 'Stationery & print', short: 'Stationery', emoji: '📓' },
  { slug: 'electronics', name: 'Chargers & gadgets', short: 'Gadgets', emoji: '🔌' },
];

export const categoryOf = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

export const KIND_LABEL: Record<string, string> = {
  kirana: 'Kirana store',
  supermarket: 'Supermarket',
  fresh: 'Fruits and vegetables',
  pharmacy: 'Pharmacy',
  stationery: 'Stationery shop',
  electronics: 'Electronics shop',
  bakery: 'Bakery',
};

// ---------- Stock ----------

/** At or below this many, a product is running low. The website uses the same number. */
export const LOW = 3;

export const stockKey = (storeId: string, productId: string) => storeId + '|' + productId;

/** What the shop charges for a product and how many it has, or null if it does not sell it. */
export const stockAt = (catalog: Catalog | null, storeId: string, productId: string): Stock | null =>
  catalog?.stock[stockKey(storeId, productId)] ?? null;

export type Level = 'out' | 'low' | 'ok';
export const levelOf = (s: Stock): Level => (s.stock === 0 ? 'out' : s.stock <= LOW ? 'low' : 'ok');

// ---------- Shop hours, in Indian time like the website ----------

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 5.5 * HOUR;

/** The hour in India now. India has no daylight saving, so this is right whatever the phone's time zone. */
export const istHour = (now: number) => Math.floor((((now + IST) % DAY) + DAY) % DAY / HOUR);

/** The start of today in India: the shop's day, the same as on the website's Sales page. */
export const startOfDayIST = (now: number) => Math.floor((now + IST) / DAY) * DAY - IST;

/** Whether it is within the shop's opening hours now. */
export function withinHours(s: Store, now: number) {
  const h = istHour(now);
  return h >= s.open[0] && h < s.open[1];
}

export function hourLabel(h: number) {
  const hh = ((h + 11) % 12) + 1;
  return `${hh} ${h % 24 < 12 ? 'am' : 'pm'}`;
}

export const hoursText = (s: Store) => (s.open[0] === 0 && s.open[1] === 24 ? 'open 24 hours' : `${hourLabel(s.open[0])} to ${hourLabel(s.open[1])}`);
