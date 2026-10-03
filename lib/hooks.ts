'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from './api';
import { availability, istHour, shopsNear } from './nearby';
import type { Period } from './reports';
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

/**
 * A report from the server (a shop's sales, a partner's earnings) for one period. It is asked
 * for again whenever this user's orders change, so it stays live like the rest of the page.
 */
export function useReport<T extends { period: Period }>(path: string, period: Period) {
  const version = useStore((s) => s.orders.map((o) => o.id + o.status).join());
  const [report, setReport] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let dead = false;
    api<T>('GET', `${path}?period=${period}`).then(
      (r) => {
        if (dead) return;
        setReport(r);
        setError('');
      },
      (e) => {
        if (!dead) setError(errorText(e));
      },
    );
    return () => {
      dead = true;
    };
  }, [path, period, version]);
  return { report, error };
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
