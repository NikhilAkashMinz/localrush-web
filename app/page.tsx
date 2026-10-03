'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ProductRow } from '@/components/Product';
import { RadiusMap } from '@/components/Scenes';
import { CATEGORIES, KIND_COLOR, KIND_LABEL, PRODUCTS, QUICK_NEEDS } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { useNear } from '@/lib/hooks';
import { availability, usable } from '@/lib/nearby';
import { actions, useStore } from '@/lib/state';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late?';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  return 'Good evening.';
}

export default function HomePage() {
  const place = useStore((s) => s.place);
  const user = useStore((s) => s.user);
  const near = useNear();
  const router = useRouter();
  const [highlight, setHighlight] = useState<string | null>(null);

  const open = usable(near);
  const inRange = near.filter((n) => n.inRange);
  const nearest = open[0];

  const { quickest, byCategory } = useMemo(() => {
    const live = PRODUCTS.map((p) => ({ p, a: availability(p.id, near) }));
    const available = live.filter((x) => x.a.state === 'available');
    const quickest = [...available]
      .sort((x, y) =>
        x.a.state === 'available' && y.a.state === 'available' ? x.a.best.near.etaMin - y.a.best.near.etaMin : 0,
      )
      .slice(0, 14)
      .map((x) => x.p);
    const byCategory = CATEGORIES.map((c) => ({
      c,
      items: available.filter((x) => x.p.cat === c.slug).map((x) => x.p),
    })).filter((x) => x.items.length > 0);
    return { quickest, byCategory };
  }, [near]);

  const search = (text: string) => {
    actions.remember(text);
    router.push(`/search?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-hello">
            {greeting()}
            {user ? ` Welcome back, ${user.name.split(' ')[0]}.` : ''}
          </p>
          <h1>Your neighbourhood shops, delivered in minutes.</h1>
          {open.length > 0 ? (
            <p className="hero-sub">
              {open.length} {open.length === 1 ? 'shop' : 'shops'} within 5 km of {place.label}{' '}
              {open.length === 1 ? 'is' : 'are'} open now. The nearest, {nearest.store.name}, can reach you in about{' '}
              {mins(nearest.etaMin)}.
            </p>
          ) : inRange.length > 0 ? (
            <p className="hero-sub">
              Every shop within 5 km of {place.label} is closed right now. The first one opens at{' '}
              {hourLabel(Math.min(...inRange.map((n) => n.store.open[0])))}.
            </p>
          ) : (
            <p className="hero-sub">
              No shop within 5 km of {place.label} has joined LocalRush yet. Try another area to see how it works.
            </p>
          )}
          {open.length > 0 && (
            <div className="hero-needs">
              <span>Need something now?</span>
              <div className="pills">
                {QUICK_NEEDS.slice(0, 5).map((q) => (
                  <button type="button" key={q} className="pill pill-dark" onClick={() => search(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="hero-map">
          <RadiusMap
            near={near}
            seed={Math.round((place.lat + place.lng) * 10000)}
            highlight={highlight}
            onSelect={(id) => router.push(`/store/${id}`)}
          />
          <p className="hero-key">
            <i className="key-ring" /> 5 km by road from you
            <span>Drag to turn, tap a shop to open it</span>
          </p>
        </div>
      </section>

      {inRange.length > 0 && (
        <section className="shops" aria-label="Shops around you">
          <header className="shelf-head">
            <h2>Shops around you</h2>
            <Link href="/shops" className="link">
              See them on a map
            </Link>
          </header>
          <div className="shops-track">
            {inRange.map((n) => (
              <Link
                key={n.store.id}
                href={`/store/${n.store.id}`}
                className={`shop ${n.open ? '' : 'shop-closed'}`}
                onPointerEnter={() => setHighlight(n.store.id)}
                onPointerLeave={() => setHighlight(null)}
                onFocus={() => setHighlight(n.store.id)}
                onBlur={() => setHighlight(null)}
              >
                <i style={{ background: KIND_COLOR[n.store.kind] }} />
                <span>
                  <b>{n.store.name}</b>
                  <small>
                    {KIND_LABEL[n.store.kind]}, {km(n.distKm)}
                  </small>
                </span>
                <em>{n.open ? mins(n.etaMin) : n.store.paused ? 'Paused' : `Opens ${hourLabel(n.store.open[0])}`}</em>
              </Link>
            ))}
          </div>
        </section>
      )}

      {byCategory.length > 0 && (
        <nav className="cats" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/c/${c.slug}`} className="cat" style={{ background: c.tint }}>
              <span aria-hidden>{c.emoji}</span>
              <b>{c.short}</b>
            </Link>
          ))}
        </nav>
      )}

      <ProductRow title="Quickest to your door" items={quickest} />
      {byCategory.map(({ c, items }) => (
        <ProductRow key={c.slug} title={c.name} href={`/c/${c.slug}`} items={items.slice(0, 12)} />
      ))}

      {byCategory.length === 0 && (
        <div className="empty empty-page">
          <h2>Nothing can be delivered here right now</h2>
          <p className="quiet">
            LocalRush only shows what an open shop within 5 km has in stock. Pick another area, or come back when the
            shops open.
          </p>
          <button type="button" className="btn" onClick={() => actions.open('place')}>
            Change location
          </button>
        </div>
      )}
    </div>
  );
}
