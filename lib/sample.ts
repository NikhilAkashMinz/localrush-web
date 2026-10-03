// The sample catalogue: 15 shops, about 95 products and each shop's stock and prices.
// The backend loads this into the database the first time it starts. It is also what the
// site shows if the server cannot be reached, and what the unit tests run against.

import type { Dataset, PackShape, Product, Stock, Store, StoreKind } from './data';

type Row = [id: string, name: string, unit: string, mrp: number, emoji: string, shape: PackShape, color: string, keywords?: string];

const rows: Record<string, Row[]> = {
  'fruits-veg': [
    ['banana', 'Robusta bananas', '6 pcs', 48, '🍌', 'round', '#F2C230', 'fruit'],
    ['apple', 'Shimla apples', '4 pcs, about 500 g', 140, '🍎', 'round', '#D8343B', 'fruit'],
    ['tomato', 'Tomatoes', '500 g', 28, '🍅', 'round', '#E5412D', 'vegetable'],
    ['onion', 'Onions', '1 kg', 42, '🧅', 'round', '#C98BB0', 'vegetable'],
    ['potato', 'Potatoes', '1 kg', 38, '🥔', 'round', '#C9A26B', 'vegetable aloo'],
    ['carrot', 'Ooty carrots', '500 g', 45, '🥕', 'round', '#F08A24', 'vegetable'],
    ['lemon', 'Lemons', '4 pcs', 20, '🍋', 'round', '#F4D53B', 'nimbu'],
    ['coconut', 'Tender coconut', '1 pc', 55, '🥥', 'round', '#7FB24A', 'elaneer'],
    ['chilli', 'Green chillies', '100 g', 12, '🌶️', 'round', '#4E9E3A', 'mirchi'],
    ['garlic', 'Garlic', '200 g', 40, '🧄', 'round', '#EDE3D2', ''],
    ['mango', 'Banganapalli mangoes', '1 kg', 160, '🥭', 'round', '#F6A623', 'fruit'],
    ['coriander', 'Coriander leaves', '1 bunch', 15, '🌿', 'round', '#3F9B4B', 'dhania herbs'],
  ],
  'dairy-bread': [
    ['milk', 'Toned milk', '500 ml', 27, '🥛', 'carton', '#3B7BE0', 'doodh'],
    ['curd', 'Fresh curd', '400 g', 40, '🥣', 'jar', '#7FB7F2', 'dahi yogurt'],
    ['butter', 'Salted butter', '100 g', 60, '🧈', 'box', '#F3C74A', ''],
    ['cheese', 'Cheese slices', '10 slices', 145, '🧀', 'box', '#F2A93B', ''],
    ['eggs', 'Farm eggs', '6 pcs', 54, '🥚', 'box', '#D9B68C', 'anda'],
    ['bread', 'Sandwich bread', '400 g', 45, '🍞', 'pouch', '#E8A35A', 'loaf'],
    ['brown-bread', 'Whole wheat bread', '400 g', 55, '🍞', 'pouch', '#9B6A3C', 'loaf brown'],
    ['ghee', 'Cow ghee', '500 ml', 320, '🫙', 'jar', '#E9B83A', ''],
    ['ice-cream', 'Vanilla ice cream', '700 ml tub', 180, '🍨', 'jar', '#F4E3C3', 'dessert'],
  ],
  staples: [
    ['rice', 'Sona masoori rice', '5 kg', 345, '🍚', 'pouch', '#D9534F', 'chawal'],
    ['atta', 'Whole wheat atta', '5 kg', 265, '🌾', 'pouch', '#E0A53B', 'flour'],
    ['toor-dal', 'Toor dal', '1 kg', 165, '🫘', 'pouch', '#E3B23C', 'lentils'],
    ['sugar', 'Sugar', '1 kg', 48, '🥄', 'pouch', '#5AA9E6', 'cheeni'],
    ['salt', 'Iodised salt', '1 kg', 28, '🧂', 'pouch', '#3F6FD1', 'namak'],
    ['oil', 'Sunflower oil', '1 L', 150, '🌻', 'pouch', '#F2B632', 'cooking oil'],
    ['tea', 'Tea powder', '250 g', 135, '🍵', 'box', '#B5352B', 'chai'],
    ['coffee', 'Filter coffee powder', '200 g', 120, '☕', 'pouch', '#6B3E26', 'kaapi'],
    ['honey', 'Honey', '250 g', 135, '🍯', 'jar', '#E39A1C', ''],
    ['groundnuts', 'Groundnuts', '500 g', 85, '🥜', 'pouch', '#B9773A', 'peanuts'],
    ['ragi', 'Ragi flour', '1 kg', 62, '🌾', 'pouch', '#7A4A3A', 'millet'],
    ['chilli-powder', 'Red chilli powder', '100 g', 45, '🌶️', 'pouch', '#C62828', 'masala spice'],
  ],
  snacks: [
    ['chips', 'Salted potato chips', '52 g', 20, '🍟', 'pouch', '#F2C12E', 'crisps'],
    ['noodles', 'Instant masala noodles', 'pack of 4', 56, '🍜', 'pouch', '#F2A21E', ''],
    ['biscuits', 'Glucose biscuits', '250 g', 30, '🍪', 'box', '#E8B04A', 'cookies'],
    ['chocolate', 'Milk chocolate bar', '50 g', 45, '🍫', 'box', '#5B2D8E', ''],
    ['cola', 'Cola', '750 ml', 40, '🥤', 'bottle', '#3A1D12', 'soft drink'],
    ['mango-juice', 'Mango juice', '1 L', 110, '🧃', 'carton', '#F59E0B', 'drink'],
    ['water', 'Drinking water', '1 L', 20, '💧', 'bottle', '#58B4E8', ''],
    ['popcorn', 'Butter popcorn', '90 g', 30, '🍿', 'pouch', '#E74C3C', ''],
    ['mixture', 'Mixture namkeen', '200 g', 55, '🥨', 'pouch', '#D9822B', 'snack'],
    ['lemon-soda', 'Lemon soda', '300 ml can', 35, '🍋', 'can', '#9BC53D', 'drink'],
  ],
  bakery: [
    ['cake', 'Chocolate truffle cake', '500 g', 420, '🎂', 'box', '#6B3E26', 'birthday'],
    ['croissant', 'Butter croissants', '2 pcs', 90, '🥐', 'pouch', '#D9A45B', ''],
    ['puff', 'Veg puffs', '2 pcs', 40, '🥟', 'pouch', '#D99A4E', ''],
    ['cookies', 'Butter cookies', '200 g', 85, '🍪', 'box', '#C98A3B', 'biscuits'],
    ['cupcake', 'Vanilla cupcakes', '4 pcs', 120, '🧁', 'box', '#F28FB0', ''],
    ['doughnut', 'Glazed doughnuts', '2 pcs', 80, '🍩', 'box', '#E86F8E', 'donut'],
    ['mysore-pak', 'Mysore pak', '250 g', 160, '🍮', 'box', '#E2A63B', 'sweet'],
    ['pav', 'Pav buns', '6 pcs', 35, '🥯', 'pouch', '#DDA35C', 'bread'],
  ],
  'personal-home': [
    ['soap', 'Bathing soap', '3 × 100 g', 99, '🧼', 'box', '#3FA7A0', ''],
    ['shampoo', 'Anti-dandruff shampoo', '180 ml', 165, '🧴', 'bottle', '#2F62C9', ''],
    ['toothpaste', 'Toothpaste', '150 g', 95, '🪥', 'tube', '#E0403A', ''],
    ['detergent', 'Detergent powder', '1 kg', 120, '🧺', 'pouch', '#2E7BD6', 'washing'],
    ['dishwash', 'Dishwash liquid', '500 ml', 105, '🍽️', 'bottle', '#8BC34A', ''],
    ['toilet-roll', 'Toilet rolls', '4 rolls', 140, '🧻', 'can', '#F3F1EC', 'tissue'],
    ['sponge', 'Scrub sponges', '3 pcs', 45, '🧽', 'box', '#F2C230', ''],
    ['candles', 'Candles', '6 pcs', 40, '🕯️', 'box', '#F1E3C8', ''],
    ['incense', 'Incense sticks', '100 sticks', 60, '🪔', 'box', '#8E3B7A', 'agarbatti'],
    ['handwash', 'Handwash refill', '750 ml', 99, '🫧', 'pouch', '#59B8C9', ''],
    ['razor', 'Disposable razors', '5 pcs', 85, '🪒', 'box', '#3B4A6B', ''],
  ],
  pharmacy: [
    ['paracetamol', 'Paracetamol 500 mg', 'strip of 10', 18, '💊', 'strip', '#E8ECEF', 'fever tablet'],
    ['bandage', 'Adhesive bandages', '20 pcs', 45, '🩹', 'box', '#E7B48A', 'plaster first aid'],
    ['thermometer', 'Digital thermometer', '1 pc', 199, '🌡️', 'box', '#3FA7A0', 'fever'],
    ['ors', 'ORS sachets', '4 × 21 g', 80, '🧪', 'box', '#F28C28', 'electrolyte'],
    ['antiseptic', 'Antiseptic liquid', '100 ml', 62, '🧴', 'bottle', '#8A5A2B', 'first aid'],
    ['masks', 'Surgical masks', '10 pcs', 50, '😷', 'box', '#6FB6E0', ''],
    ['sanitiser', 'Hand sanitiser', '100 ml', 50, '🧴', 'bottle', '#3DB4A5', 'sanitizer'],
    ['lozenges', 'Cough lozenges', 'strip of 8', 20, '🍬', 'strip', '#F2A93B', 'throat'],
    ['vitamin-c', 'Vitamin C chewables', 'strip of 15', 45, '🍊', 'strip', '#F59E0B', 'tablet'],
    ['cotton', 'Cotton roll', '100 g', 55, '☁️', 'pouch', '#DDE6F0', 'first aid'],
  ],
  stationery: [
    ['notebook', 'Long notebook, ruled', '172 pages', 65, '📓', 'book', '#2F62C9', 'book'],
    ['pens', 'Ball pens, blue', 'pack of 5', 50, '🖊️', 'box', '#1F4FBF', ''],
    ['pencils', 'Pencils with eraser', 'pack of 10', 60, '✏️', 'box', '#F2B632', ''],
    ['a4-paper', 'A4 paper', '100 sheets', 120, '📄', 'book', '#F3F1EC', 'print sheets'],
    ['stapler', 'Stapler with pins', '1 pc', 110, '📎', 'box', '#D8343B', ''],
    ['scissors', 'Scissors', '1 pc', 75, '✂️', 'box', '#E0403A', ''],
    ['glue', 'Glue stick', '15 g', 30, '📌', 'tube', '#7B4BC9', 'gum'],
    ['highlighters', 'Highlighters', 'pack of 4', 100, '🖍️', 'box', '#D7E23A', 'marker'],
    ['geometry-box', 'Geometry box', '1 set', 135, '📐', 'box', '#3B4A6B', 'compass ruler'],
    ['file', 'Project file folder', '1 pc', 25, '📁', 'book', '#F2B632', 'report'],
    ['calculator', 'Scientific calculator', '1 pc', 695, '🧮', 'box', '#2B2F3A', ''],
    ['record-book', 'Lab record book', '120 pages', 95, '📒', 'book', '#3E8E2F', 'notebook'],
  ],
  electronics: [
    ['charger', '20 W USB-C charger', '1 pc', 549, '⚡', 'box', '#2F62C9', 'adapter phone'],
    ['usb-cable', 'USB-C cable', '1 m', 199, '🔌', 'box', '#2B2F3A', 'charging wire'],
    ['earphones', 'Wired earphones', '1 pc', 399, '🎧', 'box', '#2B2F3A', 'headphones'],
    ['batteries', 'AA batteries', 'pack of 4', 90, '🔋', 'box', '#D8343B', 'cell'],
    ['bulb', '9 W LED bulb', '1 pc', 110, '💡', 'box', '#F2C230', 'light'],
    ['pen-drive', '32 GB pen drive', '1 pc', 449, '💾', 'box', '#3B4A6B', 'usb storage'],
    ['mouse', 'Wireless mouse', '1 pc', 599, '🖱️', 'box', '#3B4A6B', ''],
    ['power-bank', '10,000 mAh power bank', '1 pc', 999, '🔋', 'box', '#1E2A44', 'charger'],
    ['extension', '4-socket extension board', '1 pc', 349, '🔌', 'box', '#E0403A', 'power strip'],
    ['phone-stand', 'Mobile stand', '1 pc', 149, '📱', 'box', '#6B45C4', 'holder'],
    ['torch', 'LED torch', '1 pc', 220, '🔦', 'can', '#F28C28', 'flashlight'],
  ],
};

