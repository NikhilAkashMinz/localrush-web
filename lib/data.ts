// The catalogue the site works with: products, shops and each shop's stock and prices.
// It starts as the built-in sample and is replaced by the server's live data as soon as
// that loads (see setDataset). Everything else reads it through the functions below.

import { SAMPLE } from './sample';

export type PackShape =
  | 'box' | 'carton' | 'bottle' | 'can' | 'jar' | 'pouch' | 'round' | 'tube' | 'strip' | 'book';

export type Category = { slug: string; name: string; short: string; emoji: string; tint: string; deep: string };

export type Product = {
  id: string;
  name: string;
  unit: string;
  mrp: number;
  emoji: string;
  shape: PackShape;
  color: string;
  cat: string;
  keywords: string;
};

export type StoreKind = 'kirana' | 'supermarket' | 'fresh' | 'pharmacy' | 'stationery' | 'electronics' | 'bakery';

export type Store = {
  id: string;
  name: string;
  kind: StoreKind;
  area: string;
  lat: number;
  lng: number;
  open: [number, number]; // opening and closing hour, 24 h clock
  prep: number; // minutes to pack a typical order
  load: number; // base workload, 0 (idle) to 1 (swamped)
  rating: number;
  /** Set by the shop owner to stop taking orders for a while. */
  paused?: boolean;
  /** Orders this shop is working on right now. Filled in by the server. */
  busy?: number;
};

export type Place = { label: string; sub: string; lat: number; lng: number };

export const CATEGORIES: Category[] = [
  { slug: 'fruits-veg', name: 'Fruits & vegetables', short: 'Fruits & veg', emoji: '🥕', tint: '#E4F4DA', deep: '#3E8E2F' },
  { slug: 'dairy-bread', name: 'Dairy, bread & eggs', short: 'Dairy & bread', emoji: '🥛', tint: '#E3EDFF', deep: '#2F62C9' },
  { slug: 'staples', name: 'Atta, rice & dal', short: 'Staples', emoji: '🌾', tint: '#FBEFD2', deep: '#B07A12' },
  { slug: 'snacks', name: 'Snacks & drinks', short: 'Snacks', emoji: '🍿', tint: '#FFE6DC', deep: '#D2552B' },
  { slug: 'bakery', name: 'Bakery & sweets', short: 'Bakery', emoji: '🥐', tint: '#F6E6D3', deep: '#9A5B22' },
  { slug: 'personal-home', name: 'Personal care & home', short: 'Care & home', emoji: '🧼', tint: '#EDE5FB', deep: '#6B45C4' },
  { slug: 'pharmacy', name: 'Pharmacy', short: 'Pharmacy', emoji: '💊', tint: '#DDF3F1', deep: '#0B7A75' },
  { slug: 'stationery', name: 'Stationery & print', short: 'Stationery', emoji: '📓', tint: '#FFF0C2', deep: '#A57800' },
  { slug: 'electronics', name: 'Chargers & gadgets', short: 'Gadgets', emoji: '🔌', tint: '#E4E9F2', deep: '#3B4A6B' },
];

export type Stock = { price: number; stock: number };

/** One consistent copy of the catalogue. `rev` goes up every time the server's copy changes. */
export type Dataset = {
  rev: number;
  products: Product[];
  stores: Store[];
  /** Keyed by "storeId|productId". A missing key means that shop does not sell that product. */
  stock: Record<string, Stock>;
};

export const stockKey = (storeId: string, productId: string) => storeId + '|' + productId;

let current: Dataset = SAMPLE;
let productById = new Map(current.products.map((p) => [p.id, p]));
let storeById = new Map(current.stores.map((s) => [s.id, s]));

// "let" on purpose: every file that imports these sees the new arrays after setDataset.
export let PRODUCTS: Product[] = current.products;
export let STORES: Store[] = current.stores;

/** Swap in a fresh copy of the catalogue, for example the one the server just sent. */
export function setDataset(next: Dataset) {
  current = next;
  PRODUCTS = next.products;
  STORES = next.stores;
  productById = new Map(next.products.map((p) => [p.id, p]));
  storeById = new Map(next.stores.map((s) => [s.id, s]));
}

export const dataset = () => current;
export const product = (id: string) => productById.get(id);
export const store = (id: string) => storeById.get(id);
export const category = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

/** What a shop charges for a product and how many it has. null means the shop does not sell it. */
export function stockAt(storeId: string, productId: string): Stock | null {
  return current.stock[stockKey(storeId, productId)] ?? null;
}

export const KIND_LABEL: Record<StoreKind, string> = {
  kirana: 'Kirana store',
  supermarket: 'Supermarket',
  fresh: 'Fruits and vegetables',
  pharmacy: 'Pharmacy',
  stationery: 'Stationery shop',
  electronics: 'Electronics shop',
  bakery: 'Bakery',
};

export const KIND_COLOR: Record<StoreKind, string> = {
  kirana: '#FFB627',
  supermarket: '#F2643D',
  fresh: '#5DB843',
  pharmacy: '#21B5A8',
  stationery: '#5C7CFA',
  electronics: '#8B6CF0',
  bakery: '#E58BB0',
};

export const PLACES: Place[] = [
  { label: 'PES University', sub: 'Banashankari 3rd Stage', lat: 12.9345, lng: 77.5345 },
  { label: 'Banashankari 2nd Stage', sub: 'Near BDA Complex', lat: 12.9255, lng: 77.5468 },
  { label: 'Jayanagar 4th Block', sub: 'Near the bus stand', lat: 12.9299, lng: 77.5826 },
  { label: 'Basavanagudi', sub: 'Gandhi Bazaar main road', lat: 12.9422, lng: 77.5738 },
  { label: 'JP Nagar 2nd Phase', sub: 'Near the mini forest', lat: 12.9063, lng: 77.5857 },
  { label: 'Rajarajeshwari Nagar', sub: 'Near the arch', lat: 12.915, lng: 77.52 },
  { label: 'Vijayanagar', sub: 'Near the metro station', lat: 12.9719, lng: 77.535 },
  { label: 'Koramangala 5th Block', sub: 'Near Jyoti Nivas College', lat: 12.9352, lng: 77.6245 },
  { label: 'Whitefield', sub: 'ITPL main road', lat: 12.9698, lng: 77.75 },
];

export const QUICK_NEEDS = ['Milk', 'Bread', 'Eggs', 'Paracetamol', 'USB-C cable', 'Notebook', 'Tomatoes'];

export function describe(p: Product) {
  const c = category(p.cat);
  const lines: Record<string, string> = {
    'fruits-veg': 'Picked from the shop’s counter when you order, so what arrives is what was on display today.',
    'dairy-bread': 'Kept chilled at the shop and packed last, just before the delivery partner picks up.',
    staples: 'Sealed pack from the shop’s shelf. The price shown is the price that shop charges in person.',
    snacks: 'Sealed pack from the shop’s shelf, best before date checked while packing.',
    bakery: 'Baked or stocked fresh by the bakery each morning. Order before evening for the best pick.',
    'personal-home': 'Sealed pack from a shop near you, the same one you would pick up at the counter.',
    pharmacy: 'Over-the-counter item sold by a licensed chemist near you. Read the label before use.',
    stationery: 'From a stationery shop near you. Handy the night before a submission.',
    electronics: 'From a local electronics shop, with the shop’s own bill and replacement policy.',
  };
  return lines[p.cat] ?? `From a ${c?.short ?? 'local'} shop near you.`;
}
