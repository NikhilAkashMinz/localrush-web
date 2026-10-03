// What a brand-new database starts with: the sample catalogue plus demo accounts.

import { PLACES } from '../lib/data';
import { SAMPLE } from '../lib/sample';
import type { User } from './types';

const PARTNER_NAMES = ['Ravi K.', 'Manjunath S.', 'Imran P.', 'Deepa R.'];

/** Shop owner numbers are 9000000001 onwards, in the order the shops are listed. */
export const ownerPhone = (index: number) => String(9000000001 + index);
/** Delivery partner numbers are 9100000001 onwards. */
export const partnerPhone = (index: number) => String(9100000001 + index);

export function seedUsers(): User[] {
  const owners: User[] = SAMPLE.stores.map((s, i) => ({
    id: 'u-owner-' + s.id,
    name: s.name + ' (owner)',
    phone: ownerPhone(i),
    role: 'shop',
    storeId: s.id,
    addresses: [],
    createdAt: 0,
  }));
  const partners: User[] = PARTNER_NAMES.map((name, i) => ({
    id: 'u-partner-' + (i + 1),
    name,
    phone: partnerPhone(i),
    role: 'partner',
    online: false,
    place: PLACES[0],
    addresses: [],
    createdAt: 0,
  }));
  return [...owners, ...partners];
}

export const seedCatalogue = () => ({
  products: SAMPLE.products.map((p) => ({ ...p })),
  stores: SAMPLE.stores.map((s) => ({ ...s })),
  stock: Object.fromEntries(Object.entries(SAMPLE.stock).map(([k, v]) => [k, { ...v }])),
});
