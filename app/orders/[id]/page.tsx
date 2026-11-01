'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ProductArt } from '@/components/Product';
import { CheckIcon } from '@/components/Icons';
import LiveTrackMap, { ARRIVING_KM, LIVE_MS, liveEta } from '@/components/LiveTrackMap';
import { TrackMap } from '@/components/Scenes';
import { errorText } from '@/lib/api';
import { CATEGORIES, KIND_COLOR, product, store, type StoreKind } from '@/lib/data';
import { km, rupee, when } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { roadKm } from '@/lib/geo';
import { isOver, lineName, liveRiderPosition, minutesLeft, stageIndex, STAGES } from '@/lib/orders';
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

/** "just now", "40 s ago", "3 min ago". */
const ago = (ts: number, now: number) => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
};

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const user = useStore((s) => s.user);
  const order = useStore((s) => s.orders).find((o) => o.id === id);
  const now = useNow(1000);
  const [cancelling, setCancelling] = useState(false);
  /** The live street map or the 3D view; null picks by itself (the map once a partner has the order). */
  const [view, setView] = useState<'map' | '3d' | null>(null);

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
  const riding = order.status === 'assigned' || order.status === 'picked';
  const showMap = view ? view === 'map' : riding;
  // With the partner's GPS, the arrival time comes from where they really are (or were last seen:
  // the server stops sending a position that is more than a few minutes old).
  const eta = liveEta(order, shop);
  const left = eta ? eta.minutes : minutesLeft(order, now);
  // Without GPS, the map shows where the partner probably is on the way from the shop, by time.
  const guess = (() => {
    if (order.status !== 'picked' || order.rider || !shop) return null;
    const f = Math.min(1, Math.max(0, liveRiderPosition(order, now, shop) - 1));
    return { lat: shop.lat + (order.lat - shop.lat) * f, lng: shop.lng + (order.lng - shop.lng) * f };
  })();
  const headline = done
    ? 'Delivered'
    : order.status === 'cancelled'
      ? 'Order cancelled'
      : order.status === 'rejected'
        ? 'This order could not be accepted'
        : order.status === 'placed'
          ? 'Waiting for the shop to accept'
          : order.status === 'picked'
            ? eta && eta.toYou < ARRIVING_KM
              ? 'Arriving now'
              : `Arriving in about ${left} min`
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
              <div className="seg track-views" role="radiogroup" aria-label="How to show your delivery">
                <button type="button" role="radio" aria-checked={showMap} className={showMap ? 'on' : ''} onClick={() => setView('map')}>
                  Live map
                </button>
                <button type="button" role="radio" aria-checked={!showMap} className={showMap ? '' : 'on'} onClick={() => setView('3d')}>
                  3D view
                </button>
              </div>
              {showMap ? (
                <LiveTrackMap
                  order={order}
                  shop={shop ? { lat: shop.lat, lng: shop.lng, name: shop.name, emoji: KIND_EMOJI[kind], color: KIND_COLOR[kind] } : null}
                  estimate={guess}
                  now={now}
                />
              ) : (
                <TrackMap
                  rider={liveRiderPosition(order, now, shop)}
                  stage={stage}
                  done={done}
                  shopEmoji={KIND_EMOJI[kind]}
                  shopColor={KIND_COLOR[kind]}
                />
              )}
              <div className="demo">
                <p>
                  <b>Live order.</b> Each step changes the moment the shop or the delivery partner confirms it.{' '}
                  {order.rider
                    ? 'The map follows your delivery partner’s phone, live: each new GPS position shows up here within about a second.'
                    : riding
                      ? 'The partner’s live position shows on the map when their LocalRush Partner app shares GPS.'
                      : 'Once a delivery partner takes your order, you can follow them on the live map.'}
                </p>
                {order.status === 'placed' && (
                  <button type="button" className="btn btn-small btn-line" disabled={cancelling} onClick={cancel}>
                    {cancelling ? 'Cancelling…' : 'Cancel order'}
                  </button>
                )}
              </div>
              {!done && (
                <p className="demo-turn">
                  <b>Testing the project?</b>{' '}
                  {order.status === 'placed' || order.status === 'accepted' ? (
                    <>
                      This order is on the dashboard of <b>{order.storeName}</b>, and only that shop&apos;s owner sees it.{' '}
                      <a className="link" href={`/dashboard?shop=${encodeURIComponent(order.storeId)}`} target="_blank" rel="noreferrer">
                        Open that shop&apos;s dashboard
                      </a>{' '}
                      to {order.status === 'placed' ? 'accept it' : 'mark it packed'}.
                    </>
                  ) : order.status === 'packed' ? (
                    <>
                      It is packed and waiting for a delivery partner who is online near the shop.{' '}
                      <a className="link" href="/partner" target="_blank" rel="noreferrer">
                        Open the delivery partner screen
                      </a>{' '}
                      and take it.
                    </>
                  ) : (
                    <>
                      The next step is the delivery partner&apos;s, on the{' '}
                      <a className="link" href="/partner" target="_blank" rel="noreferrer">
                        delivery partner screen
                      </a>
                      {order.status === 'picked' ? '. They will ask for the code shown on this page.' : '.'}
                    </>
                  )}
                </p>
              )}
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

          {!stopped && !done && (
            <div className="partner">
              <span className="partner-face" aria-hidden>
                {order.partnerName ? '🛵' : '🔑'}
              </span>
              <span>
                <b>{order.partnerName ?? 'Your delivery code'}</b>
                <small>{order.partnerName ? 'Your delivery partner. Give them this code at the door.' : 'Give this code to the delivery partner at the door.'}</small>
                {order.rider && (
                  <small className="partner-live">
                    {now - order.rider.at < LIVE_MS ? 'Live from their phone: ' : 'Last seen '}
                    {km(roadKm(order.rider.lat, order.rider.lng, order.lat, order.lng))} from you, {ago(order.rider.at, now)}
                  </small>
                )}
              </span>
              <span className="otp">
                <small>Code for {order.id}</small>
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
                      {l.qty} × {lineName(l)}
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
