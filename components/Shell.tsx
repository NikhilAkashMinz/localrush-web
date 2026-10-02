'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { category, PLACES, PRODUCTS, product, QUICK_NEEDS, type Place } from '@/lib/data';
import { mins, rupee } from '@/lib/format';
import { useNear, usePlan } from '@/lib/hooks';
import { availability, shopsNear, usable } from '@/lib/nearby';
import { DELIVERY_FEE, FREE_DELIVERY_FROM } from '@/lib/select';
import { actions, cartCount, useStore } from '@/lib/state';
import { BagIcon, CartIcon, CheckIcon, ChevronIcon, CloseIcon, Mark, PinIcon, SearchIcon, TargetIcon, UserIcon } from './Icons';
import { AddButton, ProductArt, unavailableText } from './Product';

/** Find products by name, keyword or category. */
export function searchProducts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return PRODUCTS.map((p) => {
    const text = `${p.name} ${p.keywords} ${category(p.cat)?.name ?? ''}`.toLowerCase();
    if (!words.every((w) => text.includes(w))) return null;
    const name = p.name.toLowerCase();
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    return { p, rank };
  })
    .filter((x): x is { p: (typeof PRODUCTS)[number]; rank: number } => x !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.p);
}

function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, close]);
}

const closePanel = () => actions.open(null);

