'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ShopMap, { KIND_EMOJI, shopStatus } from '@/components/ShopMap';
import { KIND_COLOR, KIND_LABEL, type StoreKind } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { useNear } from '@/lib/hooks';
import { actions, useStore } from '@/lib/state';
import './shops.css';

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
  const list = useRef<HTMLUListElement>(null);

  const inRange = near.filter((n) => n.inRange);
  const openCount = inRange.filter((n) => n.open).length;
  const kinds = (Object.keys(KIND_SHORT) as StoreKind[]).filter((k) => inRange.some((n) => n.store.kind === k));

  const match = (n: (typeof near)[number]) => (kind === 'all' || n.store.kind === kind) && (!openOnly || n.open);
  const shown = inRange.filter(match);
  // Shops a little beyond 5 km stay on the map, faded, so the limit is visible.
  const beyond = near.filter((n) => !n.inRange && n.distKm <= 9 && (kind === 'all' || n.store.kind === kind));

  // Picking a marker on the map scrolls its row into view. Only where the list sits beside
  // the map: on a phone the list is below it, and scrolling would hide the map you just tapped.
  const fromMap = useRef(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (selected && fromMap.current && wide) {
      list.current?.querySelector(`[data-shop="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    fromMap.current = false;
  }, [selected]);

  // A filter can hide the selected shop; drop the selection when it does.
  useEffect(() => {
    if (selected && !shown.some((n) => n.store.id === selected) && !beyond.some((n) => n.store.id === selected)) {
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, openOnly, place]);

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
              : `${openCount} of ${inRange.length} shops within 5 km of ${place.label} ${openCount === 1 ? 'is' : 'are'} open now.`}
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
        </div>
      )}

      <div className="sm-layout">
        <ShopMap
          place={place}
          shops={[...shown, ...beyond]}
          selected={selected}
          hovered={hovered}
          onSelect={(id) => {
            fromMap.current = true;
            setSelected(id);
          }}
          onHover={setHovered}
        />

        <div className="sm-side">
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
            <ul className="sm-list" ref={list}>
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
        </div>
      </div>
    </div>
  );
}
