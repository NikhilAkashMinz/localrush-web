// Small helpers for reading orders, the same rules as the website's lib/orders.ts.

import type { Order, OrderLine, Status } from './types';

/** How each step reads to the shop. */
export const STATUS_TEXT: Record<Status, string> = {
  placed: 'New',
  accepted: 'Packing',
  packed: 'Ready for pickup',
  assigned: 'Partner on the way',
  picked: 'Out for delivery',
  delivered: 'Delivered',
  rejected: 'Turned down',
  cancelled: 'Cancelled',
};

export const isDone = (s: Status) => s === 'delivered' || s === 'cancelled' || s === 'rejected';

/** After this long, a new order nobody has answered is shown as late, as on the website. */
export const LATE_MS = 2 * 60_000;

/** When the order reached the step it is in now. */
export const since = (o: Order) => o.history[o.history.length - 1]?.at ?? o.updatedAt;

/** When the order was handed over. Older orders only have it in their history. */
export const deliveredAt = (o: Order) =>
  o.deliveredAt ?? [...o.history].reverse().find((h) => h.status === 'delivered')?.at ?? o.updatedAt;

/** The product name saved with the order line. */
export const lineName = (l: OrderLine) => l.name ?? l.pid;
