'use client';

// The delivery partner's screen, made for a phone. Go online, see packed orders waiting
// at shops nearby, take one, collect it, and hand it over with the customer's door code.

import { useState } from 'react';
import { errorText } from '@/lib/api';
import { PLACES, product, store, type Place } from '@/lib/data';
import { km, rupee } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import type { Order } from '@/lib/orders';
import { actions, useStore, type Job } from '@/lib/state';

function startOfDayIST(now: number) {
  const offset = 5.5 * 3600_000;
  return Math.floor((now + offset) / 86_400_000) * 86_400_000 - offset;
}

const itemCount = (o: Order) => o.lines.reduce((a, l) => a + l.qty, 0);
const minutesAgo = (ts: number, now: number) => {
  const m = Math.max(0, Math.floor((now - ts) / 60_000));
  return m === 0 ? 'just now' : `${m} min ago`;
};

function Items({ o }: { o: Order }) {
  return (
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
  );
}

function Active({ o }: { o: Order }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shop = store(o.storeId);
  const toShop = o.status === 'assigned';

  const run = async (action: string, body?: unknown) => {
    setError('');
    setBusy(true);
    try {
      await actions.orderAction(o.id, action, body);
      actions.toast(action === 'pickup' ? 'Picked up. Ride safe.' : `${o.id} delivered`);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  return (
    <section className="dp-active" aria-label="Your current delivery">
      <header>
        <span className="tag">Your delivery</span>
        <b>{o.id}</b>
      </header>

      <ol className="dp-steps">
        <li className={toShop ? 'now' : 'done'}>
          <i aria-hidden>{toShop ? '1' : '✓'}</i>
          <div>
            <small>Collect from</small>
            <b>{o.storeName}</b>
            <span>{shop?.area}</span>
          </div>
        </li>
        <li className={toShop ? '' : 'now'}>
          <i aria-hidden>2</i>
          <div>
            <small>Deliver to</small>
            <b>{o.customerName}</b>
            <span>{o.address}</span>
            <span>{km(o.distKm)} from the shop</span>
          </div>
        </li>
      </ol>

      <details className="dp-items" open={toShop}>
        <summary>
          {itemCount(o)} {itemCount(o) === 1 ? 'item' : 'items'} to check at the counter
        </summary>
        <Items o={o} />
      </details>

      <p className={o.payment === 'cod' ? 'dp-pay dp-pay-cash' : 'dp-pay'}>
        {o.payment === 'cod' ? (
          <>
            Collect <b>{rupee(o.total)}</b> in cash or by UPI at the door
          </>
        ) : (
          <>Already paid online. Nothing to collect.</>
        )}
      </p>

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      {toShop ? (
        <button type="button" className="btn btn-wide btn-big" disabled={busy} onClick={() => run('pickup')}>
          <span>{busy ? 'Saving…' : 'I have picked it up'}</span>
        </button>
      ) : (
        <form
          className="dp-otp"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}$/.test(code)) return setError('Ask the customer for their 4-digit code and enter it here.');
            void run('deliver', { otp: code });
          }}
        >
          <label className="field">
            <span>Customer&apos;s 4-digit code</span>
            <input
              className="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={`code-help-${o.id}`}
            />
          </label>
          <p className="quiet small" id={`code-help-${o.id}`}>
            Ask the customer for the code for order <b>{o.id}</b>. They see it on their tracking page and in Your orders.
            Each order has its own code.{' '}
            <a className="link" href={`/orders/${o.id}`} target="_blank" rel="noreferrer">
              Testing? Open the customer&apos;s page
            </a>
          </p>
          {o.customerPhone && (
            <a className="btn btn-line" href={`tel:+91${o.customerPhone}`}>
              Call customer
            </a>
          )}
          <button type="submit" className="btn btn-wide btn-big" disabled={busy}>
            <span>{busy ? 'Checking…' : 'Complete delivery'}</span>
          </button>
        </form>
      )}
    </section>
  );
}

