'use client';

import { useEffect, useMemo, useState } from 'react';
import { availability, istHour, shopsNear } from './nearby';
import { planOrder } from './select';
import { useStore } from './state';

/** Re-renders every `ms` milliseconds and returns the current time. */
export function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Shops measured from the chosen location. Refreshes each minute, and whenever the catalogue changes. */
export function useNear() {
  const place = useStore((s) => s.place);
  const tick = useStore((s) => s.tick);
  const now = useNow(60_000);
  const hour = istHour(new Date(now));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => shopsNear(place.lat, place.lng, new Date(now)), [place, hour, tick]);
}

export function useAvailability(pid: string) {
  const near = useNear();
  return useMemo(() => availability(pid, near), [pid, near]);
}

export function usePlan() {
  const cart = useStore((s) => s.cart);
  const mode = useStore((s) => s.mode);
  const near = useNear();
  return useMemo(() => planOrder(cart, near, mode), [cart, near, mode]);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}
