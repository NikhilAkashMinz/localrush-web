'use client';

// Google's real 3D map of where the customer is, with LocalRush's shops and the other real
// shops nearby as pins. Tapping a pin flies the camera to it and shows what it is. If Google
// cannot show the map (no WebGL, a refused key, no connection) the page falls back to the
// site's own 3D scene through onFail.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { KIND_COLOR, KIND_LABEL, type Place } from '@/lib/data';
import { km } from '@/lib/format';
import { loadGoogleMaps, onGoogleAuthFailure } from '@/lib/google';
import type { RealShop } from '@/lib/realshops';
import type { Near } from '@/lib/nearby';
import { actions } from '@/lib/state';
import { CloseIcon } from './Icons';
import { KIND_EMOJI, shopStatus } from './ShopMap';

/** Which pin is picked: one of LocalRush's shops, or a shop from Google Maps. */
export type Pick = { kind: 'localrush' | 'google'; id: string };

type Props = {
  place: Place;
  /** LocalRush shops measured from the place. */
  near: Near[];
  real: RealShop[];
  picked: Pick | null;
  onPick: (pick: Pick | null) => void;
  onFail: (message: string) => void;
};

// The camera: high enough to see the shops around you, tilted to show the buildings.
const RANGE_M = 2200;
const TILT = 60;
const CLOSE_RANGE_M = 650;
/** LocalRush shops further than this are not drawn at all. */
const SHOW_KM = 9;

type Camera = { center: { lat: number; lng: number; altitude: number }; range: number; tilt: number; heading: number };
type Map3D = HTMLElement & {
  heading?: number;
  flyCameraTo(options: { endCamera: Camera; durationMillis?: number }): void;
  stopCameraAnimation?(): void;
};
type Maps3dLibrary = {
  Map3DElement: new (options: Record<string, unknown>) => Map3D;
  Marker3DElement: new (options: Record<string, unknown>) => HTMLElement;
  Marker3DInteractiveElement: new (options: Record<string, unknown>) => HTMLElement;
  MapMode?: { HYBRID: unknown };
  AltitudeMode?: { RELATIVE_TO_GROUND: unknown };
  GestureHandling?: { COOPERATIVE: unknown };
};
type Pin = HTMLElement | { element: HTMLElement };
type MarkerLibrary = { PinElement: new (options: Record<string, unknown>) => Pin };
type Libraries = { maps3d: Maps3dLibrary; marker: MarkerLibrary };

const camera = (lat: number, lng: number, range: number, heading = 0): Camera => ({
  center: { lat, lng, altitude: 0 },
  range,
  tilt: TILT,
  heading,
});

/** A coloured map pin. Older versions of the API call the text "glyph", newer ones "glyphText". */
function pin(lib: MarkerLibrary, options: { background: string; border: string; text: string; textColor: string; scale: number }) {
  const base = { background: options.background, borderColor: options.border, glyphColor: options.textColor, scale: options.scale };
  let made: Pin;
  try {
    made = new lib.PinElement({ ...base, glyphText: options.text });
  } catch {
    made = new lib.PinElement({ ...base, glyph: options.text });
  }
  return made instanceof HTMLElement ? made : made.element;
}

