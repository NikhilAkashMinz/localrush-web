'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Listing } from '@/components/Listing';
import { CATEGORIES, category, PRODUCTS } from '@/lib/data';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const c = category(slug);

  if (!c) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>We could not find that category</h1>
          <Link href="/" className="btn">
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <nav className="tabs" aria-label="Categories">
        {CATEGORIES.map((x) => (
          <Link key={x.slug} href={`/c/${x.slug}`} className={x.slug === c.slug ? 'tab on' : 'tab'}>
            <span aria-hidden>{x.emoji}</span>
            {x.short}
          </Link>
        ))}
      </nav>
      <h1 className="title">{c.name}</h1>
      <Listing items={PRODUCTS.filter((p) => p.cat === c.slug)} empty="This category has no products yet." />
    </div>
  );
}
