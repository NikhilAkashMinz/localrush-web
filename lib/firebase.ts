'use client';

// Logging in with a code sent by SMS. On the live service Firebase sends the SMS and checks the
// code; the page then hands Firebase's signed token to our server, which reads the proven mobile
// number from it (server/firebase.ts). In the demo there is no SMS and any 4 digits work.
// Firebase is only loaded once someone asks for a code, so it never slows other pages down.

import { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { api } from './api';

export type SiteConfig = {
  /** "live" is the real service, "demo" the showcase with sample shops. */
  mode: 'live' | 'demo';
  /** "sms" sends a real code, "demo" accepts any 4 digits, "off" means login is not set up yet. */
  login: 'sms' | 'demo' | 'off';
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

/** What the server needs to log someone in: a demo code, or Firebase's proof of the number. */
export type LoginProof = { phone?: string; code?: string; idToken?: string };

// Firebase's error codes, in words a customer can act on. Some only an admin can fix.
const SMS_ERRORS: Record<string, string> = {
  'auth/invalid-phone-number': 'That mobile number does not look right.',
  'auth/too-many-requests': 'Too many tries from this device. Wait a while and try again.',
  'auth/quota-exceeded': 'We cannot send more codes right now. Try again in a little while.',
  'auth/invalid-verification-code': 'That code is not right. Check the SMS and try again.',
  'auth/code-expired': 'That code has expired. Ask for a new one.',
  'auth/missing-verification-code': 'Enter the code from the SMS.',
  'auth/captcha-check-failed': 'The security check did not pass. Reload the page and try again.',
  'auth/invalid-app-credential': 'The security check did not pass. Reload the page and try again.',
  'auth/network-request-failed': 'Could not reach the SMS service. Check your connection and try again.',
  'auth/operation-not-allowed': 'Login by SMS is not switched on yet. (Admin: enable Phone sign-in in Firebase.)',
  'auth/billing-not-enabled': 'SMS codes cannot be sent yet. (Admin: Firebase needs the pay-as-you-go plan.)',
  'auth/unauthorized-domain': 'This site may not send codes yet. (Admin: add it to Firebase\'s authorised domains.)',
};

const smsError = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return new Error((code && SMS_ERRORS[code]) || 'The code could not be sent. Try again.');
};

/**
 * What a login form needs, whichever way this server logs people in. `captchaId` is the id of an
 * empty element in the form: Firebase puts its invisible "are you a person?" check there.
 */
export function usePhoneLogin(captchaId: string) {
  const config = useSiteConfig();
  const sent = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const sms = config?.login === 'sms' && !!config.firebase;

  useEffect(
    () => () => {
      verifier.current?.clear();
      verifier.current = null;
    },
    [],
  );

  return {
    config,
    sms,
    /** Login is not set up on this server yet. */
    off: config?.login === 'off',
    codeLength: sms ? 6 : 4,

    /** Send the code to +91 and this number. In the demo there is nothing to send. */
    async send(phone: string): Promise<void> {
      if (!sms || !config?.firebase) return;
      const { getApps, initializeApp } = await import('firebase/app');
      const { getAuth, RecaptchaVerifier: Verifier, signInWithPhoneNumber } = await import('firebase/auth');
      const app = getApps()[0] ?? initializeApp(config.firebase);
      const auth = getAuth(app);
      auth.languageCode = 'en';
      verifier.current?.clear();
      verifier.current = new Verifier(auth, captchaId, { size: 'invisible' });
      try {
        sent.current = await signInWithPhoneNumber(auth, '+91' + phone, verifier.current);
      } catch (e) {
        verifier.current?.clear();
        verifier.current = null;
        throw smsError(e);
      }
    },

    /** Check the code and turn it into what our server needs to log the person in. */
    async proof(phone: string, code: string): Promise<LoginProof> {
      if (!sms) return { phone, code };
      if (!sent.current) throw new Error('Ask for a code first.');
      try {
        const credential = await sent.current.confirm(code);
        const idToken = await credential.user.getIdToken();
        // Our server keeps the login from here on; Firebase need not remember this person.
        const { getAuth, signOut } = await import('firebase/auth');
        void signOut(getAuth()).catch(() => undefined);
        return { idToken };
      } catch (e) {
        throw smsError(e);
      }
    },
  };
}
