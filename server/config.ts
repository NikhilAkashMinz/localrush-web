// How this copy of LocalRush runs, from its environment variables.
//
// "demo" is the showcase: sample shops and stock, ready-made shop owner and partner accounts,
// and any 4-digit code logs in. "live" is the real service: people log in through Firebase
// (their Google account, or an email and password), there is no sample data, and shops and
// partners are added by an admin.
//
// LOCALRUSH_MODE chooses. Without it, a production server (NODE_ENV=production, as in the
// Docker image) is live and everything else (npm run dev, the tests) is demo, so a real
// deployment can never fall back to demo logins by accident.

export type Mode = 'live' | 'demo';

export function mode(): Mode {
  const set = process.env.LOCALRUSH_MODE;
  if (set === 'live' || set === 'demo') return set;
  return process.env.NODE_ENV === 'production' ? 'live' : 'demo';
}

export const isLive = () => mode() === 'live';

/** The public settings a browser needs to send SMS codes with Firebase. Null when not set up. */
export function firebaseConfig(): { apiKey: string; authDomain: string; projectId: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  if (!projectId || !apiKey) return null;
  return { apiKey, projectId, authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com` };
}

/**
 * How people log in here: with Firebase (Google, or email and password), the demo's phone
 * number and any 4 digits, or not at all yet (a live server without Firebase settings).
 */
export function loginMethod(): 'firebase' | 'demo' | 'off' {
  if (firebaseConfig()) return 'firebase';
  return isLive() ? 'off' : 'demo';
}

const list = (value: string | undefined) => (value ?? '').split(/[\s,;]+/).filter(Boolean);

/** The emails allowed to add shops and partners (ADMIN_EMAILS, comma separated). */
export const adminEmails = () => list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());

/** Mobile numbers allowed to do the same, for a server that logs in by SMS (ADMIN_PHONES). */
export const adminPhones = () =>
  list(process.env.ADMIN_PHONES)
    .map((p) => p.replace(/\D/g, '').slice(-10))
    .filter((p) => /^[6-9]\d{9}$/.test(p));

/**
 * SAMPLE_SHOPS=true: a live database that starts with no shops gets the 15 sample shops with
 * their stock and prices, labelled "Sample", so the site has shops from the first visit. The
 * demo always has them. Admins can also add them later from the admin page.
 */
export const sampleShops = () => process.env.SAMPLE_SHOPS === 'true';

/** Contact details shown on the privacy page, so people know whom to ask. */
export const supportContact = () => process.env.SUPPORT_CONTACT?.trim() || '';

/** A live server must sign its logins with its own secret; the built-in one is public. */
export const missingSecret = () => isLive() && !process.env.SESSION_SECRET;
