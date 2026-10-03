'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Mark } from '@/components/Icons';
import Vendors, { type Mood } from '@/components/Vendors';
import { errorText } from '@/lib/api';
import { actions } from '@/lib/state';
import './login.css';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const wantedShop = params.get('shop');
  const form = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);
  const [flash, setFlash] = useState<'sad' | 'happy' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The vendors watch you type your details, cover their eyes for the code,
  // look worried at a mistake and cheer when you are in.
  const mood: Mood = flash ?? (step === 'code' ? 'hide' : typing ? 'watch' : 'idle');

  const fail = (message: string) => {
    setError(message);
    setFlash('sad');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), 1500);
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
      const user = await actions.login({ name: name.trim(), phone, code });
      setFlash('happy');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        actions.toast(`Logged in as ${user.name.split(' ')[0]}`);
        router.push(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      }, 900);
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
          <Mark size={40} />
          <div>
            <h1>{step === 'details' ? 'Welcome to LocalRush' : 'Enter the code'}</h1>
            <p className="quiet">
              {step === 'details' ? 'Log in or sign up with your mobile number.' : `Sent to ${phone}. We are not looking.`}
            </p>
          </div>

          {step === 'details' ? (
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
                />
              </label>
              {error && <p className="warn" role="alert">{error}</p>}
              <button type="submit" className="btn btn-wide">
                Send code
              </button>
              <div className="lg-demo">
                <p className="quiet small">
                  This login is for customers. Shop owners and delivery partners log in on their own screens, and all
                  three can stay logged in at once:
                </p>
                <Link href="/dashboard" className="pill">
                  Shop dashboard
                </Link>
                <Link href="/partner" className="pill">
                  Delivery partner
                </Link>
              </div>
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
              <p className="quiet small">Demo login: no SMS is sent yet, so any 4 digits work.</p>
            </form>
          )}
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
