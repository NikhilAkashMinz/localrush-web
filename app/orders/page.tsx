'use client';

import Link from 'next/link';
import { store } from '@/lib/data';
import { rupee, when } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { progress, STAGES } from '@/lib/orders';
import { actions, useStore } from '@/lib/state';

export default function OrdersPage() {
  const orders = useStore((s) => s.orders);
  const now = useNow(1000);

  return (
    <div className="page page-narrow">
      <h1 className="title">Your orders</h1>
      {orders.length === 0 ? (
        <div className="empty empty-page">
          <h2>No orders yet</h2>
          <p className="quiet">When you place an order, you can follow it here.</p>
          <Link href="/" className="btn">
            Browse shops
          </Link>
        </div>
      ) : (
        <ul className="orders">
          {orders.map((o) => {
            const pr = progress(o, now);
            const count = o.lines.reduce((a, l) => a + l.qty, 0);
            return (
              <li key={o.id} className="order">
                <div>
                  <b>{store(o.storeId)?.name ?? 'Shop'}</b>
                  <small>
                    {count} {count === 1 ? 'item' : 'items'}, {rupee(o.total)}, placed {when(o.placedAt)}
                  </small>
                </div>
                <span className={pr.done ? 'status status-done' : 'status'}>
                  {pr.done ? 'Delivered' : `${STAGES[pr.stage].label}, about ${pr.minutesLeft} min left`}
                </span>
                <div className="order-acts">
                  <Link href={`/orders/${o.id}`} className="btn btn-small">
                    {pr.done ? 'View order' : 'Track order'}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-small btn-line"
                    onClick={() => {
                      o.lines.forEach((l) => actions.add(l.pid, l.qty));
                      actions.open('cart');
                    }}
                  >
                    Order again
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