function JobCard({ job, now, blocked }: { job: Job; now: number; blocked: boolean }) {
  const [busy, setBusy] = useState(false);
  const shop = store(job.storeId);
  const packedAt = job.history[job.history.length - 1]?.at ?? job.updatedAt;

  const claim = async () => {
    setBusy(true);
    try {
      await actions.orderAction(job.id, 'claim');
      actions.toast(`${job.id} is yours. Head to ${job.storeName}.`);
    } catch (e) {
      actions.toast(errorText(e));
      setBusy(false);
    }
  };

  return (
    <li className="dp-job">
      <header>
        <b>{job.storeName}</b>
        <span>packed {minutesAgo(packedAt, now)}</span>
      </header>
      <p className="dp-route">
        <span>
          <small>To the shop</small>
          <b>{km(job.pickupKm)}</b>
        </span>
        <i aria-hidden>→</i>
        <span>
          <small>Shop to customer</small>
          <b>{km(job.distKm)}</b>
        </span>
        <i aria-hidden>·</i>
        <span>
          <small>Items</small>
          <b>{itemCount(job)}</b>
        </span>
      </p>
      <p className="st-meta">
        {shop?.area} to {job.address} · {job.payment === 'cod' ? `collect ${rupee(job.total)}` : 'paid online'}
      </p>
      <button type="button" className="btn btn-wide" disabled={busy || blocked} onClick={claim}>
        {busy ? 'Taking it…' : 'Take this delivery'}
      </button>
    </li>
  );
}

export default function PartnerPage() {
  const user = useStore((s) => s.user);
  const orders = useStore((s) => s.orders);
  const available = useStore((s) => s.available);
  useStore((s) => s.tick);
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  if (!user) return null;

  const active = orders.filter((o) => o.status === 'assigned' || o.status === 'picked');
  const doneToday = orders.filter((o) => o.status === 'delivered' && o.updatedAt >= startOfDayIST(now));
  const online = user.online === true;
  const listed = PLACES.some((p) => p.label === user.place?.label);

  const change = async (patch: { online?: boolean; place?: Place }, done?: string) => {
    setBusy(true);
    try {
      await actions.setPartner(patch);
      if (done) actions.toast(done);
    } catch (e) {
      actions.toast(errorText(e));
    }
    setBusy(false);
  };

  const locate = () => {
    if (!navigator.geolocation) return actions.toast('This browser cannot share its location. Pick an area instead.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void change(
          {
            place: {
              label: 'Current location',
              sub: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
          },
          'Using your current location',
        );
      },
      () => {
        setLocating(false);
        actions.toast('Location access was blocked. Pick an area instead.');
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="st-page dp">
      <section className="st-head">
        <div>
          <h1>Hello, {user.name.split(' ')[0]}</h1>
          <p>{online ? 'You are online. Packed orders near you show up below.' : 'You are offline. Go online to see deliveries near you.'}</p>
        </div>
        <button
          type="button"
          className={online ? 'st-switch on' : 'st-switch'}
          role="switch"
          aria-checked={online}
          disabled={busy || (online && active.length > 0)}
          title={online && active.length > 0 ? 'Finish your delivery before going offline' : undefined}
          onClick={() => change({ online: !online }, online ? 'You are offline' : 'You are online')}
        >
          <i aria-hidden />
          <span>{online ? 'Online' : 'Offline'}</span>
        </button>
      </section>

      <div className="dp-area">
        <label>
          <span>Your area</span>
          <select
            value={listed ? user.place?.label : 'here'}
            disabled={busy}
            onChange={(e) => {
              const place = PLACES.find((p) => p.label === e.target.value);
              if (place) void change({ place }, `Area set to ${place.label}`);
            }}
          >
            {!listed && <option value="here">{user.place?.label ?? 'Choose an area'}</option>}
            {PLACES.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-small btn-line" onClick={locate} disabled={busy || locating}>
          {locating ? 'Finding you…' : 'Use my location'}
        </button>
      </div>

      {active.map((o) => (
        <Active key={o.id} o={o} />
      ))}

      {online && (
        <section className="dp-jobs">
          <h2>
            Deliveries near you <span>{available.length}</span>
          </h2>
          {available.length === 0 ? (
            <p className="st-none st-none-box">
              Nothing is waiting within 6 km right now. This list fills in by itself the moment a shop finishes packing.
            </p>
          ) : (
            <ul>
              {available.map((j) => (
                <JobCard key={j.id} job={j} now={now} blocked={active.length > 0} />
              ))}
            </ul>
          )}
          {active.length > 0 && available.length > 0 && <p className="quiet small">Finish your current delivery to take another.</p>}
        </section>
      )}

      <section className="st-done">
        <h2>Delivered today</h2>
        {doneToday.length === 0 ? (
          <p className="quiet">Your finished deliveries from today are listed here.</p>
        ) : (
          <ul>
            {doneToday.map((o) => (
              <li key={o.id}>
                <b>{o.id}</b>
                <span>{o.storeName}</span>
                <span>{km(o.distKm)}</span>
                <em className="ok">Delivered</em>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
