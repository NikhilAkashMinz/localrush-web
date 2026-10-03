'use client';

// What the shop has sold through LocalRush: every delivered order, with the price each item
// sold for. The server works it out from the orders themselves, so it always matches them,
// and it updates by itself as orders are delivered.

import { useState } from 'react';
import PeriodPicker from '@/components/PeriodPicker';
import { product, store } from '@/lib/data';
import { rupee, when } from '@/lib/format';
import { useReport } from '@/lib/hooks';
import { deliveredAt, itemCount, lineName, lineUnit } from '@/lib/orders';
import { PERIODS, type Period, type ProductSales, type SalesReport } from '@/lib/reports';
import { useStore } from '@/lib/state';

const priceText = (p: ProductSales) => (p.low === p.high ? rupee(p.low) : `${rupee(p.low)} to ${rupee(p.high)}`);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function SalesPage() {
  const user = useStore((s) => s.user);
  useStore((s) => s.tick);
  const [period, setPeriod] = useState<Period>('today');
  const { report, error } = useReport<SalesReport>('shop/sales', period);

  const shop = user?.storeId ? store(user.storeId) : undefined;
  if (!user || !shop) return null;

  const label = PERIODS.find((p) => p.key === period)!.label;
  const current = report && report.period === period ? report : null;
  const totals = report?.totals;
  const chosen = current?.totals[period];

  return (
    <div className="st-page">
      <section className="st-head">
        <div>
          <h1>Sales</h1>
          <p>What {shop.name} has sold through LocalRush, at the price each item sold for. An order counts once it is delivered.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} label="Sales period" />
      </section>

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      <dl className="st-stats">
        <div className="st-stat">
          <dt>Sold today</dt>
          <dd>
            {totals ? rupee(totals.today.revenue) : '…'}
            {totals && <small>{count(totals.today.orders, 'order', 'orders')}</small>}
          </dd>
        </div>
        <div className="st-stat">
          <dt>Last 7 days</dt>
          <dd>
            {totals ? rupee(totals.week.revenue) : '…'}
            {totals && <small>{count(totals.week.orders, 'order', 'orders')}</small>}
          </dd>
        </div>
        <div className="st-stat">
          <dt>All time</dt>
          <dd>
            {totals ? rupee(totals.all.revenue) : '…'}
            {totals && <small>{count(totals.all.orders, 'order', 'orders')}</small>}
          </dd>
        </div>
        <div className="st-stat">
          <dt>Items sold, {label.toLowerCase()}</dt>
          <dd>{chosen ? chosen.items : '…'}</dd>
        </div>
      </dl>

      <section className="st-done" aria-busy={!current}>
        <h2>What sold, {label.toLowerCase()}</h2>
        {!current ? (
          <p className="quiet">Adding up your sales…</p>
        ) : current.products.length === 0 ? (
          <p className="quiet">
            {period === 'all' ? 'Nothing has been delivered from your shop yet.' : `Nothing delivered ${period === 'today' ? 'today' : 'in the last 7 days'} yet.`}{' '}
            Sales show up here the moment a delivery partner hands an order over.
          </p>
        ) : (
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="num">
                  Sold
                </th>
                <th scope="col" className="num">
                  Price
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {current.products.map((p) => (
                <tr key={p.pid}>
                  <td>
                    {product(p.pid)?.emoji} {p.name}
                    <small>{p.unit}</small>
                  </td>
                  <td className="num">{p.qty}</td>
                  <td className="num">{priceText(p)}</td>
                  <td className="num">{rupee(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{chosen?.items}</td>
                <td />
                <td className="num">{rupee(chosen?.revenue ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {current && current.orders.length > 0 && (
        <section className="st-done">
          <h2>Orders delivered, {label.toLowerCase()}</h2>
          <ul className="st-sold">
            {current.orders.map((o) => (
              <li key={o.id}>
                <header>
                  <b>{o.id}</b>
                  <span>
                    {when(deliveredAt(o))} · {o.customerName} · {count(itemCount(o), 'item', 'items')}
                  </span>
                  <strong>{rupee(o.subtotal)}</strong>
                </header>
                <ul className="st-lines st-priced">
                  {o.lines.map((l) => (
                    <li key={l.pid}>
                      <span className="st-qty">{l.qty} ×</span>
                      <span>
                        {lineName(l)} <small>{lineUnit(l)} · {rupee(l.price)} each</small>
                      </span>
                      <span>{rupee(l.qty * l.price)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {chosen && chosen.orders > current.orders.length && (
            <p className="quiet small">
              Showing the latest {current.orders.length} of {chosen.orders} orders. The totals above count all of them.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
