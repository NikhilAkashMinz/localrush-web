'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { category, type Product } from '@/lib/data';
import { hourLabel, mins, rupee } from '@/lib/format';
import { useAvailability } from '@/lib/hooks';
import type { Availability } from '@/lib/nearby';
import { actions, useStore } from '@/lib/state';
import { ClockIcon, MinusIcon, PlusIcon } from './Icons';

export function unavailableText(a: Availability) {
  if (a.state === 'closed') return `Shop opens at ${hourLabel(a.opensAt)}`;
  if (a.state === 'out') return 'Out of stock nearby';
  if (a.state === 'none') return 'Not sold within 5 km';
  return '';
}

export function ProductArt({ p, size = 'md' }: { p: Product; size?: 'sm' | 'md' | 'lg' }) {
  const c = category(p.cat);
  return (
    <span className={`art art-${size}`} style={{ background: c?.tint }} aria-hidden>
      <span className="art-emoji">{p.emoji}</span>
    </span>
  );
}

export function AddButton({ p, max, big = false }: { p: Product; max: number; big?: boolean }) {
  const qty = useStore((s) => s.cart[p.id] ?? 0);
  if (max <= 0) return null;
  if (qty === 0) {
    return (
      <button
        type="button"
        className={`add ${big ? 'add-big' : ''}`}
        onClick={() => actions.add(p.id, 1, max)}
        aria-label={`Add ${p.name} to cart`}
      >
        Add
      </button>
    );
  }
  return (
    <span className={`stepper ${big ? 'stepper-big' : ''}`}>
      <button type="button" onClick={() => actions.add(p.id, -1, max)} aria-label={`Remove one ${p.name}`}>
        <MinusIcon width={16} height={16} />
      </button>
      <output key={qty} aria-live="polite">{qty}</output>
      <button
        type="button"
        onClick={() => {
          if (qty >= max) actions.toast(`Only ${max} available near you`);
          else actions.add(p.id, 1, max);
        }}
        aria-label={`Add one more ${p.name}`}
      >
        <PlusIcon width={16} height={16} />
      </button>
    </span>
  );
}

/** Product tile. `price` and `max` can be forced, for example on a single shop's page. */
export function ProductCard({ p, fixed }: { p: Product; fixed?: { price: number; stock: number; eta: number; note?: string } }) {
  const found = useAvailability(p.id);
  const tile = useRef<HTMLAnchorElement>(null);

  const price = fixed ? fixed.price : found.state === 'available' ? found.best.price : null;
  const eta = fixed ? fixed.eta : found.state === 'available' ? found.best.near.etaMin : null;
  const max = fixed ? Math.min(12, fixed.stock) : found.state === 'available' ? found.maxQty : 0;
  const stock = fixed ? fixed.stock : found.state === 'available' ? found.best.stock : 0;
  const off = price ? Math.round((1 - price / p.mrp) * 100) : 0;
  const buyable = price !== null && max > 0 && !fixed?.note;

  // Tilt the picture towards the pointer. Skipped on touch screens.
  const onMove = (e: React.PointerEvent) => {
    const el = tile.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -14}deg`);
    el.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 16}deg`);
  };
  const onLeave = () => {
    tile.current?.style.setProperty('--rx', '0deg');
    tile.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <article className={`card ${buyable ? '' : 'card-off'}`}>
      <Link href={`/p/${p.id}`} className="card-art" ref={tile} onPointerMove={onMove} onPointerLeave={onLeave}>
        <ProductArt p={p} />
        {eta !== null && buyable && (
          <span className="chip chip-eta">
            <ClockIcon width={12} height={12} />
            {mins(eta)}
          </span>
        )}
        {off >= 10 && buyable && <span className="chip chip-off">{off}% off</span>}
      </Link>
      <Link href={`/p/${p.id}`} className="card-name">
        {p.name}
      </Link>
      <span className="card-unit">{p.unit}</span>
      {buyable ? (
        <>
          {stock > 0 && stock <= 3 && <span className="card-low">Only {stock} left</span>}
          <div className="card-buy">
            <span className="price">
              <b>{rupee(price!)}</b>
              {off > 0 && <s>{rupee(p.mrp)}</s>}
            </span>
            <AddButton p={p} max={max} />
          </div>
        </>
      ) : (
        <span className="card-none">{fixed ? (fixed.note ?? 'Out of stock') : unavailableText(found)}</span>
      )}
    </article>
  );
}

export function ProductGrid({ items, empty }: { items: Product[]; empty?: string }) {
  if (!items.length) return <p className="quiet">{empty ?? 'Nothing here yet.'}</p>;
  return (
    <div className="grid">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

/** A horizontally scrolling shelf with arrow buttons on wide screens. */
export function ProductRow({ title, href, items }: { title: string; href?: string; items: Product[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  if (!items.length) return null;
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{title}</h2>
        <div className="shelf-tools">
          {href && (
            <Link href={href} className="link">
              See all
            </Link>
          )}
          <button type="button" className="round" onClick={() => scroll(-1)} aria-label="Scroll back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <button type="button" className="round" onClick={() => scroll(1)} aria-label="Scroll forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </header>
      <div className="shelf-track" ref={track}>
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
