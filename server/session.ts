// Login sessions: a signed cookie holding the user's id. No session table needed.
// The signature stops anyone editing the cookie to become someone else.

import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'lr_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  // Set SESSION_SECRET to a long random string in any real deployment. The fallback is the
  // same on every copy of the server so logins keep working in development and in the demo.
  return process.env.SESSION_SECRET || 'localrush-demo-secret-change-me';
}

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');

export function sessionCookie(userId: string) {
  const value = Buffer.from(JSON.stringify({ u: userId, t: Date.now() })).toString('base64url');
  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The user id in the request's session cookie, or null if there is none or it was tampered with. */
export function readSession(request: Request): string | null {
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
