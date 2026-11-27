// How this copy of LocalRush runs, from its environment variables.
//
// "demo" is the showcase: sample shops and stock, ready-made shop owner and partner accounts,
// and any 4-digit code logs in. "live" is the real service: people log in with a code sent by
// SMS (Firebase), there is no sample data, and shops and partners are added by an admin.
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

/** How people log in here: a real SMS code, the demo's any 4 digits, or not at all yet. */
export function loginMethod(): 'sms' | 'demo' | 'off' {
  if (firebaseConfig()) return 'sms';
  return isLive() ? 'off' : 'demo';
}

/** The mobile numbers allowed to add shops and partners (ADMIN_PHONES, comma separated). */
export function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES ?? '')
    .split(/[\s,;]+/)
    .map((p) => p.replace(/\D/g, '').slice(-10))
    .filter((p) => /^[6-9]\d{9}$/.test(p));
}

/** Contact details shown on the privacy page, so people know whom to ask. */
export const supportContact = () => process.env.SUPPORT_CONTACT?.trim() || '';

/** A live server must sign its logins with its own secret; the built-in one is public. */
export const missingSecret = () => isLive() && !process.env.SESSION_SECRET;
