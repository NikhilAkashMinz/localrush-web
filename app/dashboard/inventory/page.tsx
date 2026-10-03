'use client';

// Stock and prices for one shop. Whatever is saved here is what customers see and can buy:
// the server checks stock again at the moment of ordering, so it can never be oversold.

import { useMemo, useState } from 'react';
import { errorText } from '@/lib/api';
import { CATEGORIES, PRODUCTS, stockAt, type Product } from '@/lib/data';
import { rupee } from '@/lib/format';
import { actions, useStore } from '@/lib/state';

const LOW = 3;
const wholeNumber = (text: string) => (/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null);

function Row({ p, storeId }: { p: Product; storeId: string }) {
  const current = stockAt(storeId, p.id);
  const [price, setPrice] = useState(String(current?.price ?? p.mrp));
  const [stock, setStock] = useState(String(current?.stock ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // If the saved value changes underneath (a sale, or a save from another device), show the new one.
  const [seenPrice, setSeenPrice] = useState(current?.price);
  const [seenStock, setSeenStock] = useState(current?.stock);
  if (current?.price !== seenPrice) {
    setSeenPrice(current?.price);
    setPrice(String(current?.price ?? p.mrp));
  }
  if (current?.stock !== seenStock) {
    setSeenStock(current?.stock);
    setStock(String(current?.stock ?? 0));
  }

  const changed = current ? price !== String(current.price) || stock !== String(current.stock) : true;

  const save = async (nextStock = stock) => {
    const priceN = wholeNumber(price);
    const stockN = wholeNumber(nextStock);
    if (priceN === null || priceN < 1) return setError('Enter a price in whole rupees.');
    if (priceN > p.mrp) return setError(`The price cannot be more than the MRP of ${rupee(p.mrp)}.`);
    if (stockN === null || stockN > 9999) return setError('Enter stock as a whole number from 0 to 9999.');
    setError('');
    setBusy(true);
    try {
      await actions.saveStock(p.id, priceN, stockN);
      actions.toast(current ? `${p.name} updated` : `${p.name} added to your shop`);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  const out = current?.stock === 0;
  const low = !!current && current.stock > 0 && current.stock <= LOW;

  return (
    <li className={out ? 'st-row st-row-out' : 'st-row'}>
      <span className="st-emoji" aria-hidden>
        {p.emoji}
      </span>
      <span className="st-name">
        <b>{p.name}</b>
        <small>
          {p.unit} · MRP {rupee(p.mrp)}
          {out && <em className="st-badge st-badge-out">Out of stock</em>}
          {low && <em className="st-badge">Only {current?.stock} left</em>}
        </small>
      </span>
      <label className="st-num">
        <span>Your price (₹)</span>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" aria-label={`Price of ${p.name}`} />
      </label>
      <label className="st-num">
        <span>In stock</span>
        <input value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" aria-label={`Stock of ${p.name}`} />
      </label>
      <span className="st-row-acts">
        <button type="button" className="btn btn-small" disabled={busy || !changed} onClick={() => save()}>
          {busy ? 'Saving…' : current ? 'Save' : 'Add to shop'}
        </button>
        {current && current.stock > 0 && (
          <button type="button" className="link" disabled={busy} onClick={() => save('0')}>
            Mark out of stock
          </button>
        )}
      </span>
      {error && (
        <p className="warn st-row-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function NewProduct({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0].slug);
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [emoji, setEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const digits = (set: (v: string) => void, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, '').slice(0, max));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mrpN = wholeNumber(mrp);
    const priceN = price.trim() === '' ? mrpN : wholeNumber(price);
    const stockN = wholeNumber(stock);
    if (name.trim().length < 2) return setError('Enter the product name.');
    if (unit.trim().length < 1) return setError('Enter the pack size, for example "500 g" or "1 pc".');
    if (mrpN === null || mrpN < 1) return setError('Enter the MRP in whole rupees.');
    if (priceN === null || priceN < 1 || priceN > mrpN) return setError('Your price must be a whole number no higher than the MRP.');
    if (stockN === null || stockN > 9999) return setError('Enter how many you have, from 0 to 9999.');
    setError('');
    setBusy(true);
    try {
      const made = await actions.addProduct({ name: name.trim(), unit: unit.trim(), cat, mrp: mrpN, price: priceN, stock: stockN, emoji: emoji.trim() });
      actions.toast(`${made.name} is now on sale in your shop`);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="st-form" onSubmit={submit} noValidate>
      <h2>Add a new product</h2>
      <p className="quiet">Use this for something that is not in the list yet. It goes on sale in your shop as soon as you save.</p>
      <div className="st-form-grid">
        <label className="field">
          <span>Product name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nandini Curd" maxLength={60} />
        </label>
        <label className="field">
          <span>Pack size</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="500 g" maxLength={40} />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Picture (one emoji, optional)</span>
          <input value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 8))} placeholder="🥛" />
        </label>
        <label className="field">
          <span>MRP (₹)</span>
          <input value={mrp} onChange={digits(setMrp, 6)} inputMode="numeric" placeholder="35" />
        </label>
        <label className="field">
          <span>Your price (₹)</span>
          <input value={price} onChange={digits(setPrice, 6)} inputMode="numeric" placeholder="Same as MRP" />
        </label>
        <label className="field">
          <span>In stock</span>
          <input value={stock} onChange={digits(setStock, 4)} inputMode="numeric" placeholder="20" />
        </label>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <div className="st-acts">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Adding…' : 'Add product'}
        </button>
        <button type="button" className="btn btn-line" onClick={onDone} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function InventoryPage() {
  const user = useStore((s) => s.user);
  const tick = useStore((s) => s.tick);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [view, setView] = useState<'mine' | 'more'>('mine');
  const [adding, setAdding] = useState(false);
  const storeId = user?.storeId ?? '';

  const { mine, more } = useMemo(() => {
    const mine: Product[] = [];
    const more: Product[] = [];
    for (const p of PRODUCTS) (stockAt(storeId, p.id) ? mine : more).push(p);
    return { mine, more };
    // `tick` goes up whenever a fresh catalogue arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, tick]);

  if (!user || !storeId) return null;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const source = view === 'mine' ? mine : more;
  const shown = source.filter((p) => (cat === 'all' || p.cat === cat) && words.every((w) => `${p.name} ${p.keywords}`.toLowerCase().includes(w)));
  const outCount = mine.filter((p) => stockAt(storeId, p.id)?.stock === 0).length;
  const lowCount = mine.filter((p) => {
    const s = stockAt(storeId, p.id)?.stock ?? 0;
    return s > 0 && s <= LOW;
  }).length;

  return (
    <div className="st-page">
      <section className="st-head">
        <div>
          <h1>Stock and prices</h1>
          <p>
            {mine.length} products on sale · {outCount} out of stock · {lowCount} running low
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            Add a new product
          </button>
        )}
      </section>

      {adding && <NewProduct onDone={() => setAdding(false)} />}

      <div className="st-filters">
        <div className="seg" role="radiogroup" aria-label="Which products">
          <button type="button" role="radio" aria-checked={view === 'mine'} className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>
            In my shop ({mine.length})
          </button>
          <button type="button" role="radio" aria-checked={view === 'more'} className={view === 'more' ? 'on' : ''} onClick={() => setView('more')}>
            Add from the catalogue ({more.length})
          </button>
        </div>
        <input className="st-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" aria-label="Find a product" />
        <select className="st-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="st-none st-none-box">
          {source.length === 0
            ? view === 'mine'
              ? 'Your shop has no products yet. Add some from the catalogue.'
              : 'Your shop already sells everything in the catalogue.'
            : 'Nothing matches that search.'}
        </p>
      ) : (
        <ul className="st-rows">
          {shown.map((p) => (
            <Row key={p.id} p={p} storeId={storeId} />
          ))}
        </ul>
      )}
    </div>
  );
}
