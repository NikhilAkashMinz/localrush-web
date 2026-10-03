// Login sessions: a signed cookie holding the user's id. No session table needed.
// The signature stops anyone editing the cookie to become someone else.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A "seat" is which side of LocalRush a page belongs to. Each seat has its own login cookie,
 * so one browser can be a customer in one tab, a shop owner in a second and a delivery
 * partner in a third. A page says which seat it is; the server then reads only that cookie
 * and checks the account really is of that kind.
 */
export type Seat = 'customer' | 'shop' | 'partner';
const SEATS: Seat[] = ['customer', 'shop', 'partner'];
const cookieName = (seat: Seat) => 'lr_' + seat;
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Which seat a page address belongs to. The website has the same rule in lib/api.ts. */
export const seatForPath = (path: string): Seat =>
  path.startsWith('/dashboard') ? 'shop' : path.startsWith('/partner') ? 'partner' : 'customer';

/**
 * Which seat a request is for: the X-LocalRush-Seat header, or ?seat= for the live stream.
 * If neither is there, go by the page the request came from, so a shop or partner page
 * can never act on the customer's login by accident.
 */
export function seatOf(request: Request): Seat {
  const asked = request.headers.get('x-localrush-seat') ?? new URL(request.url).searchParams.get('seat');
  if (SEATS.includes(asked as Seat)) return asked as Seat;
  const from = request.headers.get('referer');
  if (from) {
    try {
      return seatForPath(new URL(from).pathname);
    } catch {
      // Not a usable address: fall through to the default.
    }
  }
  return 'customer';
}

function secret() {
  // Set SESSION_SECRET to a long random string in any real deployment. The fallback is the
  // same on every copy of the server so logins keep working in development and in the demo.
  return process.env.SESSION_SECRET || 'localrush-demo-secret-change-me';
}

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');

export function sessionCookie(userId: string, seat: Seat) {
  const value = Buffer.from(JSON.stringify({ u: userId, t: Date.now() })).toString('base64url');
  return `${cookieName(seat)}=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = (seat: Seat) => `${cookieName(seat)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The user id in this seat's login cookie, or null if there is none or it was tampered with. */
export function readSession(request: Request, seat: Seat): string | null {
  const COOKIE = cookieName(seat);
  const header = request.headers.get('cookie') ?? '';
  const raw = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [value, signature] = raw.slice(COOKIE.length + 1).split('.');
  if (!value || !signature) return null;
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(value, 'base64url').toString()) as { u?: unknown; t?: unknown };
    if (typeof data.u !== 'string' || typeof data.t !== 'number') return null;
    if (Date.now() - data.t > MAX_AGE * 1000) return null;
    return data.u;
  } catch {
    return null;
  }
}
