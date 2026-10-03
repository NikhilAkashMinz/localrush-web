'use client';

// React wrappers around the three.js scenes. Each scene is loaded only in the browser,
// after the page is on screen, so three.js never slows down the first paint.

import { useEffect, useRef, useState } from 'react';
import { KIND_COLOR, KIND_LABEL, type Product } from '@/lib/data';
import { hourLabel, km, mins } from '@/lib/format';
import type { Near } from '@/lib/nearby';
import type { PackScene } from '@/scenes/pack';
import type { RadiusScene } from '@/scenes/radius';
import type { TrackScene } from '@/scenes/track';

function Fallback({ text }: { text: string }) {
  return <p className="scene-fallback">{text}</p>;
}

type RadiusProps = {
  near: Near[];
  seed: number;
  highlight: string | null;
  onSelect: (id: string) => void;
};

export function RadiusMap({ near, seed, highlight, onSelect }: RadiusProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const scene = useRef<RadiusScene | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [hovered, setHovered] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let dead = false;
    let made: RadiusScene | null = null;
    import('@/scenes/radius').then((m) => {
      if (dead || !canvas.current || !label.current) return;
      made = m.createRadiusScene(canvas.current, label.current, {
        onHover: setHovered,
        onSelect: (id) => select.current(id),
      });
      if (!made) return setFailed(true);
      scene.current = made;
      setLoaded(true);
    });
    return () => {
      dead = true;
      made?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    scene.current?.setShops(
      near.map((n) => ({
        id: n.store.id,
        color: KIND_COLOR[n.store.kind],
        x: n.x,
        z: n.z,
        usable: n.inRange && n.open,
        inRange: n.inRange,
      })),
      seed,
    );
  }, [near, seed, loaded]);

  useEffect(() => {
    scene.current?.highlight(highlight);
  }, [highlight, loaded]);

  const shown = near.find((n) => n.store.id === (hovered ?? highlight));

  return (
    <div className="scene scene-radius">
      <canvas ref={canvas} aria-label="3D map of the shops within 5 km of you" role="img" />
      <div className="scene-label" ref={label} data-show="false">
        {shown && (
          <div className="scene-tip">
            <b>{shown.store.name}</b>
            <span>{KIND_LABEL[shown.store.kind]}</span>
            <span>
              {!shown.inRange
                ? `${km(shown.distKm)} away, outside your 5 km`
                : !shown.open
                  ? shown.store.paused
                    ? 'Not taking orders right now'
                    : `Closed, opens at ${hourLabel(shown.store.open[0])}`
                  : `${km(shown.distKm)} away, about ${mins(shown.etaMin)}`}
            </span>
          </div>
        )}
      </div>
      {failed && <Fallback text="The 3D map needs WebGL, which this browser has switched off. The shop list below shows the same shops." />}
    </div>
  );
}

export function PackViewer({ p }: { p: Product }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<PackScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let dead = false;
    let made: PackScene | null = null;
    import('@/scenes/pack').then((m) => {
      if (dead || !canvas.current) return;
      made = m.createPackScene(canvas.current);
      if (!made) return setFailed(true);
      scene.current = made;
      setLoaded(true);
    });
    return () => {
      dead = true;
      made?.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Wait for the web fonts so the label is drawn in the site's typeface.
    let dead = false;
    const draw = () => {
      if (!dead) scene.current?.set({ id: p.id, name: p.name, unit: p.unit, emoji: p.emoji, shape: p.shape, color: p.color });
    };
    if (document.fonts?.ready) document.fonts.ready.then(draw);
    else draw();
    return () => {
      dead = true;
    };
  }, [p, loaded]);

  return (
    <div className="scene scene-pack">
      <canvas ref={canvas} aria-label={`3D view of ${p.name}. Drag to turn it.`} role="img" />
      {!loaded && !failed && <span className="scene-emoji">{p.emoji}</span>}
      {failed && <span className="scene-emoji">{p.emoji}</span>}
      {loaded && <span className="scene-hint">Drag to turn</span>}
    </div>
  );
}

type TrackProps = { rider: number; stage: number; done: boolean; shopEmoji: string; shopColor: string };

export function TrackMap({ rider, stage, done, shopEmoji, shopColor }: TrackProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TrackScene | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let dead = false;
    let made: TrackScene | null = null;
    import('@/scenes/track').then((m) => {
      if (dead || !canvas.current) return;
      made = m.createTrackScene(canvas.current, { shopEmoji, shopColor });
      if (!made) return setFailed(true);
      scene.current = made;
      setLoaded(true);
    });
    return () => {
      dead = true;
      made?.dispose();
      scene.current = null;
    };
  }, [shopEmoji, shopColor]);

  useEffect(() => {
    scene.current?.set(rider, stage, done);
  }, [rider, stage, done, loaded]);

  return (
    <div className="scene scene-track">
      <canvas ref={canvas} aria-label="3D map showing your delivery partner on the way" role="img" />
      {failed && <Fallback text="The live map needs WebGL, which this browser has switched off. The steps below still update." />}
    </div>
  );
}
