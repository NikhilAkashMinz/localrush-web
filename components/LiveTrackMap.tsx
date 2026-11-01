'use client';

// The live map on the order tracking page: real streets (OpenStreetMap tiles, as on the Shops
// page), the shop, the customer's address and, once a delivery partner has the order, where they
// are. While they deliver, the LocalRush Partner app sends the phone's GPS position every few
// seconds, and the live connection brings each one to this page within about a second. The
// scooter glides from one position to the next, the way the partner has come is drawn behind it,
// and the distance and arrival time follow it. No map library: the maths is in lib/mapmath.ts.

import { useEffect, useMemo, useRef, useState } from 'react';
import { km } from '@/lib/format';
import { crow, roadKm } from '@/lib/geo';
import { project, tilesFor, unproject } from '@/lib/mapmath';
import type { Order } from '@/lib/orders';
import { MinusIcon, PlusIcon, TargetIcon } from './Icons';
import './livemap.css';

type LatLng = { lat: number; lng: number };

/** A GPS position counts as live for this long after the partner's phone sent it. */
export const LIVE_MS = 60_000;
/** Closer than this to the customer's door (by road) counts as arriving now. */
export const ARRIVING_KM = 0.15;
/** Minutes per km for the arrival estimate: about 20 km/h through city streets, as elsewhere on the site. */
const MIN_PER_KM = 3;
const MIN_ZOOM = 12;
const MAX_ZOOM = 18;
/** Room kept around the shop, the address and the partner when the map fits them in. */
const PAD = 60;

const rad = (d: number) => (d * Math.PI) / 180;

/** Compass direction from a to b, in degrees clockwise from north. */
function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** "just now", "12 s ago", "3 min ago" */
function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
}

/**
 * What the partner's live position says about the delivery: how far there is still to go, and
 * about how many minutes that takes. Null when their phone is not sharing GPS.
 */
export function liveEta(order: Pick<Order, 'status' | 'lat' | 'lng' | 'rider'>, shop: LatLng | undefined | null) {
  const r = order.rider;
  if (!r || !shop || (order.status !== 'assigned' && order.status !== 'picked')) return null;
  const toShop = order.status === 'assigned' ? roadKm(r.lat, r.lng, shop.lat, shop.lng) : 0;
  const toYou = order.status === 'assigned' ? roadKm(shop.lat, shop.lng, order.lat, order.lng) : roadKm(r.lat, r.lng, order.lat, order.lng);
  return { toShop, toYou, left: toShop + toYou, minutes: Math.max(1, Math.ceil((toShop + toYou) * MIN_PER_KM)) };
}

