// Logging in on the live LocalRush service, with the same accounts as the website: an email and
// a password, kept by Firebase. The app asks Firebase directly, through the public REST API that
// Firebase's own web library uses, and gets back Firebase's signed proof of who the person is
// (an ID token). The LocalRush server checks that proof itself, so the password never reaches it.
// The settings come from the server (GET /api/config), so nothing is built into the app.

export type FirebaseSettings = { apiKey: string; projectId: string };

const BASE = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const TIMEOUT_MS = 15_000;

/** Firebase's error codes, as words a person can act on. */
const MESSAGES: Record<string, string> = {
  INVALID_LOGIN_CREDENTIALS: 'That email and password do not match. Check them, or set a new password below.',
  INVALID_PASSWORD: 'That email and password do not match. Check them, or set a new password below.',
  EMAIL_NOT_FOUND: 'That email and password do not match. Check them, or set a new password below.',
  INVALID_EMAIL: 'That email address does not look right.',
  MISSING_EMAIL: 'Enter your email address.',
  MISSING_PASSWORD: 'Enter your password.',
  USER_DISABLED: 'This login has been switched off. Ask the LocalRush team.',
  EMAIL_EXISTS: 'That email already has a LocalRush login. Log in with its password, or set a new one below.',
  WEAK_PASSWORD: 'Choose a password of at least 8 characters.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes and try again.',
  OPERATION_NOT_ALLOWED: 'Logging in with an email is not switched on yet. (Admin: enable Email/Password in Firebase Authentication.)',
  API_KEY_INVALID: 'This server\'s login settings are wrong. (Admin: check FIREBASE_API_KEY.)',
};

async function ask<T>(settings: FirebaseSettings, action: string, body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE}${action}?key=${encodeURIComponent(settings.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error('Could not reach the login service. Check this phone\'s internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    // For example "WEAK_PASSWORD : Password should be at least 6 characters".
    const code = (data?.error?.message ?? '').split(/[\s:]/)[0];
    throw new Error(MESSAGES[code] ?? 'Logging in did not work. Please try again.');
  }
  return data as T;
}

/** Firebase's proof that this is the person with that email and password. */
export async function signIn(settings: FirebaseSettings, email: string, password: string): Promise<string> {
  const { idToken } = await ask<{ idToken: string }>(settings, 'signInWithPassword', { email, password, returnSecureToken: true });
  return idToken;
}

/** Make a login for an email that has none yet, and send the email that confirms the address is theirs. */
export async function createLogin(settings: FirebaseSettings, email: string, password: string): Promise<void> {
  const { idToken } = await ask<{ idToken: string }>(settings, 'signUp', { email, password, returnSecureToken: true });
  await sendConfirmation(settings, idToken);
}

/** Send the "confirm your email" message again. */
export async function sendConfirmation(settings: FirebaseSettings, idToken: string): Promise<void> {
  await ask(settings, 'sendOobCode', { requestType: 'VERIFY_EMAIL', idToken });
}

/**
 * Email a link for choosing a new password. It also gives a password to someone who logs in to
 * the website with Google, so they can use the same account here.
 */
export async function sendPasswordLink(settings: FirebaseSettings, email: string): Promise<void> {
  await ask(settings, 'sendOobCode', { requestType: 'PASSWORD_RESET', email });
}
