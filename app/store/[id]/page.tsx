'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ProductCard } from '@/components/Product';
import { CATEGORIES, KIND_COLOR, KIND_LABEL, PRODUCTS, stockAt } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { useNear } from '@/lib/hooks';

export default function StorePage() {
  const { id } = useParams<{ id: string }>();
  const near = useNear();
  const n = near.find((x) => x.store.id === id);
  const [cat, setCat] = useState<string>('all');

  if (!n) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>We could not find that shop</h1>
          <Link href="/" className="btn">
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  const s = n.store;
  const stocked = PRODUCTS.flatMap((p) => {
    const st = stockAt(s.id, p.id);
    return st ? [{ p, st }] : [];
  });
  const cats = CATEGORIES.filter((c) => stocked.some((x) => x.p.cat === c.slug));
  const shown = stocked.filter((x) => cat === 'all' || x.p.cat === cat);
  const note = !n.inRange
    ? 'Outside your 5 km'
    : !n.open
      ? `Opens at ${hourLabel(s.open[0])}`
      : undefined;
  const hours = s.open[0] === 0 && s.open[1] === 24 ? 'Open 24 hours' : `${hourLabel(s.open[0])} to ${hourLabel(s.open[1])}`;

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden>/</span>
        <span>Shops</span>
      </nav>

      <header className="store-head">
        <i style={{ background: KIND_COLOR[s.kind] }} aria-hidden />
        <div>
          <h1>{s.name}</h1>
          <p>
            {KIND_LABEL[s.kind]} in {s.area}. {hours}.
          </p>
        </div>
        <dl>
          <div>
            <dt>Distance</dt>
            <dd>{km(n.distKm)}</dd>
          </div>
          <div>
            <dt>Delivers in</dt>
            <dd>{n.inRange && n.open ? mins(n.etaMin) : 'Not now'}</dd>
          </div>
          <div>
            <dt>Rating</dt>
            <dd>{s.rating.toFixed(1)} of 5</dd>
          </div>
        </dl>
      </header>

      {note && (
        <p className="note">
          {!n.inRange
            ? `This shop is ${km(n.distKm)} away by road, beyond the 5 km LocalRush delivers within. You can look, but not order from here.`
            : `This shop is closed right now and opens at ${hourLabel(s.open[0])}.`}
        </p>
      )}

      <div className="tabs">
        <button type="button" className={cat === 'all' ? 'tab on' : 'tab'} onClick={() => setCat('all')}>
          Everything
        </button>
        {cats.map((c) => (
          <button type="button" key={c.slug} className={cat === c.slug ? 'tab on' : 'tab'} onClick={() => setCat(c.slug)}>
            <span aria-hidden>{c.emoji}</span>
            {c.short}
          </button>
        ))}
      </div>

      <div className="grid">
        {shown.map(({ p, st }) => (
          <ProductCard key={p.id} p={p} fixed={{ price: st.price, stock: st.stock, eta: n.etaMin, note }} />
        ))}
      </div>
      <p className="quiet small">
        These are this shop’s own prices. At checkout LocalRush compares every open shop near you and picks the best one
        for your whole cart, so an item may come from a different shop.
      </p>
    </div>
  );
}