/** Glide a marker from where it is shown to each new position, instead of jumping there. */
function useGlide(target: LatLng | null, fixAt: number | undefined): LatLng | null {
  const [shown, setShown] = useState<LatLng | null>(target);
  const current = useRef(shown);
  current.current = shown;
  const lastFix = useRef(fixAt);

  useEffect(() => {
    if (!target) {
      setShown(null);
      return;
    }
    const from = current.current;
    // The first position, or a jump of more than a km (a new delivery, a stale position): no glide.
    if (!from || crow(from.lat, from.lng, target.lat, target.lng) > 1) {
      setShown(target);
      lastFix.current = fixAt;
      return;
    }
    if (from.lat === target.lat && from.lng === target.lng) return;
    // Take about as long as the phone took between positions, so the scooter keeps moving.
    const gap = fixAt !== undefined && lastFix.current !== undefined ? fixAt - lastFix.current : 1500;
    lastFix.current = fixAt;
    const duration = Math.max(600, Math.min(4000, gap));
    const start = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      setShown({ lat: from.lat + (target.lat - from.lat) * k, lng: from.lng + (target.lng - from.lng) * k });
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // A new position is what starts a glide; the time it was taken comes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng]);

  return shown;
}

/** The zoom and centre that fit all these points on a map this size. */
function fit(points: LatLng[], w: number, h: number) {
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    const px = points.map((p) => project(p.lat, p.lng, zoom));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (zoom === MIN_ZOOM || (maxX - minX <= w - 2 * PAD && maxY - minY <= h - 2 * PAD - 40)) {
      // A little below the middle, so the card at the bottom covers less of the route.
      return { ...unproject((minX + maxX) / 2, (minY + maxY) / 2 + 20, zoom), zoom };
    }
  }
  return { ...points[0], zoom: MIN_ZOOM };
}

type Props = {
  order: Pick<Order, 'id' | 'status' | 'lat' | 'lng' | 'partnerName' | 'rider' | 'address'>;
  shop: { lat: number; lng: number; name: string; emoji: string; color: string } | null;
  /** Where the partner probably is when their phone is not sharing GPS, worked out from the time. */
  estimate: LatLng | null;
  now: number;
};

export default function LiveTrackMap({ order, shop, estimate, now }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** Where the person has moved the map to, or null to keep everything in view by itself. */
  const [manual, setManual] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const riding = order.status === 'assigned' || order.status === 'picked';
  const gps = riding && order.rider ? order.rider : null;
  const live = !!gps && now - gps.at < LIVE_MS;
  const target = gps ? { lat: gps.lat, lng: gps.lng } : riding ? estimate : null;
  const rider = useGlide(target, gps?.at);
  const home = { lat: order.lat, lng: order.lng };

  // The way the partner has come, up to the position the scooter is gliding to (the newest point
  // of the trail is that position itself: until the scooter is there, the line stops at it).
  const trail = gps?.trail ?? [];
  const newest = trail[trail.length - 1];
  const past = newest && target && crow(newest.lat, newest.lng, target.lat, target.lng) < 0.003 ? trail.slice(0, -1) : trail;
  // Which way the partner is heading: from the last position a few metres before the newest one.
  const back = gps && target ? [...past].reverse().find((t) => crow(t.lat, t.lng, target.lat, target.lng) > 0.008) : undefined;
  const heading = back && target ? bearing(back, target) : null;

  const points = [home, ...(shop ? [shop] : []), ...(rider ? [rider] : [])];
  const view = manual ?? (size.w ? fit(points, size.w, size.h) : { ...home, zoom: 15 });
  const mid = project(view.lat, view.lng, view.zoom);
  const left = mid.x - size.w / 2;
  const top = mid.y - size.h / 2;
  const at = (p: LatLng) => {
    const q = project(p.lat, p.lng, view.zoom);
    return { x: q.x - left, y: q.y - top };
  };
  const tiles = useMemo(
    () => (size.w ? tilesFor(left, top, size.w, size.h, view.zoom) : []),
    [left, top, size.w, size.h, view.zoom],
  );

  // The way still to go (dashed) and the way the partner has come (solid).
  const ahead = !riding
    ? shop
      ? [shop, home]
      : []
    : order.status === 'assigned' && shop
      ? [...(rider ? [rider] : []), shop, home]
      : [...(rider ? [rider] : shop ? [shop] : []), home];
  const behind = gps && rider ? [...past, rider] : [];
  const line = (pts: LatLng[]) =>
    pts
      .map((p) => at(p))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');

  const eta = liveEta(order, shop);
  const name = order.partnerName ?? 'Your delivery partner';
  const shopPx = shop ? at(shop) : null;
  const homePx = at(home);
  const riderPx = rider ? at(rider) : null;
  // When the scooter is at the door it covers the "You" label, so the label makes way.
  const atDoor = !!riderPx && Math.hypot(riderPx.x - homePx.x, riderPx.y - homePx.y) < 44;

  let info: React.ReactNode;
  if (gps && eta) {
    info = (
      <>
        <p>
          <span className={live ? 'lm-badge' : 'lm-badge lm-badge-off'}>
            <i aria-hidden /> {live ? 'LIVE' : 'LAST SEEN'}
          </span>{' '}
          {order.status === 'assigned' ? (
            <>
              <b>{name}</b> is on the way to {shop?.name ?? 'the shop'}, {km(eta.toShop)} from it
            </>
          ) : (
            <>
              <b>{name}</b> is {km(eta.toYou)} from you
            </>
          )}
        </p>
        <small aria-live="polite">
          {order.status === 'picked' ? (eta.toYou < ARRIVING_KM ? 'Arriving now' : `About ${eta.minutes} min away`) : `About ${eta.minutes} min until your door`}
          {' · '}GPS {ago(gps.at, now)}
        </small>
      </>
    );
  } else if (riding) {
    info = (
      <>
        <p>
          <b>{name}</b> {order.status === 'assigned' ? 'is on the way to the shop' : 'is bringing your order'}
        </p>
        <small>
          {order.status === 'picked'
            ? 'The scooter is an estimate: the partner’s phone is not sharing GPS right now.'
            : 'Their live position appears here when their phone shares GPS.'}
        </small>
      </>
    );
  } else {
    info = (
      <>
        <p>
          <b>{order.status === 'delivered' ? 'Delivered' : 'Your order is at the shop'}</b>
        </p>
        <small>
          {order.status === 'delivered'
            ? 'Thank you for ordering from a shop near you.'
            : 'Once a delivery partner takes it, you can follow them here, live.'}
        </small>
      </>
    );
  }

  const zoomBy = (step: number) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + step));
    setManual({ lat: view.lat, lng: view.lng, zoom: z });
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: mid.x, cy: mid.y, zoom: view.zoom };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    setManual({ ...unproject(d.cx - dx, d.cy - dy, d.zoom), zoom: d.zoom });
  };
  const onUp = () => {
    drag.current = null;
  };

  const summary = gps && eta
    ? `${name} is ${order.status === 'assigned' ? `${km(eta.toShop)} from the shop` : `${km(eta.toYou)} from you`}, from their phone's GPS ${ago(gps.at, now)}.`
    : riding
      ? `${name} is ${order.status === 'assigned' ? 'on the way to the shop' : 'bringing your order'}.`
      : 'The shop and your address.';

  return (
    <div
      className="lm-map"
      ref={box}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="group"
      aria-label={`Live map of order ${order.id}. ${summary}`}
      data-live={live ? 'yes' : 'no'}
    >
      <div className="lm-tiles" aria-hidden>
        {tiles.map((t) => (
          // Plain <img>: map tiles positioned by hand, not content images.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`}
            alt=""
            draggable={false}
            style={{ left: Math.round(t.left), top: Math.round(t.top) }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ))}
      </div>
      <div className="lm-tint" aria-hidden />

      <svg className="lm-lines" width={size.w} height={size.h} aria-hidden>
        {ahead.length > 1 && <polyline className="lm-ahead" points={line(ahead)} />}
        {behind.length > 1 && <polyline className="lm-behind" points={line(behind)} />}
      </svg>

      {shop && shopPx && (
        <div className="lm-shop" style={{ left: shopPx.x, top: shopPx.y, ['--pin' as string]: shop.color }} title={shop.name}>
          <span aria-hidden>{shop.emoji}</span>
        </div>
      )}
      <div className={atDoor ? 'lm-home lm-home-near' : 'lm-home'} style={{ left: homePx.x, top: homePx.y }}>
        <span>You</span>
        <i />
      </div>
      {rider && riderPx && (
        <div
          className={`lm-rider${live ? ' lm-live' : ''}${gps ? '' : ' lm-guess'}`}
          style={{ left: riderPx.x, top: riderPx.y }}
          data-lat={target?.lat}
          data-lng={target?.lng}
          title={gps ? `${name}, from their phone's GPS` : `${name}, estimated`}
        >
          {heading !== null && <i className="lm-heading" style={{ transform: `rotate(${heading}deg)` }} aria-hidden />}
          <span aria-hidden>🛵</span>
        </div>
      )}

      <div className="lm-tools">
        <button type="button" onClick={() => zoomBy(1)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">
          <PlusIcon width={18} height={18} />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">
          <MinusIcon width={18} height={18} />
        </button>
        <button type="button" onClick={() => setManual(null)} aria-label="Show the whole delivery" aria-pressed={!manual}>
          <TargetIcon width={18} height={18} />
        </button>
      </div>

      <div className="lm-info">{info}</div>
      <a className="lm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
