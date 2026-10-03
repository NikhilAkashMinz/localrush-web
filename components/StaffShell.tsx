'use client';

// The frame around the shop dashboard and the delivery partner screen: a plain top bar
// with the live-connection light, and a check that the right kind of account is logged in.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { store } from '@/lib/data';
import { actions, useStore } from '@/lib/state';
import { Mark } from './Icons';
import './staff.css';

const SHOP_TABS = [
  { href: '/dashboard', label: 'Orders' },
  { href: '/dashboard/inventory', label: 'Stock and prices' },
];

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const user = useStore((s) => s.user);
  const ready = useStore((s) => s.ready);
  const live = useStore((s) => s.live);
  // Re-read the shop's name whenever a fresh catalogue arrives.
  useStore((s) => s.tick);
  const path = usePathname();
  const router = useRouter();

  const wants = path.startsWith('/partner') ? 'partner' : 'shop';
  const shop = user?.storeId ? store(user.storeId) : undefined;
  const title = wants === 'shop' ? (shop?.name ?? 'Shop dashboard') : 'Delivery partner';

  let body = children;
  if (ready && !user) {
    body = (
      <div className="st-gate">
        <h1>{wants === 'shop' ? 'Shop dashboard' : 'Delivery partner screen'}</h1>
        <p>Log in with your {wants === 'shop' ? 'shop owner' : 'delivery partner'} mobile number to continue.</p>
        <Link href="/login" className="btn">
          Log in
        </Link>
      </div>
    );
  } else if (ready && user && user.role !== wants) {
    body = (
      <div className="st-gate">
        <h1>This screen is for {wants === 'shop' ? 'shop owners' : 'delivery partners'}</h1>
        <p>
          You are logged in as {user.name}, a {user.role === 'shop' ? 'shop owner' : user.role === 'partner' ? 'delivery partner' : 'customer'}.
        </p>
        <Link href={user.role === 'shop' ? '/dashboard' : user.role === 'partner' ? '/partner' : '/'} className="btn">
          {user.role === 'customer' ? 'Back to the shop front' : 'Go to your screen'}
        </Link>
      </div>
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

          {user?.role === 'shop' && wants === 'shop' && (
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
          {user && (
            <button
              type="button"
              className="st-out"
              onClick={() => {
                void actions.logout().then(() => router.push('/login'));
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
