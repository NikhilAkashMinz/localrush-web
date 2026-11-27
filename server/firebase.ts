// Checking a Firebase sign-in. The browser (or phone app) proves the person owns a mobile
// number by entering the SMS code Firebase sent; Firebase then gives it an ID token, a JWT
// signed by Google. This file checks that token the way Firebase documents it: the signature
// against Google's published keys, then who issued it, for which project, and when.
// Only Node's crypto is used: no Firebase Admin SDK and no service-account key is needed.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

import { createVerify } from 'node:crypto';

const KEYS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** Leeway for clocks that differ a little between Google and this server. */
const SKEW_S = 300;

/** Key id to PEM (a certificate from Google, or a public key in the tests). */
type Keys = Record<string, string>;
type KeySource = () => Promise<{ keys: Keys; maxAgeMs: number }>;

async function googleKeys() {
  const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Google's sign-in keys could not be fetched (${response.status}).`);
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { keys: (await response.json()) as Keys, maxAgeMs: maxAge * 1000 };
}

let source: KeySource = googleKeys;
let cached: { keys: Keys; until: number } | null = null;

/** Tests only: sign tokens with these keys instead of Google's. */
export function useFirebaseKeys(s: KeySource) {
  source = s;
  cached = null;
}

async function keyFor(kid: string): Promise<string | undefined> {
  // Google rotates its keys; an unknown key id means it is time to fetch them again.
  if (!cached || Date.now() > cached.until || !cached.keys[kid]) {
    const { keys, maxAgeMs } = await source();
    cached = { keys, until: Date.now() + maxAgeMs };
  }
  return cached.keys[kid];
}

const part = <T>(text: string): T => JSON.parse(Buffer.from(text, 'base64url').toString('utf8')) as T;

type Claims = { aud?: unknown; iss?: unknown; sub?: unknown; exp?: unknown; iat?: unknown; auth_time?: unknown; phone_number?: unknown };

/**
 * The mobile number a Firebase ID token proves, as 10 digits, or an Error saying why not.
 * Only Indian numbers (+91) are accepted, like everywhere else in LocalRush.
 */
export async function verifyIdToken(token: string, projectId: string): Promise<{ uid: string; phone: string }> {
  const [h, p, s, extra] = token.split('.');
  if (!h || !p || !s || extra !== undefined) throw new Error('not a token');
  const header = part<{ alg?: string; kid?: string }>(h);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('wrong kind of token');
  const key = await keyFor(header.kid);
  if (!key) throw new Error('signed with an unknown key');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${h}.${p}`);
  if (!verifier.verify(key, Buffer.from(s, 'base64url'))) throw new Error('bad signature');

  const c = part<Claims>(p);
  const now = Math.floor(Date.now() / 1000);
  if (c.aud !== projectId) throw new Error('made for another project');
  if (c.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('issued by someone else');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw new Error('no user');
  if (typeof c.exp !== 'number' || c.exp + SKEW_S < now) throw new Error('expired');
  if (typeof c.iat !== 'number' || c.iat - SKEW_S > now) throw new Error('issued in the future');
  if (typeof c.auth_time !== 'number' || c.auth_time - SKEW_S > now) throw new Error('signed in in the future');
  const phone = typeof c.phone_number === 'string' ? /^\+91([6-9]\d{9})$/.exec(c.phone_number)?.[1] : undefined;
  if (!phone) throw new Error('not an Indian mobile number');
  return { uid: c.sub, phone };
}
