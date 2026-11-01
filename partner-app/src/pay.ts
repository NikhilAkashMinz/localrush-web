// Delivery pay. The server decides it (lib/orders.ts on the website) and sends it with every
// job; this copy of the rule is only for showing it and for orders made before pay was saved.

import type { Order } from './types';

export const PAY_BASE = 20;
export const PAY_PER_KM = 5;

export const payOf = (o: Pick<Order, 'partnerPay' | 'pickupKm' | 'distKm'>) =>
  o.partnerPay ?? Math.round(PAY_BASE + PAY_PER_KM * ((o.pickupKm ?? 0) + o.distKm));

/** When the order was handed over. Older orders only have it in their history. */
export const deliveredAt = (o: Order) =>
  o.deliveredAt ?? [...o.history].reverse().find((h) => h.status === 'delivered')?.at ?? o.updatedAt;

/** When the shop finished packing it. */
export const packedAt = (o: Order) => [...o.history].reverse().find((h) => h.status === 'packed')?.at ?? o.updatedAt;