const products: Product[] = Object.entries(rows).flatMap(([cat, list]) =>
  list.map(([id, name, unit, mrp, emoji, shape, color, keywords = '']) => ({
    id, name, unit, mrp, emoji, shape, color, cat, keywords,
  })),
);

const stores: Store[] = [
  { id: 's-lakshmi', name: 'Sri Lakshmi Provision Store', kind: 'kirana', area: 'Banashankari 3rd Stage', lat: 12.9372, lng: 77.5392, open: [7, 22], prep: 5, load: 0.35, rating: 4.6 },
  { id: 's-hosakere', name: 'Hosakerehalli Daily Needs', kind: 'supermarket', area: 'Hosakerehalli', lat: 12.9288, lng: 77.5368, open: [6, 24], prep: 8, load: 0.6, rating: 4.3 },
  { id: 's-kathri', name: 'Kathriguppe Fresh Mart', kind: 'fresh', area: 'Kathriguppe', lat: 12.9302, lng: 77.5503, open: [6, 21], prep: 6, load: 0.3, rating: 4.5 },
  { id: 's-girinagar', name: 'Girinagar Medicals', kind: 'pharmacy', area: 'Girinagar', lat: 12.9441, lng: 77.5438, open: [0, 24], prep: 4, load: 0.25, rating: 4.7 },
  { id: 's-campus', name: 'Campus Xerox & Stationery', kind: 'stationery', area: 'Ring Road, near PES', lat: 12.9352, lng: 77.5361, open: [8, 21], prep: 4, load: 0.5, rating: 4.4 },
  { id: 's-ringroad', name: 'Ring Road Electronics', kind: 'electronics', area: 'Banashankari 3rd Stage', lat: 12.9329, lng: 77.5424, open: [10, 21], prep: 5, load: 0.2, rating: 4.2 },
  { id: 's-bsk-bakery', name: 'BSK Bakery & Sweets', kind: 'bakery', area: 'Banashankari 2nd Stage', lat: 12.9251, lng: 77.5562, open: [7, 22], prep: 7, load: 0.45, rating: 4.6 },
  { id: 's-jayanagar', name: 'Jayanagar Super Bazaar', kind: 'supermarket', area: 'Jayanagar 4th Block', lat: 12.9308, lng: 77.5831, open: [7, 23], prep: 9, load: 0.7, rating: 4.4 },
  { id: 's-4thblock', name: '4th Block Pharma', kind: 'pharmacy', area: 'Jayanagar 4th Block', lat: 12.9284, lng: 77.5802, open: [8, 23], prep: 4, load: 0.3, rating: 4.5 },
  { id: 's-gandhi', name: 'Gandhi Bazaar Fruit Stall', kind: 'fresh', area: 'Basavanagudi', lat: 12.9442, lng: 77.5719, open: [6, 21], prep: 5, load: 0.55, rating: 4.7 },
  { id: 's-jpnagar', name: 'JP Nagar Kirana Corner', kind: 'kirana', area: 'JP Nagar 2nd Phase', lat: 12.9082, lng: 77.5832, open: [7, 22], prep: 5, load: 0.3, rating: 4.3 },
  { id: 's-rrnagar', name: 'RR Nagar Home Needs', kind: 'supermarket', area: 'Rajarajeshwari Nagar', lat: 12.9171, lng: 77.5213, open: [7, 23], prep: 8, load: 0.4, rating: 4.2 },
  { id: 's-vijaya', name: 'Vijayanagar Stationers & Mobiles', kind: 'stationery', area: 'Vijayanagar', lat: 12.9702, lng: 77.5371, open: [9, 21], prep: 5, load: 0.35, rating: 4.1 },
  { id: 's-basava', name: 'Basavanagudi Stores', kind: 'kirana', area: 'Basavanagudi', lat: 12.9409, lng: 77.5752, open: [7, 22], prep: 6, load: 0.5, rating: 4.5 },
  { id: 's-koramangala', name: 'Koramangala Organic Co-op', kind: 'fresh', area: 'Koramangala 5th Block', lat: 12.9341, lng: 77.6201, open: [8, 21], prep: 7, load: 0.4, rating: 4.6 },
];

