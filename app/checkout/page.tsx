'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProductArt } from '@/components/Product';
import { product } from '@/lib/data';
import { km, mins, rupee } from '@/lib/format';
import { usePlan } from '@/lib/hooks';
import { FACTOR_LABEL, MODES, WEIGHTS, type Candidate, type Factor, type Shipment } from '@/lib/select';
import { ApiFail, errorText } from '@/lib/api';
import { actions, useStore } from '@/lib/state';

const TAGS = ['Home', 'Hostel', 'Work'];
const FACTORS: Factor[] = ['eta', 'distance', 'price', 'workload'];

function factorValue(c: Candidate, f: Factor) {
  if (f === 'distance') return km(c.near.distKm);
  if (f === 'eta') return mins(c.near.etaMin);
  if (f === 'workload') return `${Math.round(c.near.load * 100)}% busy`;
  return rupee(c.subtotal);
}

function Comparison({ s }: { s: Shipment }) {
  const rows = s.candidates.slice(0, 3);
  if (rows.length < 2) {
    return <p className="quiet small">This is the only open shop within 5 km that has these items.</p>;
  }
  return (
    <div className="compare">
      {rows.map((c, i) => (
        <div key={c.near.store.id} className={i === 0 ? 'cmp cmp-win' : 'cmp'}>
          <header>
            <b>{c.near.store.name}</b>
            {i === 0 ? <span className="tag">Picked</span> : null}
            <em>
              {c.lines.length < s.lines.length
                ? `Has ${c.lines.length} of ${s.lines.length} items`
                : `Score ${c.score} of 100`}
            </em>
          </header>
          <div className="meters">
            {FACTORS.map((f) => (
              <div key={f} className="meter">
                <span>{FACTOR_LABEL[f]}</span>
                <i>
                  <u style={{ width: `${Math.max(6, Math.round(c.parts[f] * 100))}%` }} />
                </i>
                <small>{factorValue(c, f)}</small>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CheckoutPage() {
  const plan = usePlan();
  const user = useStore((s) => s.user);
  const place = useStore((s) => s.place);
  const mode = useStore((s) => s.mode);
  const router = useRouter();

  const here = (user?.addresses ?? []).filter((a) => a.place.label === place.label);
  const [line, setLine] = useState(here[0]?.line ?? '');
  const [tag, setTag] = useState(here[0]?.tag ?? 'Home');
  const [payment, setPayment] = useState<'cod' | 'online'>('cod');
  const [upi, setUpi] = useState('');
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  if (user && user.role !== 'customer') {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>This is a {user.role === 'shop' ? 'shop' : 'delivery partner'} account</h1>
          <p className="quiet">Only customer accounts can place orders. Log out and log in with a different mobile number to shop.</p>
          <Link href={user.role === 'shop' ? '/dashboard' : '/partner'} className="btn">
            {user.role === 'shop' ? 'Go to your dashboard' : 'Go to your deliveries'}
          </Link>
        </div>
      </div>
    );
  }

  // The cart empties the moment the order goes through; hold the screen until the next page opens.
  if (plan.shipments.length === 0 && paying) return <div className="boot" aria-busy="true" />;

  if (plan.shipments.length === 0) {
    return (
      <div className="page">
        <div className="empty empty-page">
          <h1>Nothing to check out</h1>
          <p className="quiet">
            {plan.unavailable.length
              ? 'The items in your cart cannot be delivered right now. Open the cart to see why.'
              : 'Your cart is empty. Add something from a shop near you first.'}
          </p>
          <Link href="/" className="btn">
            Browse shops
          </Link>
        </div>
      </div>
    );
  }

  const w = WEIGHTS[mode];
  const slowest = Math.max(...plan.shipments.map((s) => s.etaMin));

  const placeOrder = async () => {
    setError('');
    if (line.trim().length < 6) return setError('Add your flat, building and street so the delivery partner can find you.');
    if (payment === 'online' && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi.trim())) {
      return setError('Enter a UPI ID like name@bank, or choose cash on delivery.');
    }
    setPaying(true);
    try {
      // The server chooses the shops again from live stock, so what it creates is what counts.
      const { orders, leftOut } = await actions.placeOrders({ line: line.trim(), tag, payment });
      const left = leftOut.length ? ` ${leftOut.length === 1 ? '1 item was' : `${leftOut.length} items were`} left out.` : '';
      actions.toast((orders.length === 1 ? 'Order placed.' : `${orders.length} orders placed.`) + left);
      router.push(orders.length === 1 ? `/orders/${orders[0].id}` : '/orders');
    } catch (e) {
      setPaying(false);
      if (e instanceof ApiFail && e.code === 'login') return router.push('/login?next=/checkout');
      setError(errorText(e));
      // Stock or shop hours may have changed under us: show the latest.
      void actions.refreshCatalog();
    }
  };

  return (
    <div className="page">
      <h1 className="title">Checkout</h1>
      <div className="checkout">
        <div className="steps">
          <section className="box">
            <h2>Deliver to</h2>
            <p className="box-row">
              <span>
                Near <b>{place.label}</b>, {place.sub}
              </span>
              <button type="button" className="link" onClick={() => actions.open('place')}>
                Change
              </button>
            </p>
            {here.length > 0 && (
              <div className="pills">
                {here.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={a.line === line ? 'pill on' : 'pill'}
                    onClick={() => {
                      setLine(a.line);
                      setTag(a.tag);
                    }}
                  >
                    {a.tag}: {a.line}
                  </button>
                ))}
              </div>
            )}
            <label className="field">
              <span>Flat, building and street</span>
              <input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder="Room 214, Boys Hostel Block B"
                autoComplete="street-address"
              />
            </label>
            <div className="seg" role="radiogroup" aria-label="Address type">
              {TAGS.map((t) => (
                <button type="button" key={t} role="radio" aria-checked={tag === t} className={tag === t ? 'on' : ''} onClick={() => setTag(t)}>
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section className="box">
            <h2>How should we pick the shop?</h2>
            <p className="quiet">
              LocalRush scores every open shop within 5 km that has your items. Change what matters most and watch the
              pick update.
            </p>
            <div className="seg seg-wide" role="radiogroup" aria-label="What matters most">
              {MODES.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  role="radio"
                  aria-checked={mode === m.key}
                  className={mode === m.key ? 'on' : ''}
                  onClick={() => actions.setMode(m.key)}
                >
                  <b>{m.label}</b>
                  <small>{m.hint}</small>
                </button>
              ))}
            </div>
            <p className="weights">
              Weights:{' '}
              {FACTORS.map((f) => `${FACTOR_LABEL[f].toLowerCase()} ${Math.round(w[f] * 100)}%`).join(', ')}.
            </p>

            {plan.shipments.length > 1 && (
              <p className="note">
                No single shop has everything, so your cart is split across {plan.shipments.length} shops, each chosen
                the same way.
              </p>
            )}

            {plan.shipments.map((s, i) => (
              <div className="pick" key={s.near.store.id}>
                <header>
                  <span>
                    {plan.shipments.length > 1 && <small>Delivery {i + 1} of {plan.shipments.length}</small>}
                    <b>{s.near.store.name}</b>
                  </span>
                  <em>about {mins(s.etaMin)}</em>
                </header>
                <ul className="pick-items">
                  {s.lines.map((l) => {
                    const p = product(l.pid)!;
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
                <Comparison s={s} />
              </div>
            ))}

            {plan.unavailable.length > 0 && (
              <p className="warn">
                {plan.unavailable.length === 1 ? '1 item' : `${plan.unavailable.length} items`} in your cart cannot be
                delivered right now and will be left out:{' '}
                {plan.unavailable.map((pid) => product(pid)?.name).join(', ')}.
              </p>
            )}
          </section>

          <section className="box">
            <h2>Pay with</h2>
            <div className="pay">
              <label className={payment === 'cod' ? 'on' : ''}>
                <input type="radio" name="pay" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
                <span>
                  <b>Cash on delivery</b>
                  <small>Pay the delivery partner in cash or by UPI at the door</small>
                </span>
              </label>
              <label className={payment === 'online' ? 'on' : ''}>
                <input type="radio" name="pay" checked={payment === 'online'} onChange={() => setPayment('online')} />
                <span>
                  <b>UPI</b>
                  <small>Demo only: no money moves</small>
                </span>
              </label>
            </div>
            {payment === 'online' && (
              <label className="field">
                <span>UPI ID</span>
                <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" inputMode="email" autoComplete="off" />
              </label>
            )}
          </section>
        </div>

        <aside className="summary">
          <h2>Bill</h2>
          <dl className="bill">
            <div>
              <dt>
                {plan.items} {plan.items === 1 ? 'item' : 'items'}
              </dt>
              <dd>{rupee(plan.subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery{plan.shipments.length > 1 ? ` (${plan.shipments.length} trips)` : ''}</dt>
              <dd>{plan.fees === 0 ? 'Free' : rupee(plan.fees)}</dd>
            </div>
            {plan.mrpTotal > plan.subtotal && (
              <div className="bill-save">
                <dt>You save on MRP</dt>
                <dd>{rupee(plan.mrpTotal - plan.subtotal)}</dd>
              </div>
            )}
            <div className="bill-total">
              <dt>To pay</dt>
              <dd>{rupee(plan.total)}</dd>
            </div>
          </dl>
          <p className="summary-eta">
            {plan.shipments.length === 1 ? 'Arrives' : 'Everything arrives'} in about {mins(slowest)}.
          </p>
          {error && <p className="warn" role="alert">{error}</p>}
          {user ? (
            <button type="button" className="btn btn-wide btn-big" onClick={placeOrder} disabled={paying}>
              <span>{paying ? 'Placing your order…' : 'Place order'}</span>
              <b>{rupee(plan.total)}</b>
            </button>
          ) : (
            <>
              <Link href="/login?next=/checkout" className="btn btn-wide btn-big">
                <span>Log in to place order</span>
              </Link>
              <p className="quiet small">Your cart stays as it is while you log in.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
