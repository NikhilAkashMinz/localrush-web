'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProductArt } from '@/components/Product';
import { CheckIcon } from '@/components/Icons';
import { TrackMap } from '@/components/Scenes';
import { CATEGORIES, KIND_COLOR, product, store, type StoreKind } from '@/lib/data';
import { km, rupee, when } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { progress, STAGES } from '@/lib/orders';
import { actions, useStore } from '@/lib/state';

const KIND_EMOJI: Record<StoreKind, string> = {
  kirana: '🛒',
  supermarket: '🏬',
  fresh: '🥕',
  pharmacy: '💊',
  stationery: '📓',
  electronics: '🔌',
  bakery: '🥐',
};

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const order = useStore((s) => s.orders).find((o) => o.id === id);
  const now = useNow(400);

  if (!order) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>We could not find that order</h1>
          <p className="quiet">Orders are saved in this browser only, so they do not follow you to another device yet.</p>
          <Link href="/orders" className="btn">
            Your orders
          </Link>
        </div>
      </div>
    );
  }

  const shop = store(order.storeId);
  const pr = progress(order, now);
  const kind = shop?.kind ?? 'kirana';
  const headline = pr.done
    ? 'Delivered'
    : pr.stage >= 4
      ? `Arriving in about ${pr.minutesLeft} min`
      : `On track for about ${pr.minutesLeft} min`;

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/orders">Your orders</Link>
        <span aria-hidden>/</span>
        <span>{order.id}</span>
      </nav>

      <div className="track">
        <div className="track-main">
          <header className="track-head">
            <h1 aria-live="polite">{headline}</h1>
            <p>
              {shop?.name} to {order.address}. {km(order.distKm)} by road.
            </p>
          </header>

          <TrackMap rider={pr.rider} stage={pr.stage} done={pr.done} shopEmoji={KIND_EMOJI[kind]} shopColor={KIND_COLOR[kind]} />

          <div className="demo">
            <p>
              <b>Demo clock.</b> The shop and delivery partner apps are not built yet, so this order moves through its
              steps on its own in about a minute.
            </p>
            <button type="button" className="btn btn-small btn-line" disabled={pr.done} onClick={() => actions.skipStage(order.id)}>
              Skip to next step
            </button>
          </div>
        </div>

        <aside className="track-side">
          <ol className="timeline">
            {STAGES.map((s, i) => {
              const state = i < pr.stage || pr.done ? 'done' : i === pr.stage ? 'now' : 'todo';
              return (
                <li key={s.key} className={`tl tl-${state}`}>
                  <i>{state === 'done' ? <CheckIcon width={14} height={14} /> : null}</i>
                  <span>
                    <b>{s.label}</b>
                    {state === 'now' && <small>{s.note}</small>}
                  </span>
                </li>
              );
            })}
          </ol>

          {pr.stage >= 3 && !pr.done && (
            <div className="partner">
              <span className="partner-face" aria-hidden>
                🛵
              </span>
              <span>
                <b>{order.partner}</b>
                <small>Your delivery partner</small>
              </span>
              <span className="otp">
                <small>Code at the door</small>
                <b>{order.otp}</b>
              </span>
            </div>
          )}

          <section className="box box-flat">
            <h2>Order {order.id}</h2>
            <ul className="pick-items">
              {order.lines.map((l) => {
                const p = product(l.pid);
                if (!p) return null;
                return (
                  <li key={l.pid}>
                    <ProductArt p={p} size="sm" />
                    <span>
                      {l.qty} × {p.name}
                    </span>
                    <b>{rupee(l.price * l.qty)}</b>
                  </li>
                );
              })}
            </ul>
            <dl className="bill">
              <div>
                <dt>Items</dt>
                <dd>{rupee(order.subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{order.fee === 0 ? 'Free' : rupee(order.fee)}</dd>
              </div>
              <div className="bill-total">
                <dt>{order.payment === 'cod' ? 'Pay at the door' : 'Paid by UPI'}</dt>
                <dd>{rupee(order.total)}</dd>
              </div>
            </dl>
            <p className="quiet small">Placed {when(order.placedAt)}</p>
          </section>

          {pr.done && (
            <Link href={`/c/${CATEGORIES[0].slug}`} className="btn btn-wide">
              Order something else
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