export default function RealMap({ place, near, real, picked, onPick, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Map3D | null>(null);
  const libs = useRef<Libraries | null>(null);
  const markers = useRef<HTMLElement[]>([]);
  const [ready, setReady] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;
  const fail = useRef(onFail);
  fail.current = onFail;
  const start = useRef(place);

  // Make the map once. The camera moves with the place below; markers are redrawn when shops change.
  useEffect(() => {
    let dead = false;
    let made: Map3D | null = null;
    const stopAuth = onGoogleAuthFailure((message) => fail.current(message));
    (async () => {
      try {
        const google = await loadGoogleMaps();
        const [maps3d, marker] = await Promise.all([google.maps.importLibrary('maps3d'), google.maps.importLibrary('marker')]);
        if (dead || !host.current) return;
        const lib = { maps3d: maps3d as unknown as Maps3dLibrary, marker: marker as unknown as MarkerLibrary };
        const at = start.current;
        made = new lib.maps3d.Map3DElement({
          ...camera(at.lat, at.lng, RANGE_M),
          mode: lib.maps3d.MapMode?.HYBRID ?? 'HYBRID',
          // The page still scrolls over the map; zooming needs Ctrl or two fingers.
          gestureHandling: lib.maps3d.GestureHandling?.COOPERATIVE ?? 'COOPERATIVE',
        });
        made.addEventListener('gmp-error', () => fail.current('Google could not show the 3D map in this browser.'));
        host.current.append(made);
        libs.current = lib;
        map.current = made;
        setReady(true);
      } catch (e) {
        if (!dead) fail.current(e instanceof Error ? e.message : 'Google Maps could not be loaded.');
      }
    })();
    return () => {
      dead = true;
      stopAuth();
      made?.remove();
      map.current = null;
      markers.current = [];
    };
  }, []);

  // A new location: fly there.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.flyCameraTo({ endCamera: camera(place.lat, place.lng, RANGE_M), durationMillis: 1800 });
  }, [ready, place.lat, place.lng]);

  // Draw the pins: you, LocalRush's shops, and the other shops on Google Maps.
  useEffect(() => {
    const m = map.current;
    const lib = libs.current;
    if (!ready || !m || !lib) return;
    markers.current.forEach((x) => x.remove());
    const made: HTMLElement[] = [];
    const add = (marker: HTMLElement) => {
      m.append(marker);
      made.push(marker);
    };
    const altitudeMode = lib.maps3d.AltitudeMode?.RELATIVE_TO_GROUND ?? 'RELATIVE_TO_GROUND';
    // Pins stand on a short stalk above the ground, and stay visible behind buildings.
    const stand = (lat: number, lng: number, height: number) => ({
      position: { lat, lng, altitude: height },
      altitudeMode,
      extruded: true,
      drawsWhenOccluded: true,
    });

    try {
      const you = new lib.maps3d.Marker3DElement({ ...stand(place.lat, place.lng, 40), label: 'You', zIndex: 3 });
      you.append(pin(lib.marker, { background: '#ffb627', border: '#17142b', text: '★', textColor: '#17142b', scale: 1.3 }));
      add(you);

      for (const n of near) {
        if (n.distKm > SHOW_KM) continue;
        const usable = n.inRange && n.open;
        const marker = new lib.maps3d.Marker3DInteractiveElement({
          ...stand(n.store.lat, n.store.lng, 30),
          label: n.store.name,
          title: `${n.store.name}, LocalRush`,
          zIndex: 2,
        });
        marker.append(
          pin(lib.marker, {
            background: usable ? KIND_COLOR[n.store.kind] : '#9aa1ad',
            border: '#ffffff',
            text: KIND_EMOJI[n.store.kind],
            textColor: '#ffffff',
            scale: 1.15,
          }),
        );
        marker.addEventListener('gmp-click', () => pick.current({ kind: 'localrush', id: n.store.id }));
        add(marker);
      }

      for (const s of real) {
        const marker = new lib.maps3d.Marker3DInteractiveElement({ ...stand(s.lat, s.lng, 20), title: s.name, zIndex: 1 });
        marker.append(
          pin(lib.marker, {
            background: '#ffffff',
            border: s.kind ? KIND_COLOR[s.kind] : '#5f5c73',
            text: s.kind ? KIND_EMOJI[s.kind] : '🏪',
            textColor: '#17142b',
            scale: 0.9,
          }),
        );
        marker.addEventListener('gmp-click', () => pick.current({ kind: 'google', id: s.id }));
        add(marker);
      }
    } catch (e) {
      // The map still works without some pins; say so in the console for whoever is developing.
      console.warn('[localrush] Some map pins could not be drawn', e);
    }
    markers.current = made;
  }, [ready, place.lat, place.lng, near, real]);

  const lr = picked?.kind === 'localrush' ? near.find((n) => n.store.id === picked.id) : undefined;
  const g = picked?.kind === 'google' ? real.find((s) => s.id === picked.id) : undefined;

  // A picked shop: fly close to it. Letting go of it flies back out.
  const target = lr ? { lat: lr.store.lat, lng: lr.store.lng } : g ? { lat: g.lat, lng: g.lng } : null;
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const heading = typeof m.heading === 'number' ? m.heading : 0;
    if (target) m.flyCameraTo({ endCamera: camera(target.lat, target.lng, CLOSE_RANGE_M, heading), durationMillis: 1200 });
    else m.flyCameraTo({ endCamera: camera(place.lat, place.lng, RANGE_M, heading), durationMillis: 1200 });
    // Only a change of pick should move the camera here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, target?.lat, target?.lng]);

  return (
    <div className="rm">
      <div className="rm-host" ref={host} aria-label={`3D map of the shops around ${place.label}`} role="region" />
      {!ready && <p className="rm-wait">Loading the 3D map of {place.label}…</p>}

      <div className="rm-legend">
        <span>
          <i className="rm-dot rm-dot-lr" /> LocalRush shop
        </span>
        <span>
          <i className="rm-dot rm-dot-g" /> On Google Maps
        </span>
        <button type="button" onClick={() => actions.open('place')}>
          Change location
        </button>
      </div>

      {(lr || g) && (
        <div className="rm-card" role="dialog" aria-label={lr ? lr.store.name : g!.name}>
          <button type="button" className="rm-close" onClick={() => pick.current(null)} aria-label="Close">
            <CloseIcon width={16} height={16} />
          </button>
          {lr ? (
            <>
              <small className="rm-tag">LocalRush shop</small>
              <b>{lr.store.name}</b>
              <span>
                {KIND_LABEL[lr.store.kind]} in {lr.store.area}
              </span>
              <span>{shopStatus(lr)}</span>
              <Link href={`/store/${lr.store.id}`} className="btn btn-small">
                Open shop
              </Link>
            </>
          ) : (
            <>
              <small className="rm-tag rm-tag-g">On Google Maps</small>
              <b>{g!.name}</b>
              <span>
                {g!.typeLabel}, about {km(g!.distKm)} away
              </span>
              {g!.address && <span>{g!.address}</span>}
              <span className="rm-note">Not on LocalRush yet, so it cannot deliver to you here.</span>
              <a href={g!.url} target="_blank" rel="noreferrer" className="btn btn-small btn-line">
                Open in Google Maps
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
