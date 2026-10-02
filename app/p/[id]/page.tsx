'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AddButton, ProductRow, unavailableText } from '@/components/Product';
import { PackViewer } from '@/components/Scenes';
import { category, describe, product, PRODUCTS } from '@/lib/data';
import { km, mins, rupee } from '@/lib/format';
import { useAvailability } from '@/lib/hooks';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const p = product(id);
  const a = useAvailability(id);

  if (!p) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>We could not find that product</h1>
          <Link href="/" className="btn">
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  const c = category(p.cat)!;
  const ok = a.state === 'available';
  const price = ok ? a.best.price : p.mrp;
  const off = ok ? Math.round((1 - price / p.mrp) * 100) : 0;
  const more = PRODUCTS.filter((x) => x.cat === p.cat && x.id !== p.id);

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden>/</span>
        <Link href={`/c/${c.slug}`}>{c.name}</Link>
      </nav>

      <div className="pdp">
        <div className="pdp-view" style={{ background: c.tint }}>
          <PackViewer p={p} />
        </div>

        <div className="pdp-info">
          <h1>{p.name}</h1>
          <p className="pdp-unit">{p.unit}</p>

          <div className="pdp-price">
            <b>{rupee(price)}</b>
            {off > 0 && (
              <>
                <s>{rupee(p.mrp)}</s>
                <span className="chip chip-off chip-static">{off}% off</span>
              </>
            )}
          </div>

          {ok ? (
            <>
              <p className="pdp-eta">
                From {a.best.near.store.name}, about {mins(a.best.near.etaMin)} away.
                {a.best.stock <= 3 ? ` Only ${a.best.stock} left there.` : ''}
              </p>
              <AddButton p={p} max={a.maxQty} big />
            </>
          ) : (
            <p className="warn">{unavailableText(a)}</p>
          )}

          <p className="pdp-desc">{describe(p)}</p>

          {ok && (
            <section className="sellers">
              <h2>
                {a.offers.length === 1 ? 'One shop near you has this' : `${a.offers.length} shops near you have this`}
              </h2>
              <ul>
                {a.offers.map((o) => (
                  <li key={o.near.store.id}>
                    <Link href={`/store/${o.near.store.id}`}>
                      <b>{o.near.store.name}</b>
                      <small>
                        {km(o.near.distKm)} away, about {mins(o.near.etaMin)}
                        {o.stock <= 3 ? `, only ${o.stock} left` : ''}
                      </small>
                    </Link>
                    <span>{rupee(o.price)}</span>
                  </li>
                ))}
              </ul>
              <p className="quiet small">
                You do not have to choose. At checkout LocalRush compares these shops and picks the best one for your
                whole cart.
              </p>
            </section>
          )}
        </div>
      </div>

      <ProductRow title={`More in ${c.name.toLowerCase()}`} href={`/c/${c.slug}`} items={more} />
    </div>
  );
}