function Header() {
  const place = useStore((s) => s.place);
  const cart = useStore((s) => s.cart);
  const user = useStore((s) => s.user);
  const bump = useStore((s) => s.bump);
  const ready = useStore((s) => s.ready);
  const plan = usePlan();
  const count = cartCount(cart);

  return (
    <header className="top">
      <div className="top-in">
        <Link href="/" className="brand" aria-label="LocalRush home">
          <Mark />
          <span>LocalRush</span>
        </Link>

        <button type="button" className="place-btn" onClick={() => actions.open('place')}>
          <PinIcon width={18} height={18} />
          <span>
            <small>Delivering to</small>
            <b>
              {place.label}
              <ChevronIcon width={14} height={14} />
            </b>
          </span>
        </button>

        <button type="button" className="search-btn" onClick={() => actions.open('search')}>
          <SearchIcon width={18} height={18} />
          <span>Search milk, bread, a charger…</span>
        </button>

        <Link href={user ? '/account' : '/login'} className="top-link">
          <UserIcon />
          <span>{ready && user ? user.name.split(' ')[0] : 'Log in'}</span>
        </Link>

        <button type="button" className="cart-btn" onClick={() => actions.open('cart')} aria-label={`Cart, ${count} items`}>
          <span className="cart-ico" key={bump} data-bump={bump > 0}>
            <CartIcon />
          </span>
          {ready && count > 0 ? (
            <span className="cart-sum">
              <b>{count} {count === 1 ? 'item' : 'items'}</b>
              <small>{rupee(plan.total)}</small>
            </span>
          ) : (
            <span className="cart-sum">
              <b>Cart</b>
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function PlacePanel() {
  const open = useStore((s) => s.panel === 'place');
  const place = useStore((s) => s.place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEscape(open, closePanel);

  const counts = useMemo(
    () => PLACES.map((p) => usable(shopsNear(p.lat, p.lng)).length),
    // Recount whenever the panel opens, in case the hour has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  if (!open) return null;

  const locate = () => {
    setError('');
    if (!navigator.geolocation) return setError('This browser cannot share its location. Pick an area below.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const here: Place = {
          label: 'Current location',
          sub: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        actions.setPlace(here);
        actions.toast('Delivering to your current location');
      },
      () => {
        setBusy(false);
        setError('Location access was blocked. Allow it in your browser, or pick an area below.');
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="veil" onClick={closePanel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="place-title" onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h2 id="place-title">Where should we deliver?</h2>
          <button type="button" className="round" onClick={closePanel} aria-label="Close">
            <CloseIcon width={18} height={18} />
          </button>
        </header>
        <p className="quiet">We only show shops within 5 km by road, so everything you see can reach you in minutes.</p>
        <button type="button" className="btn btn-line btn-wide" onClick={locate} disabled={busy}>
          <TargetIcon width={18} height={18} />
          {busy ? 'Finding you…' : 'Use my current location'}
        </button>
        {error && <p className="warn">{error}</p>}
        <ul className="place-list">
          {PLACES.map((p, i) => {
            const on = p.label === place.label;
            return (
              <li key={p.label}>
                <button type="button" className={on ? 'on' : ''} onClick={() => actions.setPlace(p)}>
                  <span>
                    <b>{p.label}</b>
                    <small>{p.sub}</small>
                  </span>
                  <em>{counts[i] === 0 ? 'No shops open nearby' : `${counts[i]} ${counts[i] === 1 ? 'shop' : 'shops'} open`}</em>
                  {on && <CheckIcon width={18} height={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SearchPanel() {
  const open = useStore((s) => s.panel === 'search');
  const recent = useStore((s) => s.recent);
  const near = useNear();
  const router = useRouter();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEscape(open, closePanel);

  useEffect(() => {
    if (open) {
      setQ('');
      input.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => searchProducts(q).slice(0, 7), [q]);
  if (!open) return null;

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    actions.remember(t);
    actions.open(null);
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className="veil veil-top" onClick={closePanel}>
      <div className="search-panel" role="dialog" aria-modal="true" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
        >
          <SearchIcon />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What do you need?"
            aria-label="Search products"
            autoComplete="off"
          />
          <button type="button" className="round" onClick={closePanel} aria-label="Close search">
            <CloseIcon width={18} height={18} />
          </button>
        </form>

        {q.trim() === '' ? (
          <div className="search-idle">
            {recent.length > 0 && (
              <>
                <div className="search-sub">
                  <h3>Recent searches</h3>
                  <button type="button" className="link" onClick={actions.forgetRecent}>
                    Clear
                  </button>
                </div>
                <div className="pills">
                  {recent.map((r) => (
                    <button type="button" key={r} className="pill" onClick={() => go(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="search-sub">
              <h3>People near you often need</h3>
            </div>
            <div className="pills">
              {QUICK_NEEDS.map((r) => (
                <button type="button" key={r} className="pill" onClick={() => go(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <p className="quiet search-none">
            No shop near you lists “{q.trim()}”. Try a simpler word, like “milk” or “pen”.
          </p>
        ) : (
          <ul className="search-list">
            {results.map((p) => {
              const a = availability(p.id, near);
              return (
                <li key={p.id}>
                  <Link href={`/p/${p.id}`} onClick={closePanel} className="search-item">
                    <ProductArt p={p} size="sm" />
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.unit}
                        {a.state === 'available' ? `, about ${mins(a.best.near.etaMin)}` : ''}
                      </small>
                    </span>
                  </Link>
                  {a.state === 'available' ? (
                    <span className="search-buy">
                      <b>{rupee(a.best.price)}</b>
                      <AddButton p={p} max={a.maxQty} />
                    </span>
                  ) : (
                    <small className="search-off">{unavailableText(a)}</small>
                  )}
                </li>
              );
            })}
            <li>
              <button type="button" className="link search-all" onClick={() => go(q)}>
                See all results for “{q.trim()}”
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function CartPanel() {
  const open = useStore((s) => s.panel === 'cart');
  const plan = usePlan();
  const router = useRouter();
  useEscape(open, closePanel);
  if (!open) return null;

  const empty = plan.shipments.length === 0 && plan.unavailable.length === 0;

  return (
    <div className="veil veil-side" onClick={closePanel}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" onClick={(e) => e.stopPropagation()}>
        <header className="panel-head">
          <h2 id="cart-title">Your cart</h2>
          <button type="button" className="round" onClick={closePanel} aria-label="Close cart">
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        {empty ? (
          <div className="empty">
            <BagIcon width={40} height={40} />
            <h3>Your cart is empty</h3>
            <p className="quiet">Add something from a shop near you and it shows up here.</p>
            <button type="button" className="btn" onClick={closePanel}>
              Keep browsing
            </button>
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {plan.shipments.length > 1 && (
                <p className="note">
                  No single shop near you has everything, so this arrives in {plan.shipments.length} deliveries.
                </p>
              )}
              {plan.shipments.map((s) => (
                <section className="ship" key={s.near.store.id}>
                  <header>
                    <b>{s.near.store.name}</b>
                    <span>about {mins(s.etaMin)}</span>
                  </header>
                  <ul>
                    {s.lines.map((l) => {
                      const p = product(l.pid)!;
                      const a = availability(p.id, [s.near]);
                      return (
                        <li key={l.pid}>
                          <ProductArt p={p} size="sm" />
                          <span className="line-name">
                            <b>{p.name}</b>
                            <small>{p.unit}</small>
                          </span>
                          <AddButton p={p} max={a.state === 'available' ? a.maxQty : l.qty} />
                          <b className="line-price">{rupee(l.price * l.qty)}</b>
                        </li>
                      );
                    })}
                  </ul>
                  <footer>
                    {s.fee === 0
                      ? 'Free delivery on this one'
                      : `Add ${rupee(FREE_DELIVERY_FROM - s.subtotal)} more from this shop for free delivery`}
                  </footer>
                </section>
              ))}
              {plan.unavailable.length > 0 && (
                <section className="ship ship-off">
                  <header>
                    <b>Not available right now</b>
                  </header>
                  <ul>
                    {plan.unavailable.map((pid) => {
                      const p = product(pid)!;
                      return (
                        <li key={pid}>
                          <ProductArt p={p} size="sm" />
                          <span className="line-name">
                            <b>{p.name}</b>
                            <small>No open shop within 5 km has enough stock</small>
                          </span>
                          <button type="button" className="link" onClick={() => actions.remove(pid)}>
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              <dl className="bill">
                <div>
                  <dt>Items</dt>
                  <dd>{rupee(plan.subtotal)}</dd>
                </div>
                <div>
                  <dt>Delivery{plan.shipments.length > 1 ? ` (${plan.shipments.length} trips)` : ''}</dt>
                  <dd>{plan.fees === 0 ? 'Free' : rupee(plan.fees)}</dd>
                </div>
                {plan.mrpTotal > plan.subtotal && (
                  <div className="bill-save">
                    <dt>You save on MRP</dt>
                    <dd>{rupee(plan.mrpTotal - plan.subtotal)}</dd>
                  </div>
                )}
              </dl>
              <p className="quiet small">
                Each price is what the fulfilling shop charges. Delivery is {rupee(DELIVERY_FEE)} per shop, free from {rupee(FREE_DELIVERY_FROM)}.
              </p>
            </div>
            <footer className="drawer-foot">
              <button
                type="button"
                className="btn btn-wide btn-big"
                disabled={plan.shipments.length === 0}
                onClick={() => {
                  closePanel();
                  router.push('/checkout');
                }}
              >
                <span>Go to checkout</span>
                <b>{rupee(plan.total)}</b>
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}

/** Sticky bar on phones, so the cart is always one tap away. */
function CartBar() {
  const cart = useStore((s) => s.cart);
  const panel = useStore((s) => s.panel);
  const plan = usePlan();
  const path = usePathname();
  const count = cartCount(cart);
  if (count === 0 || panel || path === '/checkout') return null;
  return (
    <button type="button" className="cartbar" onClick={() => actions.open('cart')}>
      <span>
        <b>{count} {count === 1 ? 'item' : 'items'}</b>
        <small>{rupee(plan.total)}</small>
      </span>
      <span className="cartbar-go">View cart</span>
    </button>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div>
          <span className="brand brand-foot">
            <Mark size={24} />
            <span>LocalRush</span>
          </span>
          <p>Shops you already know, delivered from within 5 km.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/orders">Your orders</Link>
          <Link href="/account">Account</Link>
          <button type="button" onClick={() => actions.open('place')}>
            Change location
          </button>
        </nav>
        <p className="foot-note">
          MCA capstone project, PES University. This is a front-end build with sample shops and stock: no real orders are placed.
        </p>
      </div>
    </footer>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const ready = useStore((s) => s.ready);
  const path = usePathname();

  useEffect(() => {
    actions.hydrate();
  }, []);

  // Close any open panel and return to the top when the page changes.
  useEffect(() => {
    actions.open(null);
  }, [path]);

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <Header />
      <main id="main">{ready ? children : <div className="boot" aria-busy="true" />}</main>
      <Footer />
      <CartBar />
      <PlacePanel />
      <SearchPanel />
      <CartPanel />
      <Toasts />
    </>
  );
}