// Chance that a shop of each kind stocks a product from each category.
const CARRY: Record<StoreKind, Record<string, number>> = {
  kirana: { staples: 0.95, snacks: 0.9, 'dairy-bread': 0.8, 'personal-home': 0.75, 'fruits-veg': 0.35, stationery: 0.2 },
  supermarket: { staples: 1, snacks: 1, 'dairy-bread': 0.95, 'personal-home': 0.95, 'fruits-veg': 0.8, bakery: 0.5, stationery: 0.45, electronics: 0.3, pharmacy: 0.15 },
  fresh: { 'fruits-veg': 1, 'dairy-bread': 0.5 },
  pharmacy: { pharmacy: 1, 'personal-home': 0.6 },
  stationery: { stationery: 1, electronics: 0.55, snacks: 0.3 },
  electronics: { electronics: 1 },
  bakery: { bakery: 1, 'dairy-bread': 0.6, snacks: 0.5 },
};

const PRICE_EDGE: Record<StoreKind, number> = {
  kirana: 0.02, supermarket: 0.07, fresh: 0.05, pharmacy: 0.03, stationery: 0.04, electronics: 0.06, bakery: 0.02,
};

// Small deterministic hash so every visitor sees the same sample stock.
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function stockFor(s: Store, p: Product): Stock | null {
  const key = s.id + '|' + p.id;
  const chance = CARRY[s.kind][p.cat] ?? 0;
  if (hash('carry' + key) >= chance) return null;
  const discount = PRICE_EDGE[s.kind] + hash('price' + key) * 0.1;
  const price = Math.max(1, Math.round(p.mrp * (1 - discount)));
  const roll = hash('stock' + key);
  const stock = roll < 0.07 ? 0 : roll < 0.16 ? 1 + Math.floor(hash('low' + key) * 3) : 6 + Math.floor(roll * 40);
  return { price, stock };
}

const stock: Record<string, Stock> = {};
for (const s of stores) {
  for (const p of products) {
    const st = stockFor(s, p);
    if (st) stock[s.id + '|' + p.id] = st;
  }
}

export const SAMPLE: Dataset = { rev: 0, products, stores, stock };
