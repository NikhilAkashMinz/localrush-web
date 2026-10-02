'use client';

// A small street map built for LocalRush: OpenStreetMap tiles underneath, with our own
// markers, 5 km ring and popup on top. No map library; the maths is in lib/mapmath.ts.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_COLOR, KIND_LABEL, type Place, type StoreKind } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import { RADIUS_KM } from '@/lib/geo';
import { metresPerPixel, project, tilesFor, unproject } from '@/lib/mapmath';
import type { Near } from '@/lib/nearby';
import { MinusIcon, PlusIcon, TargetIcon } from './Icons';

export const KIND_EMOJI: Record<StoreKind, string> = {
  kirana: '🛒',
  supermarket: '🏬',
  fresh: '🥕',
  pharmacy: '💊',
  stationery: '📓',
  electronics: '🔌',
  bakery: '🥐',
};

const MIN_ZOOM = 11;
const MAX_ZOOM = 17;
const START_ZOOM = 13;
// Road distance is about 1.3 times the straight line, so 5 km by road is this far on a map.
const RING_METRES = (RADIUS_KM / 1.3) * 1000;

export function shopStatus(n: Near) {
  if (!n.inRange) return `${km(n.distKm)} away, outside your 5 km`;
  if (!n.open) return `Closed, opens at ${hourLabel(n.store.open[0])}`;
  return `${km(n.distKm)} away, about ${mins(n.etaMin)}`;
}

type Props = {
  place: Place;
  shops: Near[];
  selected: string | null;
  hovered: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
};

export default function ShopMap({ place, shops, selected, hovered, onSelect, onHover }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(START_ZOOM);
  const [centre, setCentre] = useState({ lat: place.lat, lng: place.lng });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: number } | null>(null);

  // Keep track of the map's size on screen.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new delivery location recentres the map on it.
  useEffect(() => {
    setCentre({ lat: place.lat, lng: place.lng });
    setZoom(START_ZOOM);
  }, [place.lat, place.lng]);

  const mid = project(centre.lat, centre.lng, zoom);
  const left = mid.x - size.w / 2;
  const top = mid.y - size.h / 2;
  const at = (lat: number, lng: number) => {
    const p = project(lat, lng, zoom);
    return { x: p.x - left, y: p.y - top };
  };

  // When a shop is picked, or the zoom changes, keep it in view with room for its popup above.
  useEffect(() => {
    if (!selected || !size.w) return;
    const n = shops.find((s) => s.store.id === selected);
    if (!n) return;
    const p = project(n.store.lat, n.store.lng, zoom);
    const x = p.x - left;
    const y = p.y - top;
    const comfortable = x > 90 && x < size.w - 90 && y > 190 && y < size.h - 30;
    if (!comfortable) setCentre(unproject(p.x, p.y - size.h * 0.12, zoom));
    // Only react to a new selection or zoom level, not to every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, zoom]);

  const tiles = useMemo(
    () => (size.w ? tilesFor(left, top, size.w, size.h, zoom) : []),
    [left, top, size.w, size.h, zoom],
  );

  const you = at(place.lat, place.lng);
  const ring = (RING_METRES / metresPerPixel(place.lat, zoom)) * 2;
  const picked = shops.find((s) => s.store.id === selected);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: mid.x, cy: mid.y, moved: 0 };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    setCentre(unproject(d.cx - dx, d.cy - dy, zoom));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved < 5) onSelect(null);
  };

  const zoomBy = (step: number) => setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + step)));

  return (
    <div
      className="sm-map"
      ref={box}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="application"
      aria-label={`Map of shops near ${place.label}. Drag to move it.`}
    >
      <div className="sm-tiles" aria-hidden>
        {tiles.map((t) => (
          // Plain <img>: these are map tiles, positioned by hand, not content images.
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
      <div className="sm-tint" aria-hidden />

      <div className="sm-ring" style={{ left: you.x, top: you.y, width: ring, height: ring }} aria-hidden />

      <div className="sm-you" style={{ left: you.x, top: you.y }}>
        <span>You</span>
        <i />
      </div>

      {shops.map((n) => {
        const p = at(n.store.lat, n.store.lng);
        if (p.x < -40 || p.y < -40 || p.x > size.w + 40 || p.y > size.h + 60) return null;
        const id = n.store.id;
        const state = !n.inRange ? 'far' : n.open ? 'open' : 'closed';
        const active = id === selected || id === hovered;
        return (
          <button
            key={id}
            type="button"
            className={`sm-pin sm-${state} ${active ? 'on' : ''}`}
            style={{ left: p.x, top: p.y, ['--pin' as string]: KIND_COLOR[n.store.kind] }}
            onClick={() => onSelect(id === selected ? null : id)}
            onPointerEnter={() => onHover(id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(id)}
            onBlur={() => onHover(null)}
            aria-label={`${n.store.name}, ${KIND_LABEL[n.store.kind]}. ${shopStatus(n)}`}
            aria-pressed={id === selected}
          >
            <span aria-hidden>{KIND_EMOJI[n.store.kind]}</span>
          </button>
        );
      })}

      {picked &&
        (() => {
          const p = at(picked.store.lat, picked.store.lng);
          return (
            <div className="sm-pop" style={{ left: p.x, top: p.y }}>
              <b>{picked.store.name}</b>
              <span>{KIND_LABEL[picked.store.kind]}</span>
              <span>{shopStatus(picked)}</span>
              <Link href={`/store/${picked.store.id}`} className="btn btn-small">
                Open shop
              </Link>
            </div>
          );
        })()}

      <div className="sm-tools">
        <button type="button" onClick={() => zoomBy(1)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
          <PlusIcon width={18} height={18} />
        </button>
        <button type="button" onClick={() => zoomBy(-1)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
          <MinusIcon width={18} height={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            setCentre({ lat: place.lat, lng: place.lng });
            setZoom(START_ZOOM);
          }}
          aria-label="Back to your location"
        >
          <TargetIcon width={18} height={18} />
        </button>
      </div>

      <p className="sm-key">
        <i /> 5 km by road from you
      </p>
      <a className="sm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
