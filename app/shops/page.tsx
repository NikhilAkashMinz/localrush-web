'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ShopMap, { KIND_EMOJI, shopStatus } from '@/components/ShopMap';
import { KIND_COLOR, KIND_LABEL, type StoreKind } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { useNear } from '@/lib/hooks';
import { directionsUrl, isRealShopId, useOsmShops } from '@/lib/realshops';
import { actions, useStore } from '@/lib/state';
import './shops.css';

/** Real shops listed at first; the rest come a page at a time. */
const REAL_PAGE = 30;

const KIND_SHORT: Record<StoreKind, string> = {
  kirana: 'Kirana',
  supermarket: 'Supermarkets',
  fresh: 'Fruits & veg',
  pharmacy: 'Pharmacies',
  stationery: 'Stationery',
  electronics: 'Electronics',
  bakery: 'Bakeries',
};

export default function ShopsPage() {
  const place = useStore((s) => s.place);
  const near = useNear();
  const [kind, setKind] = useState<'all' | StoreKind>('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const side = useRef<HTMLDivElement>(null);
  // Real shops from OpenStreetMap that are not on LocalRush.
  const real = useOsmShops(place);
  const [showReal, setShowReal] = useState(true);
  const [realLimit, setRealLimit] = useState(REAL_PAGE);

  // "?shop=..." opens the page with that shop picked (the home page links here like that).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('shop');
    if (wanted) setSelected(wanted);
  }, []);

  const inRange = near.filter((n) => n.inRange);
  const openCount = inRange.filter((n) => n.open).length;
  const kinds = (Object.keys(KIND_SHORT) as StoreKind[]).filter(
    (k) => inRange.some((n) => n.store.kind === k) || (showReal && real.shops.some((s) => s.kind === k)),
  );

  const match = (n: (typeof near)[number]) => (kind === 'all' || n.store.kind === kind) && (!openOnly || n.open);
  const shown = inRange.filter(match);
  // Shops a little beyond 5 km stay on the map, faded, so the limit is visible.
  const beyond = near.filter((n) => !n.inRange && n.distKm <= 9 && (kind === 'all' || n.store.kind === kind));
  // Their opening hours are not known well enough to say "open now", so that filter leaves them alone.
  const realShown = showReal ? real.shops.filter((s) => kind === 'all' || s.kind === kind) : [];

  // Picking a marker on the map scrolls its row into view. Only where the list sits beside
  // the map: on a phone the list is below it, and scrolling would hide the map you just tapped.
  const fromMap = useRef(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (selected && isRealShopId(selected)) {
      // A real shop further down than the list shows: show enough of the list to reach it.
      const at = realShown.findIndex((s) => s.id === selected);
      if (at >= realLimit) setRealLimit(Math.ceil((at + 1) / REAL_PAGE) * REAL_PAGE);
    }
    if (selected && fromMap.current && wide) {
      requestAnimationFrame(() =>
        side.current?.querySelector(`[data-shop="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      );
    }
    fromMap.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // A filter can hide the selected shop; drop the selection when it does.
  useEffect(() => {
    const visible = isRealShopId(selected)
      ? !real.shops.length || realShown.some((s) => s.id === selected)
      : shown.some((n) => n.store.id === selected) || beyond.some((n) => n.store.id === selected);
    if (selected && !visible) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, openOnly, place, showReal]);

  // A new place, or a new filter, starts the real-shop list from the top again.
  useEffect(() => setRealLimit(REAL_PAGE), [place, kind]);

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden>/</span>
        <span>Shops near you</span>
      </nav>

      <header className="sm-head">
        <div>
          <h1 className="title">Shops near you</h1>
          <p className="quiet">
            {inRange.length === 0
              ? `No shop within 5 km of ${place.label} has joined LocalRush yet.`
              : `${openCount} of ${inRange.length} LocalRush shops within 5 km of ${place.label} ${openCount === 1 ? 'is' : 'are'} open now.`}
            {real.shops.length > 0 && ` The map also shows ${real.shops.length} other real shops nearby.`}
          </p>
        </div>
        <button type="button" className="btn btn-line btn-small" onClick={() => actions.open('place')}>
          Change location
        </button>
      </header>

      {kinds.length > 0 && (
        <div className="sm-filters">
          <div className="tabs">
            <button type="button" className={kind === 'all' ? 'tab on' : 'tab'} onClick={() => setKind('all')}>
              All shops
            </button>
            {kinds.map((k) => (
              <button type="button" key={k} className={kind === k ? 'tab on' : 'tab'} onClick={() => setKind(k)}>
                <span aria-hidden>{KIND_EMOJI[k]}</span>
                {KIND_SHORT[k]}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            <span>Open now</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={showReal} onChange={(e) => setShowReal(e.target.checked)} />
            <span>Other real shops</span>
          </label>
        </div>
      )}

      <div className="sm-layout">
        <ShopMap
          place={place}
          shops={[...shown, ...beyond]}
          real={realShown}
          selected={selected}
          hovered={hovered}
          onSelect={(id) => {
            fromMap.current = true;
            setSelected(id);
          }}
          onHover={setHovered}
        />

        <div className="sm-side" ref={side}>
          {shown.length === 0 ? (
            <div className="empty sm-empty">
              <h2>{inRange.length === 0 ? 'Nothing within 5 km' : 'No shops match'}</h2>
              <p className="quiet">
                {inRange.length === 0
                  ? 'Pick another area to see the shops that deliver there.'
                  : 'Try another type of shop, or untick "Open now".'}
              </p>
              {inRange.length === 0 && (
                <button type="button" className="btn" onClick={() => actions.open('place')}>
                  Change location
                </button>
              )}
            </div>
          ) : (
            <ul className="sm-list">
              {shown.map((n) => {
                const id = n.store.id;
                return (
                  <li
                    key={id}
                    data-shop={id}
                    className={`sm-row ${id === selected ? 'on' : ''} ${id === hovered ? 'hover' : ''} ${n.open ? '' : 'closed'}`}
                    onPointerEnter={() => setHovered(id)}
                    onPointerLeave={() => setHovered(null)}
                  >
                    <button type="button" className="sm-row-main" onClick={() => setSelected(id === selected ? null : id)} aria-pressed={id === selected}>
                      <i style={{ background: KIND_COLOR[n.store.kind] }} aria-hidden>
                        {KIND_EMOJI[n.store.kind]}
                      </i>
                      <span>
                        <b>{n.store.name}</b>
                        <small>
                          {KIND_LABEL[n.store.kind]} in {n.store.area}
                        </small>
                        <small>
                          {km(n.distKm)} away, rated {n.store.rating.toFixed(1)}
                        </small>
                      </span>
                      <em>{n.open ? mins(n.etaMin) : `Opens ${hourLabel(n.store.open[0])}`}</em>
                    </button>
                    <Link href={`/store/${id}`} className="link" aria-label={`Open ${n.store.name}`}>
                      Open shop
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {beyond.length > 0 && (
            <p className="quiet small">
              {beyond.length === 1 ? '1 more shop is' : `${beyond.length} more shops are`} just outside 5 km and shown
              faded on the map: {beyond.map((n) => `${n.store.name} (${shopStatus(n).split(',')[0]})`).join(', ')}.
            </p>
          )}

          {showReal && (
            <section className="sm-real" aria-label="Other real shops near you">
              <h2>
                Other real shops near you {realShown.length > 0 && <span>{realShown.length}</span>}
              </h2>
              <p className="quiet small">
                Shops on OpenStreetMap within 5 km. They are not on LocalRush yet, so you cannot order from them here.
              </p>
              {real.loading ? (
                <p className="quiet">Finding real shops near {place.label}… The first search for an area takes a few seconds.</p>
              ) : real.error ? (
                <p className="warn">{real.error}</p>
              ) : realShown.length === 0 ? (
                <p className="quiet">
                  {real.shops.length === 0 ? `OpenStreetMap lists no shops of these kinds within 5 km of ${place.label}.` : 'None of this kind nearby.'}
                </p>
              ) : (
                <>
                  <ul className="sm-list">
                    {realShown.slice(0, realLimit).map((s) => (
                      <li
                        key={s.id}
                        data-shop={s.id}
                        className={`sm-row sm-row-real ${s.id === selected ? 'on' : ''} ${s.id === hovered ? 'hover' : ''}`}
                        style={{ ['--pin' as string]: s.kind ? KIND_COLOR[s.kind] : 'var(--mute)' }}
                        onPointerEnter={() => setHovered(s.id)}
                        onPointerLeave={() => setHovered(null)}
                      >
                        <button
                          type="button"
                          className="sm-row-main"
                          onClick={() => setSelected(s.id === selected ? null : s.id)}
                          aria-pressed={s.id === selected}
                        >
                          <i aria-hidden>{s.kind ? KIND_EMOJI[s.kind] : '🏪'}</i>
                          <span>
                            <b>{s.name}</b>
                            <small>
                              {s.typeLabel}
                              {s.address ? `, ${s.address}` : ''}
                            </small>
                            <small>
                              {km(s.distKm)} away{s.hours ? ` · ${s.hours}` : ''}
                            </small>
                          </span>
                        </button>
                        <a href={directionsUrl(s)} target="_blank" rel="noreferrer" className="link">
                          Directions
                        </a>
                      </li>
                    ))}
                  </ul>
                  {realShown.length > realLimit && (
                    <button type="button" className="btn btn-line btn-small" onClick={() => setRealLimit((n) => n + REAL_PAGE)}>
                      Show {Math.min(REAL_PAGE, realShown.length - realLimit)} more
                    </button>
                  )}
                  <p className="quiet small">
                    Shop data ©{' '}
                    <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                      OpenStreetMap contributors
                    </a>
                    . Something missing or wrong? Anyone can add it on OpenStreetMap.
                  </p>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
