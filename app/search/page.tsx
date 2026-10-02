'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Listing } from '@/components/Listing';
import { searchProducts } from '@/components/Shell';
import { actions } from '@/lib/state';

function Results() {
  const q = (useSearchParams().get('q') ?? '').trim();
  const items = searchProducts(q);
  return (
    <div className="page">
      <h1 className="title">{q ? `Results for “${q}”` : 'Search'}</h1>
      {q === '' ? (
        <div className="empty empty-page">
          <p className="quiet">Type what you need and we will check the shops near you.</p>
          <button type="button" className="btn" onClick={() => actions.open('search')}>
            Open search
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty empty-page">
          <h2>No shop near you lists “{q}”</h2>
          <p className="quiet">Try a simpler word, like “milk”, “pen” or “charger”.</p>
          <button type="button" className="btn" onClick={() => actions.open('search')}>
            Search again
          </button>
        </div>
      ) : (
        <Listing items={items} empty="" />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="boot" />}>
      <Results />
    </Suspense>
  );
}
