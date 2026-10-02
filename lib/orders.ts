// Order progress. There is no backend yet, so an order moves through its stages on a
// compressed demo clock: a whole delivery plays out in about a minute. When the shop
// and delivery partner apps exist, they set these stages instead.

import type { Line } from './select';

export type Order = {
  id: string;
  placedAt: number;
  storeId: string;
  lines: Line[];
  subtotal: number;
  fee: number;
  total: number;
  address: string;
  payment: 'cod' | 'online';
  etaMin: number;
  distKm: number;
  otp: string;
  partner: string;
  /** Seconds skipped ahead with the demo control. */
  skip: number;
};

export const STAGES = [
  { key: 'placed', label: 'Order placed', note: 'Sent to the shop' },
  { key: 'accepted', label: 'Shop accepted', note: 'Your items are being packed' },
  { key: 'packed', label: 'Packed', note: 'Looking for a delivery partner nearby' },
  { key: 'assigned', label: 'Partner assigned', note: 'Riding to the shop' },
  { key: 'picked', label: 'Picked up', note: 'On the way to you' },
  { key: 'delivered', label: 'Delivered', note: 'Enjoy' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];

function starts(o: Order) {
  const ride = Math.min(40, Math.max(18, o.etaMin * 1.6));
  return [0, 7, 17, 24, 36, 36 + ride];
}

export type Progress = {
  stage: number;
  /** 0 to 1 through the current stage. */
  frac: number;
  /** Rider position: 0 to 1 is the ride to the shop, 1 to 2 is the ride to the customer. */
  rider: number;
  minutesLeft: number;
  done: boolean;
};

export function progress(o: Order, now: number): Progress {
  const t = (now - o.placedAt) / 1000 + o.skip;
  const s = starts(o);
  let stage = 0;
  for (let i = 0; i < s.length; i++) if (t >= s[i]) stage = i;
  const done = stage === s.length - 1;
  const frac = done ? 1 : Math.min(1, (t - s[stage]) / (s[stage + 1] - s[stage]));
  const rider = stage < 3 ? 0 : stage === 3 ? frac : stage === 4 ? 1 + frac : 2;
  const end = s[s.length - 1];
  const minutesLeft = done ? 0 : Math.max(1, Math.ceil(((end - t) / end) * o.etaMin));
  return { stage, frac, rider, minutesLeft, done };
}

/** Seconds to add to `skip` so the order jumps to the start of its next stage. */
export function secondsToNextStage(o: Order, now: number) {
  const t = (now - o.placedAt) / 1000 + o.skip;
  const s = starts(o);
  const next = s.find((x) => x > t);
  return next === undefined ? 0 : next - t + 0.05;
}

export const PARTNERS = ['Ravi K.', 'Manjunath S.', 'Imran P.', 'Deepa R.', 'Suresh B.', 'Kavya N.'];
