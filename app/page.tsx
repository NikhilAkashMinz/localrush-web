'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductRow } from '@/components/Product';
import RealMap, { type Pick } from '@/components/RealMap';
import { RadiusMap } from '@/components/Scenes';
import { KIND_EMOJI } from '@/components/ShopMap';
import { CATEGORIES, KIND_COLOR, KIND_LABEL, PRODUCTS, QUICK_NEEDS } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { GOOGLE_KEY, useRealShops } from '@/lib/google';
import { useNear } from '@/lib/hooks';
import { availability, usable } from '@/lib/nearby';
import { useOsmShops } from '@/lib/realshops';
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
  // Google's real 3D map when there is a key and it works; otherwise the site's own 3D scene.
  const [mapFailed, setMapFailed] = useState('');
  const realMap = !!GOOGLE_KEY && !mapFailed;
  // Real shops nearby: Google's on Google's map; otherwise OpenStreetMap's, which need no key.
  const google = useRealShops(place);
  const fromOsm = !realMap;
  const osm = useOsmShops(place, fromOsm);
  const real = fromOsm ? osm : google;
  const [picked, setPicked] = useState<Pick | null>(null);
  const heroMap = useRef<HTMLDivElement>(null);

  // Shops near one place mean nothing at the next.
  useEffect(() => setPicked(null), [place.lat, place.lng]);

  /** Show a shop on the 3D map, bringing the map into view. */
  const showOnMap = (pick: Pick) => {
    setPicked(pick);
    heroMap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

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
          ) : realMap && real.shops.length > 0 ? (
            <p className="hero-sub">
              No shop within 5 km of {place.label} has joined LocalRush yet. The map shows the {real.shops.length} nearest
              shops on Google Maps; to order, try one of the areas where LocalRush shops are.
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
        <div className={realMap ? 'hero-map hero-map-real' : 'hero-map'} ref={heroMap}>
          {realMap ? (
            <RealMap
              place={place}
              near={near}
              real={real.shops}
              picked={picked}
              onPick={setPicked}
              onFail={(message) => {
                console.warn('[localrush] Showing the built-in 3D scene instead of Google Maps:', message);
                setMapFailed(message);
              }}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>

      {mapFailed && (
        <p className="note map-note" role="status">
          The real 3D map is not available, so this is LocalRush&apos;s own map. {mapFailed}
        </p>
      )}

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

      {(real.loading || real.error || real.shops.length > 0) && (
        <section className="shops" aria-label="More shops near you">
          <header className="shelf-head">
            <h2>More shops near you</h2>
            {fromOsm ? (
              <Link href="/shops" className="link">
                See them on a map
              </Link>
            ) : (
              <span className="quiet small">From Google Maps</span>
            )}
          </header>
          {real.error ? (
            <p className="warn">{real.error}</p>
          ) : real.loading ? (
            <p className="quiet">Finding real shops near {place.label}…</p>
          ) : (
            <>
              <div className="shops-track">
                {real.shops.slice(0, 20).map((s) => {
                  const inner = (
                    <>
                      <i style={{ background: s.kind ? KIND_COLOR[s.kind] : 'var(--mute)' }} />
                      <span>
                        <b>{s.name}</b>
                        <small>
                          {s.typeLabel}, {km(s.distKm)}
                        </small>
                      </span>
                      <em aria-hidden>{s.kind ? KIND_EMOJI[s.kind] : '🏪'}</em>
                    </>
                  );
                  return realMap ? (
                    <button
                      type="button"
                      key={s.id}
                      className={picked?.id === s.id ? 'shop shop-real on' : 'shop shop-real'}
                      onClick={() => showOnMap({ kind: 'google', id: s.id })}
                      aria-label={`Show ${s.name} on the map`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link key={s.id} href={`/shops?shop=${encodeURIComponent(s.id)}`} className="shop shop-real" aria-label={`Show ${s.name} on the map`}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
              <p className="quiet small">
                {fromOsm
                  ? `${real.shops.length} real shops within 5 km, from OpenStreetMap; the nearest are above.`
                  : `The ${real.shops.length} nearest shops listed on Google Maps.`}{' '}
                They are not on LocalRush yet, so you can only order from LocalRush shops.
              </p>
            </>
          )}
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
