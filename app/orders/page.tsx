'use client';

import Link from 'next/link';
import { rupee, when } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { isOver, minutesLeft, STATUS_LABEL } from '@/lib/orders';
import { actions, useStore } from '@/lib/state';

export default function OrdersPage() {
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const now = useNow(15_000);

  if (!user) {
    return (
      <div className="page page-narrow">
        <h1 className="title">Your orders</h1>
        <div className="empty empty-page">
          <h2>Log in to see your orders</h2>
          <p className="quiet">Your orders are kept with your account, so you can follow them from any device.</p>
          <Link href="/login?next=/orders" className="btn">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  if (user.role !== 'customer') {
    return (
      <div className="page page-narrow">
        <h1 className="title">Your orders</h1>
        <div className="empty empty-page">
          <h2>This is a {user.role === 'shop' ? 'shop' : 'delivery partner'} account</h2>
          <p className="quiet">
            {user.role === 'shop' ? 'Orders for your shop are on the dashboard.' : 'Your deliveries are on the delivery screen.'}
          </p>
          <Link href={user.role === 'shop' ? '/dashboard' : '/partner'} className="btn">
            Open it
          </Link>
        </div>
      </div>
    );
  }

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
            const over = isOver(o.status);
            const count = o.lines.reduce((a, l) => a + l.qty, 0);
            const cls = o.status === 'delivered' ? 'status status-done' : over ? 'status status-off' : 'status';
            return (
              <li key={o.id} className="order">
                <div>
                  <b>{o.storeName}</b>
                  <small>
                    {count} {count === 1 ? 'item' : 'items'}, {rupee(o.total)}, placed {when(o.createdAt)}
                  </small>
                  {!over && o.otp && (
                    <small>
                      Order {o.id} · delivery code <b>{o.otp}</b>
                    </small>
                  )}
                </div>
                <span className={cls}>
                  {STATUS_LABEL[o.status]}
                  {over ? '' : `, about ${minutesLeft(o, now)} min left`}
                </span>
                <div className="order-acts">
                  <Link href={`/orders/${o.id}`} className="btn btn-small">
                    {over ? 'View order' : 'Track order'}
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
