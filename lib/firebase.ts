'use client';

// Logging in through Firebase on the live service: "Continue with Google", or an email and a
// password. Firebase checks the person and gives the page a token signed by Google; our server
// reads the verified email from it (server/firebase.ts) and keeps the login from there on.
// Both ways are free on Firebase's no-cost plan. In the demo there is no Firebase: the phone
// number and any 4 digits work. Firebase is only loaded once someone starts to log in.

import { useEffect, useState } from 'react';
import type { Auth, User as FirebaseUser } from 'firebase/auth';
import { api } from './api';

export type SiteConfig = {
  /** "live" is the real service, "demo" the showcase with sample shops. */
  mode: 'live' | 'demo';
  /** "firebase" means Google or email and password, "demo" any 4 digits, "off" not set up yet. */
  login: 'firebase' | 'demo' | 'off';
  firebase: { apiKey: string; authDomain: string; projectId: string } | null;
};

let asked: Promise<SiteConfig> | null = null;

/** This server's settings, asked for once per page. */
export function siteConfig(): Promise<SiteConfig> {
  asked ??= api<SiteConfig>('GET', 'config').catch((e: unknown) => {
    asked = null;
    throw e;
  });
  return asked;
}

export function useSiteConfig(): SiteConfig | null {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  useEffect(() => {
    let dead = false;
    siteConfig().then(
      (c) => !dead && setConfig(c),
      // Server unreachable: behave like the demo, so the page still shows something sensible.
      () => !dead && setConfig({ mode: 'demo', login: 'demo', firebase: null }),
    );
    return () => {
      dead = true;
    };
  }, []);
  return config;
}

/** What the server needs to log someone in: a demo code, or Firebase's signed token. */
export type LoginProof = { phone?: string; code?: string; idToken?: string };

/** The person closed the Google window: not an error to show. */
export class Cancelled extends Error {}

/** Firebase's error codes, in words a person can act on. Some only an admin can fix. */
const ERRORS: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/invalid-credential': 'That email and password do not match. Check them, or reset your password.',
  'auth/wrong-password': 'That email and password do not match. Check them, or reset your password.',
  'auth/user-not-found': 'That email and password do not match. Check them, or create an account.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/email-already-in-use': 'There is already an account with that email. Log in instead, or reset its password.',
  'auth/weak-password': 'Choose a password of at least 8 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Could not reach the login service. Check your connection and try again.',
  'auth/account-exists-with-different-credential': 'This email already logs in another way. Try "Continue with Google", or your email and password.',
  'auth/operation-not-allowed': 'This way of logging in is not switched on yet. (Admin: enable it in Firebase Authentication.)',
  'auth/unauthorized-domain': 'This site may not log people in yet. (Admin: add it to Firebase\'s authorised domains.)',
  'auth/unauthorized-continue-uri': 'This site may not log people in yet. (Admin: add it to Firebase\'s authorised domains.)',
};

function failure(e: unknown): Error {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return new Cancelled('cancelled');
  return new Error(ERRORS[code] || 'Logging in did not work. Please try again.');
}

async function firebase(config: SiteConfig) {
  if (!config.firebase) throw new Error('Logging in is not set up on this server yet.');
  const { getApps, initializeApp } = await import('firebase/app');
  const fb = await import('firebase/auth');
  const auth: Auth = fb.getAuth(getApps()[0] ?? initializeApp(config.firebase));
  auth.languageCode = 'en';
  return { fb, auth };
}

/** Where Firebase's emails send the person back to: this page. */
const here = () => ({ url: window.location.origin + window.location.pathname });

/** Turn a Firebase sign-in into our server's proof, then let Firebase forget it: our server keeps the login. */
async function proofFrom(user: FirebaseUser, auth: Auth): Promise<LoginProof> {
  const idToken = await user.getIdToken();
  const { signOut } = await import('firebase/auth');
  void signOut(auth).catch(() => undefined);
  return { idToken };
}

/** "Continue with Google": Google's own window opens to choose the account. */
export async function googleProof(config: SiteConfig): Promise<LoginProof> {
  const { fb, auth } = await firebase(config);
  try {
    const { user } = await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
    return await proofFrom(user, auth);
  } catch (e) {
    throw failure(e);
  }
}

/** An email address that has not been confirmed yet. The page offers to send the link again. */
export class Unconfirmed extends Error {}

/** Log in with an email and password. An address not yet confirmed cannot log in. */
export async function passwordProof(config: SiteConfig, email: string, password: string): Promise<LoginProof> {
  const { fb, auth } = await firebase(config);
  let user: FirebaseUser;
  try {
    ({ user } = await fb.signInWithEmailAndPassword(auth, email, password));
  } catch (e) {
    throw failure(e);
  }
  if (!user.emailVerified) {
    void fb.signOut(auth).catch(() => undefined);
    throw new Unconfirmed(`Confirm your email first: open the link we sent to ${email}, then log in here.`);
  }
  return proofFrom(user, auth);
}

/** Make a new email and password account, and send the link that confirms the address. */
export async function createAccount(config: SiteConfig, email: string, password: string): Promise<void> {
  const { fb, auth } = await firebase(config);
  try {
    const { user } = await fb.createUserWithEmailAndPassword(auth, email, password);
    await fb.sendEmailVerification(user, here());
    await fb.signOut(auth);
  } catch (e) {
    throw failure(e);
  }
}

/** Send the confirmation link again. Needs the password, to prove it is the person's own account. */
export async function resendConfirmation(config: SiteConfig, email: string, password: string): Promise<void> {
  const { fb, auth } = await firebase(config);
  try {
    const { user } = await fb.signInWithEmailAndPassword(auth, email, password);
    if (!user.emailVerified) await fb.sendEmailVerification(user, here());
    await fb.signOut(auth);
  } catch (e) {
    throw failure(e);
  }
}

/** Email a link to choose a new password. */
export async function resetPassword(config: SiteConfig, email: string): Promise<void> {
  const { fb, auth } = await firebase(config);
  try {
    await fb.sendPasswordResetEmail(auth, email, here());
  } catch (e) {
    throw failure(e);
  }
}
