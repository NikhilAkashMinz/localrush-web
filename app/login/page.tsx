'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import FirebaseLogin from '@/components/FirebaseLogin';
import { Mark } from '@/components/Icons';
import Vendors, { type Mood } from '@/components/Vendors';
import { errorText, type Me } from '@/lib/api';
import { useSiteConfig } from '@/lib/firebase';
import { actions, getState } from '@/lib/state';
import './login.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const wantedShop = params.get('shop');
  const form = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The live service logs in through Firebase (Google, or email and password); the demo with a
  // phone number and any 4 digits.
  const config = useSiteConfig();
  const live = config?.login === 'firebase';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const [liveMood, setLiveMood] = useState<Mood>('idle');
  const [flash, setFlash] = useState<'sad' | 'happy' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The vendors watch you type your details, cover their eyes for the code or password,
  // look worried at a mistake and cheer when you are in.
  const mood: Mood = flash ?? (live ? liveMood : step === 'code' ? 'hide' : typing ? 'watch' : 'idle');

  const sad = () => {
    setFlash('sad');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1500);
  };

  const fail = (message: string) => {
    setError(message);
    sad();
  };

  const welcome = (user: Me) => {
    // An account that has ordered before brings its history back with it.
    const past = getState().orders.length;
    setFlash('happy');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const first = user.name.split(' ')[0];
      actions.toast(past ? `Welcome back, ${first}. Your ${past} ${past === 1 ? 'order is' : 'orders are'} in Your orders.` : `Logged in as ${first}`);
      router.push(next.startsWith('/') && !next.startsWith('//') ? next : '/');
    }, 900);
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return fail('Enter your name.');
    if (!/^[6-9]\d{9}$/.test(phone)) return fail('Enter a 10-digit mobile number.');
    setError('');
    clearTimeout(timer.current);
    setFlash(null);
    setStep('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || flash === 'happy') return;
    if (!/^\d{4}$/.test(code)) return fail('Enter the 4-digit code.');
    setError('');
    setBusy(true);
    try {
      welcome(await actions.login({ name: name.trim(), phone, code }));
    } catch (err) {
      setBusy(false);
      fail(errorText(err));
    }
  };

  // Older links pointed here with ?shop=...; the shop dashboard has its own login now.
  useEffect(() => {
    if (wantedShop) router.replace('/dashboard?shop=' + encodeURIComponent(wantedShop));
  }, [wantedShop, router]);

  return (
    <div className="lg-wrap">
      <div className="lg-card">
        <div className="lg-scene">
          <Vendors mood={mood} form={form} />
        </div>

        <div className="lg-form" ref={form} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}>
          <Mark size={48} />
          <div>
            <h1>{live || step === 'details' ? 'Welcome to LocalRush' : 'Enter the code'}</h1>
            <p className="quiet">
              {live
                ? 'Log in, or create an account, with Google or your email.'
                : step === 'details'
                  ? 'Log in or sign up with your mobile number.'
                  : `Sent to ${phone}. We are not looking.`}
            </p>
          </div>

          {!config ? (
            <div className="boot" aria-busy="true" />
          ) : config.login === 'off' ? (
            <p className="warn">Logging in is not open yet. Please try again a little later.</p>
          ) : live ? (
            <FirebaseLogin
              config={config}
              seat="customer"
              fieldClass="lg-field"
              onDone={welcome}
              onMood={(m) => (m === 'sad' ? sad() : m === 'happy' ? setFlash('happy') : setLiveMood(m))}
            />
          ) : step === 'details' ? (
            <form onSubmit={send} noValidate>
              <label className="lg-field">
                <span>Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="lg-field">
                <span>Mobile number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="10 digits"
                  aria-describedby="phone-help"
                />
              </label>
              <p className="quiet small" id="phone-help">
                Your orders are saved with this number. Log in with it again, on any device, and they are all here.
              </p>
              {error && <p className="warn" role="alert">{error}</p>}
              <button type="submit" className="btn btn-wide">
                Send code
              </button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <label className="lg-field">
                <span>4-digit code</span>
                <input
                  className="lg-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </label>
              {error && <p className="warn" role="alert">{error}</p>}
              <button type="submit" className="btn btn-wide" disabled={busy}>
                {busy ? 'Logging you in…' : 'Log in'}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setStep('details');
                  setCode('');
                  setError('');
                }}
              >
                Change number
              </button>
              <p className="quiet small">Demo login: no SMS is sent, so any 4 digits work.</p>
            </form>
          )}

          <div className="lg-demo">
            <p className="quiet small">
              This login is for customers. Shop owners and delivery partners log in on their own screens, and all three
              can stay logged in at once:
            </p>
            <Link href="/dashboard" className="pill">
              Shop dashboard
            </Link>
            <Link href="/partner" className="pill">
              Delivery partner
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="boot" />}>
      <LoginForm />
    </Suspense>
  );
}
