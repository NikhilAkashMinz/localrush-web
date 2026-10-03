'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ProductArt } from '@/components/Product';
import { CheckIcon } from '@/components/Icons';
import { TrackMap } from '@/components/Scenes';
import { errorText } from '@/lib/api';
import { CATEGORIES, KIND_COLOR, product, store, type StoreKind } from '@/lib/data';
import { km, rupee, when } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { isOver, minutesLeft, riderPosition, stageIndex, STAGES } from '@/lib/orders';
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

const clock = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const user = useStore((s) => s.user);
  const order = useStore((s) => s.orders).find((o) => o.id === id);
  const now = useNow(1000);
  const [cancelling, setCancelling] = useState(false);

  if (!order) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>We could not find that order</h1>
          <p className="quiet">
            {user ? 'It is not among the orders on this account.' : 'Log in with the mobile number you ordered with to see it.'}
          </p>
          <Link href={user ? '/orders' : `/login?next=/orders/${id}`} className="btn">
            {user ? 'Your orders' : 'Log in'}
          </Link>
        </div>
      </div>
    );
  }

  const shop = store(order.storeId);
  const kind = shop?.kind ?? 'kirana';
  const stage = stageIndex(order.status);
  const done = order.status === 'delivered';
  const stopped = order.status === 'cancelled' || order.status === 'rejected';
  const left = minutesLeft(order, now);
  const headline = done
    ? 'Delivered'
    : order.status === 'cancelled'
      ? 'Order cancelled'
      : order.status === 'rejected'
        ? 'This order could not be accepted'
        : order.status === 'placed'
          ? 'Waiting for the shop to accept'
          : order.status === 'picked'
            ? `Arriving in about ${left} min`
            : `On track for about ${left} min`;
  const timeOf = (key: string) => [...order.history].reverse().find((h) => h.status === key)?.at;

  const cancel = async () => {
    setCancelling(true);
    try {
      await actions.orderAction(order.id, 'cancel');
      actions.toast('Order cancelled');
    } catch (e) {
      actions.toast(errorText(e));
    }
    setCancelling(false);
  };

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
              {order.storeName} to {order.address}. {km(order.distKm)} by road.
            </p>
          </header>

          {order.note && !done && <p className={stopped ? 'warn' : 'note'}>{order.note}</p>}

          {stopped ? (
            <div className="demo">
              <p>
                {order.payment === 'online'
                  ? 'Nothing was charged: payments are a demo in this project.'
                  : 'You have not paid anything for this order.'}{' '}
                The items are back on the shelf, so you can order them again.
              </p>
              <button
                type="button"
                className="btn btn-small btn-line"
                onClick={() => {
                  order.lines.forEach((l) => actions.add(l.pid, l.qty));
                  actions.open('cart');
                }}
              >
                Add these to the cart
              </button>
            </div>
          ) : (
            <>
              <TrackMap
                rider={riderPosition(order, now)}
                stage={stage}
                done={done}
                shopEmoji={KIND_EMOJI[kind]}
                shopColor={KIND_COLOR[kind]}
              />
              <div className="demo">
                <p>
                  <b>Live order.</b> Each step changes the moment the shop or the delivery partner confirms it. The
                  scooter on the map is an estimate between those steps, not GPS.
                </p>
                {order.status === 'placed' && (
                  <button type="button" className="btn btn-small btn-line" disabled={cancelling} onClick={cancel}>
                    {cancelling ? 'Cancelling…' : 'Cancel order'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="track-side">
          {!stopped && (
            <ol className="timeline">
              {STAGES.map((s, i) => {
                const state = i < stage || done ? 'done' : i === stage ? 'now' : 'todo';
                const at = state === 'todo' ? undefined : timeOf(s.key);
                return (
                  <li key={s.key} className={`tl tl-${state}`}>
                    <i>{state === 'done' ? <CheckIcon width={14} height={14} /> : null}</i>
                    <span>
                      <b>{s.label}</b>
                      {state === 'now' && <small>{s.note}</small>}
                      {state === 'done' && at && <small>{clock(at)}</small>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {order.partnerName && (order.status === 'assigned' || order.status === 'picked') && (
            <div className="partner">
              <span className="partner-face" aria-hidden>
                🛵
              </span>
              <span>
                <b>{order.partnerName}</b>
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
                <dt>{stopped ? 'Order value' : order.payment === 'cod' ? (done ? 'Paid at the door' : 'Pay at the door') : 'Paid by UPI (demo)'}</dt>
                <dd>{rupee(order.total)}</dd>
              </div>
            </dl>
            <p className="quiet small">Placed {when(order.createdAt)}</p>
          </section>

          {isOver(order.status) && (
            <Link href={`/c/${CATEGORIES[0].slug}`} className="btn btn-wide">
              Order something else
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
