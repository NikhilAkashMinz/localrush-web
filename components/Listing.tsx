'use client';

import { useMemo, useState } from 'react';
import type { Product } from '@/lib/data';
import { useNear } from '@/lib/hooks';
import { availability } from '@/lib/nearby';
import { ProductCard } from './Product';

type Sort = 'fastest' | 'low' | 'high' | 'discount';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'fastest', label: 'Fastest delivery' },
  { key: 'low', label: 'Price, low to high' },
  { key: 'high', label: 'Price, high to low' },
  { key: 'discount', label: 'Biggest discount' },
];

/** Product grid with sorting and an in-stock filter, used by category and search pages. */
export function Listing({ items, empty }: { items: Product[]; empty: string }) {
  const near = useNear();
  const [sort, setSort] = useState<Sort>('fastest');
  const [stockOnly, setStockOnly] = useState(false);

  const rows = useMemo(() => {
    const live = items.map((p) => {
      const a = availability(p.id, near);
      const ok = a.state === 'available';
      return {
        p,
        ok,
        eta: ok ? a.best.near.etaMin : 999,
        price: ok ? a.best.price : p.mrp,
        off: ok ? 1 - a.best.price / p.mrp : 0,
      };
    });
    const by: Record<Sort, (a: (typeof live)[number], b: (typeof live)[number]) => number> = {
      fastest: (a, b) => a.eta - b.eta,
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
      discount: (a, b) => b.off - a.off,
    };
    return live
      .filter((r) => !stockOnly || r.ok)
      .sort((a, b) => Number(b.ok) - Number(a.ok) || by[sort](a, b));
  }, [items, near, sort, stockOnly]);

  if (!items.length) return <p className="quiet">{empty}</p>;

  return (
    <>
      <div className="tools">
        <label className="select">
          <span>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
          <span>Only what can be delivered now</span>
        </label>
        <span className="tools-count">
          {rows.length} {rows.length === 1 ? 'product' : 'products'}
        </span>
      </div>
      {rows.length ? (
        <div className="grid">
          {rows.map((r) => (
            <ProductCard key={r.p.id} p={r.p} />
          ))}
        </div>
      ) : (
        <p className="quiet">None of these can be delivered right now. Untick the filter to see them anyway.</p>
      )}
    </>
  );
}
