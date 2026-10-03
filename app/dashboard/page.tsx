'use client';

// The shop owner's live order board. New orders appear here by themselves the moment a
// customer pays; the owner accepts, packs and hands over, and every step shows up at once
// on the customer's tracking page and on the delivery partners' screens.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { errorText } from '@/lib/api';
import { product, store } from '@/lib/data';
import { hourLabel, rupee } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { isOpen, istHour } from '@/lib/nearby';
import type { Order, Status } from '@/lib/orders';
import { actions, useStore } from '@/lib/state';

const COLUMNS: { key: string; title: string; hint: string; statuses: Status[] }[] = [
  { key: 'new', title: 'New', hint: 'Accept or turn down', statuses: ['placed'] },
  { key: 'packing', title: 'Packing', hint: 'Pack, then mark ready', statuses: ['accepted'] },
  { key: 'ready', title: 'Ready for pickup', hint: 'Waiting for the partner', statuses: ['packed', 'assigned'] },
  { key: 'out', title: 'Out for delivery', hint: 'With the partner', statuses: ['picked'] },
];

const DONE: Status[] = ['delivered', 'cancelled', 'rejected'];
/** After this long, a new order that nobody has answered is shown as late. */
const LATE_MS = 2 * 60_000;

const since = (o: Order) => o.history[o.history.length - 1]?.at ?? o.updatedAt;

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** The start of today in India, as a timestamp, so "today" means the shop's day. */
function startOfDayIST(now: number) {
  const offset = 5.5 * 3600_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

/** A short two-note chime for a new order. Browsers only allow sound after the page has been clicked once. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    // No sound is fine; the card is still highlighted.
  }
}

function Card({ o, now, fresh }: { o: Order; now: number; fresh: boolean }) {
  const [busy, setBusy] = useState('');
  const waited = now - since(o);
  const late = o.status === 'placed' && waited > LATE_MS;
  const count = o.lines.reduce((a, l) => a + l.qty, 0);

  const run = async (action: string, done: string) => {
    setBusy(action);
    try {
      await actions.orderAction(o.id, action);
      actions.toast(done);
    } catch (e) {
      actions.toast(errorText(e));
    }
    setBusy('');
  };

  return (
    <li className={`st-card${fresh ? ' st-fresh' : ''}${late ? ' st-late' : ''}`}>
      <header>
        <b>{o.id}</b>
        <span className="st-timer" title="Time in this step">
          {elapsed(waited)}
        </span>
      </header>
      <p className="st-who">
        {o.customerName} · {count} {count === 1 ? 'item' : 'items'} · {rupee(o.subtotal)}
      </p>
      <ul className="st-lines">
        {o.lines.map((l) => {
          const p = product(l.pid);
          return (
            <li key={l.pid}>
              <span className="st-qty">{l.qty} ×</span>
              <span>
                {p ? `${p.emoji} ${p.name}` : l.pid}
                {p && <small> {p.unit}</small>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="st-meta">
        {o.payment === 'cod' ? `Cash on delivery: ${rupee(o.total)}` : 'Paid online'} · {o.address}
      </p>

      {o.status === 'placed' && (
        <div className="st-acts">
          <button type="button" className="btn btn-small" disabled={busy !== ''} onClick={() => run('accept', `${o.id} accepted`)}>
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </button>
          <button type="button" className="btn btn-small btn-line" disabled={busy !== ''} onClick={() => run('reject', `${o.id} passed on`)}>
            {busy === 'reject' ? 'Passing on…' : 'Cannot take it'}
          </button>
        </div>
      )}
      {o.status === 'accepted' && (
        <div className="st-acts">
          <button type="button" className="btn btn-small btn-gold" disabled={busy !== ''} onClick={() => run('pack', `${o.id} is ready for pickup`)}>
            {busy === 'pack' ? 'Saving…' : 'Packed and ready'}
          </button>
        </div>
      )}
      {o.status === 'packed' && <p className="st-wait">Looking for a delivery partner nearby…</p>}
      {o.status === 'assigned' && (
        <p className="st-wait st-wait-on">
          🛵 <b>{o.partnerName}</b> is coming to collect it
        </p>
      )}
      {o.status === 'picked' && (
        <p className="st-wait st-wait-on">
          🛵 <b>{o.partnerName}</b> is delivering it
        </p>
      )}
    </li>
  );
}

export default function DashboardPage() {
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  useStore((s) => s.tick);
  const now = useNow(1000);
  const [pausing, setPausing] = useState(false);

  // Remember which new orders have been seen, so a fresh arrival can chime and glow.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const waiting = orders.filter((o) => o.status === 'placed');
  const waitingKey = waiting.map((o) => o.id).join(',');

  useEffect(() => {
    const ids = waitingKey ? waitingKey.split(',') : [];
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const arrived = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (arrived.length === 0) return;
    chime();
    setFresh((f) => new Set([...f, ...arrived]));
    const timer = setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !arrived.includes(id)))), 8000);
    return () => clearTimeout(timer);
  }, [waitingKey]);

  // Show waiting orders in the browser tab, so the owner notices from another tab.
  useEffect(() => {
    const before = document.title;
    document.title = waiting.length ? `(${waiting.length}) New orders · LocalRush` : 'Shop dashboard · LocalRush';
    return () => {
      document.title = before;
    };
  }, [waiting.length]);

  const shop = user?.storeId ? store(user.storeId) : undefined;
  if (!user || !shop) return null;

  const dayStart = startOfDayIST(now);
  const today = orders.filter((o) => o.createdAt >= dayStart);
  const kept = today.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  const delivered = today.filter((o) => o.status === 'delivered');
  const finished = today.filter((o) => DONE.includes(o.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  const sales = kept.reduce((a, o) => a + o.subtotal, 0);
  const openNow = isOpen({ ...shop, paused: false }, istHour(new Date(now)));

  const togglePause = async () => {
    setPausing(true);
    try {
      await actions.setShopPaused(!shop.paused);
      actions.toast(shop.paused ? 'You are taking orders again' : 'Paused: customers cannot order from you for now');
    } catch (e) {
      actions.toast(errorText(e));
    }
    setPausing(false);
  };

  return (
    <div className="st-page">
      <section className="st-head">
        <div>
          <h1>Orders</h1>
          <p>
            {shop.area} · open {hourLabel(shop.open[0])} to {hourLabel(shop.open[1])}
            {openNow ? '' : ' · closed at this hour, so customers do not see you right now'}
          </p>
        </div>
        <button
          type="button"
          className={shop.paused ? 'st-switch' : 'st-switch on'}
          role="switch"
          aria-checked={!shop.paused}
          disabled={pausing}
          onClick={togglePause}
        >
          <i aria-hidden />
          <span>{shop.paused ? 'Paused' : 'Taking orders'}</span>
        </button>
      </section>

      {shop.paused && (
        <p className="warn st-banner">
          Your shop is paused. Customers cannot order from you until you switch it back on. Orders you already have
          are still below.
        </p>
      )}

      <dl className="st-stats">
        <div className={waiting.length ? 'st-stat st-stat-hot' : 'st-stat'}>
          <dt>Waiting for you</dt>
          <dd>{waiting.length}</dd>
        </div>
        <div className="st-stat">
          <dt>Orders today</dt>
          <dd>{kept.length}</dd>
        </div>
        <div className="st-stat">
          <dt>Delivered today</dt>
          <dd>{delivered.length}</dd>
        </div>
        <div className="st-stat">
          <dt>Sales today</dt>
          <dd>{rupee(sales)}</dd>
        </div>
      </dl>

      <div className="st-board">
        {COLUMNS.map((c) => {
          const list = orders.filter((o) => c.statuses.includes(o.status)).sort((a, b) => a.createdAt - b.createdAt);
          return (
            <section key={c.key} className={`st-col st-col-${c.key}`} aria-label={c.title}>
              <header>
                <h2>{c.title}</h2>
                <span className={list.length ? 'hot' : ''}>{list.length}</span>
              </header>
              {list.length === 0 ? (
                <p className="st-none">{c.key === 'new' ? 'New orders appear here by themselves.' : c.hint}</p>
              ) : (
                <ul>
                  {list.map((o) => (
                    <Card key={o.id} o={o} now={now} fresh={fresh.has(o.id)} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="st-done">
        <h2>Finished today</h2>
        {finished.length === 0 ? (
          <p className="quiet">Delivered and cancelled orders from today are listed here.</p>
        ) : (
          <ul>
            {finished.map((o) => (
              <li key={o.id}>
                <b>{o.id}</b>
                <span>{o.customerName}</span>
                <span>{rupee(o.subtotal)}</span>
                <em className={o.status === 'delivered' ? 'ok' : ''}>
                  {o.status === 'delivered' ? `Delivered by ${o.partnerName ?? 'partner'}` : o.status === 'cancelled' ? 'Cancelled by customer' : 'Turned down'}
                </em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="quiet small">
        Running low on something? Update it in <Link href="/dashboard/inventory" className="link">Stock and prices</Link> and
        customers see the change straight away.
      </p>
    </div>
  );
}
