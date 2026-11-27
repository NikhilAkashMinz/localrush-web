'use client';

// The live service's login: "Continue with Google", or an email and password. The customer
// login page uses it, and so do the shop dashboard and the delivery screen (each logs in only
// its own kind of account). Firebase checks the person; our server then keeps the login.
// New email accounts confirm their address by a link first, so nobody can claim someone
// else's email (an admin adds shop owners and partners by email).

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ApiFail, errorText, type Me } from '@/lib/api';
import {
  Cancelled,
  createAccount,
  googleProof,
  passwordProof,
  resendConfirmation,
  resetPassword,
  Unconfirmed,
  type LoginProof,
  type SiteConfig,
} from '@/lib/firebase';
import { actions } from '@/lib/state';
import type { Mood } from './Vendors';

/** The name typed when creating an email account, kept until the first login after confirming. */
const NAME_KEY = (email: string) => 'lr:new-name:' + email.toLowerCase();

function savedName(email: string) {
  try {
    return localStorage.getItem(NAME_KEY(email)) ?? '';
  } catch {
    return '';
  }
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

type Props = {
  config: SiteConfig;
  /** Customers may create an account here; shop owners and partners are added by an admin. */
  seat: 'customer' | 'shop' | 'partner';
  /** The look of the form fields on the page around it. */
  fieldClass?: string;
  onDone: (user: Me) => void;
  onMood?: (mood: Mood) => void;
};

export default function FirebaseLogin({ config, seat, fieldClass = 'field', onDone, onMood }: Props) {
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'' | 'google' | 'email' | 'resend' | 'reset' | 'name'>('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  // A sign-in that worked but needs a name before the account can be made.
  const [askName, setAskName] = useState(false);
  const pending = useRef<LoginProof | null>(null);
  const customer = seat === 'customer';

  const fail = (message: string) => {
    setError(message);
    onMood?.('sad');
  };

  /** Hand Firebase's proof to our server, which logs this person in on this page's seat. */
  const finish = async (proof: LoginProof, typedName = '') => {
    try {
      const user = await actions.login({ name: typedName || name.trim() || savedName(email), ...proof });
      try {
        localStorage.removeItem(NAME_KEY(email));
      } catch {
        // Nothing to tidy.
      }
      onMood?.('happy');
      onDone(user);
    } catch (e) {
      if (e instanceof ApiFail && e.code === 'name') {
        pending.current = proof;
        setAskName(true);
        setError('');
        return;
      }
      fail(errorText(e));
    }
  };

  const google = async () => {
    setError('');
    setInfo('');
    setBusy('google');
    try {
      await finish(await googleProof(config));
    } catch (e) {
      if (!(e instanceof Cancelled)) fail(errorText(e));
    }
    setBusy('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setUnconfirmed(false);
    const address = email.trim();
    if (mode === 'create' && customer && name.trim().length < 2) return fail('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return fail('Enter your email address.');
    if (mode === 'create' && password.length < 8) return fail('Choose a password of at least 8 characters.');
    if (!password) return fail('Enter your password.');
    setBusy('email');
    try {
      if (mode === 'create') {
        await createAccount(config, address, password);
        try {
          if (customer) localStorage.setItem(NAME_KEY(address), name.trim());
        } catch {
          // The name is asked for again at the first login.
        }
        setMode('login');
        setUnconfirmed(true);
        setInfo(`Almost there: we have sent a link to ${address}. Open it to confirm your email, then log in here with your password.`);
        onMood?.('idle');
      } else {
        await finish(await passwordProof(config, address, password));
      }
    } catch (err) {
      if (err instanceof Unconfirmed) setUnconfirmed(true);
      fail(errorText(err));
    }
    setBusy('');
  };

  const resend = async () => {
    setError('');
    setBusy('resend');
    try {
      await resendConfirmation(config, email.trim(), password);
      setInfo(`We have sent the link to ${email.trim()} again. It can take a minute; check spam too.`);
    } catch (e) {
      fail(errorText(e));
    }
    setBusy('');
  };

  const forgot = async () => {
    setError('');
    setInfo('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail('Enter your email address first, then choose "Forgot your password?".');
    setBusy('reset');
    try {
      await resetPassword(config, email.trim());
      setInfo(`If there is an account for ${email.trim()}, we have emailed it a link to choose a new password.`);
    } catch (e) {
      fail(errorText(e));
    }
    setBusy('');
  };

  if (askName) {
    return (
      <form
        className="fb-login"
        onSubmit={async (e) => {
          e.preventDefault();
          if (name.trim().length < 2) return fail('Enter your name.');
          setBusy('name');
          await finish(pending.current ?? {}, name.trim());
          setBusy('');
        }}
        noValidate
      >
        <p>One last thing: what should we call you?</p>
        <label className={fieldClass}>
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus onFocus={() => onMood?.('watch')} />
        </label>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-wide" disabled={busy !== ''}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    );
  }

  return (
    <div className="fb-login">
      <button type="button" className="btn btn-wide btn-google" onClick={google} disabled={busy !== ''}>
        <GoogleMark />
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </button>

      <p className="fb-or">
        <span>or with your email</span>
      </p>

      <form onSubmit={submit} noValidate>
        {mode === 'create' && customer && (
          <label className={fieldClass}>
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" onFocus={() => onMood?.('watch')} />
          </label>
        )}
        <label className={fieldClass}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            onFocus={() => onMood?.('watch')}
          />
        </label>
        <label className={fieldClass}>
          <span>{mode === 'create' ? 'Choose a password (8 or more characters)' : 'Password'}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            onFocus={() => onMood?.('hide')}
            onBlur={() => onMood?.('idle')}
          />
        </label>

        {info && (
          <p className="note" role="status">
            {info}
          </p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-wide" disabled={busy !== ''}>
          {busy === 'email' ? (mode === 'create' ? 'Creating your account…' : 'Logging you in…') : mode === 'create' ? 'Create account' : 'Log in'}
        </button>

        <p className="fb-links">
          {unconfirmed && password && (
            <button type="button" className="link" onClick={resend} disabled={busy !== ''}>
              {busy === 'resend' ? 'Sending…' : 'Send the confirmation link again'}
            </button>
          )}
          {mode === 'login' ? (
            <>
              <button type="button" className="link" onClick={forgot} disabled={busy !== ''}>
                {busy === 'reset' ? 'Sending…' : 'Forgot your password?'}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('create');
                  setError('');
                  setInfo('');
                }}
              >
                {customer ? 'New here? Create an account' : 'First time? Set a password for your email'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Already have an account? Log in
            </button>
          )}
        </p>
      </form>

      <p className="quiet small">
        By continuing you agree to the{' '}
        <Link href="/privacy" className="link">
          terms and privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
