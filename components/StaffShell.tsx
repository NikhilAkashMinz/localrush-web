'use client';

// The frame around the shop dashboard and the delivery partner screen: a plain top bar
// with the live-connection light, and each screen's own login.
//
// The shop dashboard, the delivery screen and the customer site each keep a separate login,
// so all three can be open in one browser at the same time, one tab each.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { store } from '@/lib/data';
import { actions, useStore } from '@/lib/state';
import { Mark } from './Icons';
import './staff.css';

const SHOP_TABS = [
  { href: '/dashboard', label: 'Orders' },
  { href: '/dashboard/inventory', label: 'Stock and prices' },
];

type Account = { role: string; name: string; phone: string; storeId?: string };

/** The login for one staff screen. It only accepts that screen's kind of account. */
function StaffLogin({ wants, shopId, current, onStay }: { wants: 'shop' | 'partner'; shopId: string | null; current?: string; onStay: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The ready-made accounts, so the project can be tried without typing numbers.
  useEffect(() => {
    let dead = false;
    api<{ accounts: Account[] }>('GET', 'demo')
      .then((data) => {
        if (dead) return;
        const mine = data.accounts.filter((a) => a.role === wants);
        setAccounts(mine);
        const wanted = mine.find((a) => a.storeId && a.storeId === shopId);
        if (wanted) setPhone(wanted.phone);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [wants, shopId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter your 10-digit mobile number, or choose an account from the list.');
    if (!/^\d{4}$/.test(code)) return setError('Enter the 4-digit code. Any 4 digits work in this demo.');
    setError('');
    setBusy(true);
    try {
      const user = await actions.login({ name: '', phone, code });
      actions.toast(`Logged in as ${user.name.replace(' (owner)', '')}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const wanted = accounts.find((a) => a.storeId && a.storeId === shopId);

  return (
    <form className="st-gate" onSubmit={submit} noValidate>
      <h1>{wants === 'shop' ? 'Shop owner login' : 'Delivery partner login'}</h1>
      {current && wanted ? (
        <p>
          That order was sent to <b>{wanted.name}</b>. You are logged in as {current}, so log in as {wanted.name} to
          see it.{' '}
          <button type="button" className="link" onClick={onStay}>
            Stay on {current}
          </button>
        </p>
      ) : (
        <p>
          This login is only for {wants === 'shop' ? 'the shop dashboard' : 'the delivery screen'}. It does not change who
          is logged in on the customer site, so you can keep all three open in one browser.
        </p>
      )}

      {accounts.length > 0 && (
        <label className="field">
          <span>{wants === 'shop' ? 'Your shop' : 'Your name'} (demo accounts)</span>
          <select value={accounts.some((a) => a.phone === phone) ? phone : ''} onChange={(e) => setPhone(e.target.value)}>
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.phone} value={a.phone}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Mobile number</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="10 digits"
        />
      </label>
      <label className="field">
        <span>4-digit code</span>
        <input
          className="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
        />
      </label>
      <p className="quiet small">Demo login: no SMS is sent yet, so any 4 digits work.</p>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-wide" disabled={busy}>
        {busy ? 'Logging you in…' : 'Log in'}
      </button>
    </form>
  );
}

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const user = useStore((s) => s.user);
  const ready = useStore((s) => s.ready);
  const live = useStore((s) => s.live);
  // Re-read the shop's name whenever a fresh catalogue arrives.
  useStore((s) => s.tick);
  const path = usePathname();

  // "?shop=..." means: show this shop's dashboard (the customer's tracking page links here
  // with the shop an order was sent to). Read from the address, on the client only.
  const [shopId, setShopId] = useState<string | null>(null);
  useEffect(() => {
    setShopId(new URLSearchParams(window.location.search).get('shop'));
  }, [path]);

  const wants = path.startsWith('/partner') ? 'partner' : 'shop';
  const mine = user && user.role === wants ? user : null;
  const shop = mine?.storeId ? store(mine.storeId) : undefined;
  const title = wants === 'shop' ? (shop?.name ?? 'Shop dashboard') : 'Delivery partner';
  const otherShop = wants === 'shop' && !!mine && !!shopId && mine.storeId !== shopId;

  let body = children;
  if (ready && (!mine || otherShop)) {
    body = (
      <StaffLogin
        key={wants + (shopId ?? '')}
        wants={wants}
        shopId={wants === 'shop' ? shopId : null}
        current={otherShop ? shop?.name : undefined}
        onStay={() => {
          window.history.replaceState(null, '', path);
          setShopId(null);
        }}
      />
    );
  }

  return (
    <div className="st">
      <header className="st-top">
        <div className="st-top-in">
          <Link href="/" className="brand" aria-label="LocalRush customer site">
            <Mark size={26} />
            <span>LocalRush</span>
          </Link>
          <span className="st-title">{title}</span>

          {mine && wants === 'shop' && !otherShop && (
            <nav className="st-tabs" aria-label="Dashboard sections">
              {SHOP_TABS.map((t) => (
                <Link key={t.href} href={t.href} className={path === t.href ? 'on' : ''} aria-current={path === t.href ? 'page' : undefined}>
                  {t.label}
                </Link>
              ))}
            </nav>
          )}

          <span className="st-gap" />
          <span className={live ? 'st-live on' : 'st-live'} role="status">
            <i aria-hidden />
            {live ? 'Live' : 'Reconnecting…'}
          </span>
          {mine && (
            <button
              type="button"
              className="st-out"
              title={`Log out of the ${wants === 'shop' ? 'shop dashboard' : 'delivery screen'} only`}
              onClick={() => {
                // Stays on this screen and shows its login again. The customer site is not touched.
                void actions.logout().then(() => actions.toast('Logged out'));
              }}
            >
              Log out
            </button>
          )}
        </div>
      </header>
      <main id="main" className="st-main">
        {body}
      </main>
    </div>
  );
}
