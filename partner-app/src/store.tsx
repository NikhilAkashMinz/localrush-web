// Everything the app knows, in one place: who is logged in, their deliveries, the jobs near them,
// the phone's GPS, and the server's address. Screens read it with useApp().
//
// While the app is open it keeps a live connection to the server (src/live.ts), the same one the
// website uses: the moment a shop marks an order packed, the server says so and the app reads the
// jobs at once. A job it has not seen before makes the phone buzz and shows a banner at the top of
// the screen. It also checks by itself now and then, in case the live connection is down.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';
import { ApiError, createApi, errorText, type Api } from './api';
import { cleanServer, detectedServer } from './config';
import { km, plural, rupee } from './format';
import { crow } from './geo';
import { openLive } from './live';
import { ensurePermission, follow, type Fix } from './location';
import { payOf } from './pay';
import { GPS_LABEL } from './places';
import type { Job, Me, Order, Place, Shop } from './types';

const KEY = { server: 'lr.server', token: 'lr.token', user: 'lr.user', gps: 'lr.gps' } as const;

/** How often to look for new jobs while the live connection is down... */
const POLL_MS = 4000;
/** ...and while it is up, only as a safety net: changes then arrive the moment they happen. */
const POLL_LIVE_MS = 30_000;
/** How often to re-read the partner's own account, in case it changed on the website. */
const ME_EVERY_MS = 30_000;
/** While waiting for jobs: send a new GPS position after moving this far, or this long after the last one, but never more often than the gap. */
const WAITING = { afterM: 60, everyMs: 60_000, gapMs: 10_000 };
/** While delivering: much more often, so the customer's live map follows the partner closely. */
const DELIVERING = { afterM: 15, everyMs: 15_000, gapMs: 3000 };
/** The buzz for a new job: two pulses. */
const BUZZ = [0, 400, 180, 400];

export type Banner = { id: number; tone: 'new' | 'good' | 'bad' | 'info'; title: string; body?: string };

/** off: not in use. starting: asking for permission or a first position. */
export type GpsStatus = 'off' | 'starting' | 'on' | 'denied' | 'disabled' | 'error';

type State = {
  /** False until the saved login and settings have been read. */
  ready: boolean;
  server: string;
  /** True when the address was typed in by the partner; false when it was worked out from Expo. */
  serverSaved: boolean;
  token: string | null;
  user: Me | null;
  orders: Order[];
  jobs: Job[];
  shops: Record<string, Shop>;
  /** Whether the last request to the server worked; null before the first one. */
  reachable: boolean | null;
  problem: string | null;
  syncedAt: number | null;
  /** Whether the live connection is up, so new jobs and changes arrive the moment they happen. */
  live: boolean;
  banner: Banner | null;
  /** The partner wants the phone's GPS used, rather than an area picked from the list. */
  gpsWanted: boolean;
  gps: GpsStatus;
  fix: Fix | null;
  sentAt: number | null;
};

const INITIAL: State = {
  ready: false,
  server: '',
  serverSaved: false,
  token: null,
  user: null,
  orders: [],
  jobs: [],
  shops: {},
  reachable: null,
  problem: null,
  syncedAt: null,
  live: false,
  banner: null,
  gpsWanted: true,
  gps: 'off',
  fix: null,
  sentAt: null,
};

export const isUnderWay = (o: Order) => o.status === 'assigned' || o.status === 'picked';

type Actions = {
  api: Api;
  /** The delivery the partner is doing now, if any. */
  active: Order | null;
  login(phone: string, code: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  setOnline(online: boolean): Promise<void>;
  chooseArea(place: Place): Promise<void>;
  /** Use the phone's GPS for the partner's position again, instead of an area from the list. */
  shareGps(): Promise<void>;
  act(id: string, action: 'claim' | 'pickup' | 'deliver', otp?: string): Promise<Order>;
  /** Save a server address, or pass null to go back to the one worked out from Expo. */
  setServer(address: string | null): Promise<void>;
  notify(banner: Omit<Banner, 'id'>, ms?: number): void;
  dismiss(): void;
};

const Context = createContext<(State & Actions) | null>(null);

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp must be used inside <AppProvider>.');
  return value;
}

/** Keep the account on the phone, so the app opens straight to it next time, even before the server answers. */
const remember = (user: Me) => void AsyncStorage.setItem(KEY.user, JSON.stringify(user)).catch(() => undefined);

const describeJob = (j: Job) => `${j.storeName} · ${km(j.pickupKm)} to the shop · you earn ${rupee(payOf(j))}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);

  // The latest state, for timers and for the API, which must never use a stale token or address.
  const live = useRef(state);
  live.current = state;
  const update = useCallback((patch: Partial<State>) => {
    live.current = { ...live.current, ...patch };
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const api = useMemo(() => createApi(() => ({ server: live.current.server, token: live.current.token })), []);

  // ---------- Banners ----------

  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback(
    (banner: Omit<Banner, 'id'>, ms = 6000) => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      update({ banner: { ...banner, id: Date.now() } });
      bannerTimer.current = setTimeout(() => update({ banner: null }), ms);
    },
    [update],
  );
  const dismiss = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    update({ banner: null });
  }, [update]);

  // ---------- Login ----------

  const seen = useRef(new Set<string>());
  /** True until the first list of jobs after logging in or going online: those do not buzz. */
  const firstLook = useRef(true);
  /** Goes up with every step the partner takes, so a reply that started before it is not used. */
  const orderEdits = useRef(0);
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);

  const forget = useCallback(
    async (message?: string) => {
      await Promise.all([AsyncStorage.removeItem(KEY.token), AsyncStorage.removeItem(KEY.user)]).catch(() => undefined);
      seen.current = new Set();
      firstLook.current = true;
      lastSent.current = null;
      update({ token: null, user: null, orders: [], jobs: [], fix: null, sentAt: null, syncedAt: null });
      if (message) notify({ tone: 'bad', title: message });
    },
    [update, notify],
  );

  /** A failed request: log out if the login has ended, otherwise note that the server could not be reached. */
  const failed = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) await forget('Your login has ended. Log in again.');
      else update({ reachable: false, problem: errorText(e) });
    },
    [forget, update],
  );

  // ---------- Reading from the server ----------

  const shopsAt = useRef(0);
  const loadShops = useCallback(
    async (force = false) => {
      if (!force && Date.now() - shopsAt.current < 60_000) return;
      shopsAt.current = Date.now();
      try {
        const list = await api.shops();
        update({ shops: Object.fromEntries(list.map((s) => [s.id, { id: s.id, name: s.name, area: s.area, lat: s.lat, lng: s.lng }])) });
      } catch {
        // Directions then use the shop's name; the next refresh tries again.
      }
    },
    [api, update],
  );

  const meAt = useRef(0);
  const refreshMe = useCallback(async () => {
    if (!live.current.token) return;
    meAt.current = Date.now();
    try {
      const { user } = await api.me();
      if (!user || user.role !== 'partner') return forget('Your login has ended. Log in again.');
      update({ user, reachable: true, problem: null });
      remember(user);
    } catch (e) {
      await failed(e);
    }
  }, [api, update, forget, failed]);

  const readJobs = useCallback(async () => {
    if (Date.now() - meAt.current > ME_EVERY_MS) await refreshMe();
    if (!live.current.token) return;
    const edits = orderEdits.current;
    const data = await api.orders();
    // Skip a reply that was on its way while the partner took a step: it may not have the step yet.
    if (edits !== orderEdits.current || !live.current.token) return;
    const jobs = data.available ?? [];
    const fresh = jobs.filter((j) => !seen.current.has(j.id));
    jobs.forEach((j) => seen.current.add(j.id));
    const delivering = data.orders.some(isUnderWay);
    if (live.current.user?.online && !delivering && fresh.length > 0) {
      if (firstLook.current) {
        notify({ tone: 'info', title: `${plural(jobs.length, 'delivery', 'deliveries')} waiting near you` });
      } else {
        Vibration.vibrate(BUZZ);
        notify({ tone: 'new', title: fresh.length === 1 ? 'New delivery near you' : `${fresh.length} new deliveries near you`, body: describeJob(fresh[0]) }, 9000);
      }
    }
    firstLook.current = false;
    update({ orders: data.orders, jobs, reachable: true, problem: null, syncedAt: Date.now() });
    if ([...data.orders, ...jobs].some((o) => !live.current.shops[o.storeId])) void loadShops();
  }, [api, update, notify, loadShops, refreshMe]);

  const busy = useRef(false);
  const again = useRef(false);
  const refresh = useCallback(async () => {
    const { token, server } = live.current;
    if (!token || !server) return;
    // Asked again while a read is on its way: it may be from before the change, so read once more after it.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        await readJobs();
      } while (again.current && live.current.token);
    } catch (e) {
      await failed(e);
    } finally {
      busy.current = false;
    }
  }, [readJobs, failed]);

  // Read the saved login and settings once, when the app starts.
  useEffect(() => {
    void (async () => {
      const [savedServer, token, userJson, gpsChoice] = await Promise.all(
        [KEY.server, KEY.token, KEY.user, KEY.gps].map((k) => AsyncStorage.getItem(k).catch(() => null)),
      );
      let user: Me | null = null;
      try {
        user = userJson ? (JSON.parse(userJson) as Me) : null;
      } catch {
        user = null;
      }
      const loggedIn = !!token && !!user;
      // Tidy an address saved by an older version, such as Expo's port 8081 instead of 3000.
      const saved = savedServer ? cleanServer(savedServer) : null;
      update({
        ready: true,
        server: saved ?? detectedServer() ?? '',
        serverSaved: !!saved,
        token: loggedIn ? token : null,
        user: loggedIn ? user : null,
        gpsWanted: gpsChoice !== 'off',
      });
      if (loggedIn) {
        void loadShops(true);
        void refresh();
      }
    })();
  }, [update, loadShops, refresh]);

  // While the app is on screen: keep the live connection open, and check by itself now and then
  // (every few seconds if the live connection is down). Both stop while the app is in the background.
  const token = state.token;
  const server = state.server;
  useEffect(() => {
    if (!token || !server) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let close: (() => void) | null = null;
    const tick = () => {
      void refresh();
      timer = setTimeout(tick, live.current.live ? POLL_LIVE_MS : POLL_MS);
    };
    const start = () => {
      if (timer) return;
      tick();
      close = openLive(
        `${server}/api/live?seat=partner`,
        { Authorization: `Bearer ${token}`, 'X-LocalRush-Seat': 'partner', 'X-LocalRush-Client': 'app' },
        {
          onHello: () => void refresh(),
          onChange: () => void refresh(),
          onStatus: (on) => {
            update({ live: on });
            // Lost it: go back to checking every few seconds straight away.
            if (!on && timer) {
              clearTimeout(timer);
              timer = setTimeout(tick, POLL_MS);
            }
          },
        },
      );
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      close?.();
      close = null;
    };
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    const subscription = AppState.addEventListener('change', (now) => {
      if (now === 'active') {
        meAt.current = 0;
        start();
      } else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [token, server, refresh, update]);

  // ---------- GPS ----------

  const onFix = useCallback(
    (fix: Fix) => {
      update({ fix, gps: 'on' });
      const last = lastSent.current;
      const now = Date.now();
      if (last) {
        const rate = live.current.orders.some(isUnderWay) ? DELIVERING : WAITING;
        const movedM = crow(last.lat, last.lng, fix.lat, fix.lng) * 1000;
        if (now - last.at < rate.gapMs) return;
        if (movedM < rate.afterM && now - last.at < rate.everyMs) return;
      }
      lastSent.current = { lat: fix.lat, lng: fix.lng, at: now };
      const accuracy = fix.accuracy ? `GPS, within ${Math.round(fix.accuracy)} m` : 'GPS';
      const place: Place = { label: GPS_LABEL, sub: accuracy, lat: fix.lat, lng: fix.lng };
      api
        .setPartner({ place, gps: true })
        .then(({ user }) => {
          update({ user, sentAt: Date.now() });
          remember(user);
          // The first position changes which jobs are near and how far they are: look again now.
          if (!last) void refresh();
        })
        .catch((e) => {
          lastSent.current = last; // send again with the next position
          void failed(e);
        });
    },
    [api, update, refresh, failed],
  );

  const wantGps = !!state.token && !!state.user?.online && state.gpsWanted;
  // Taking a delivery or handing it over changes how often the phone is asked for its position.
  const delivering = state.orders.some(isUnderWay);
  useEffect(() => {
    if (!wantGps) {
      if (live.current.gps !== 'off') update({ gps: 'off' });
      return;
    }
    let stopped = false;
    let stop: (() => void) | null = null;
    update({ gps: 'starting' });
    void (async () => {
      try {
        const permission = await ensurePermission();
        if (stopped) return;
        if (permission !== 'granted') {
          update({ gps: permission });
          return;
        }
        const end = await follow(onFix, () => update({ gps: 'error' }), delivering);
        if (stopped) end();
        else stop = end;
      } catch {
        if (!stopped) update({ gps: 'error' });
      }
    })();
    return () => {
      stopped = true;
      stop?.();
      lastSent.current = null;
    };
  }, [wantGps, delivering, onFix, update]);

  // ---------- Actions ----------

  const login = useCallback(
    async (phone: string, code: string) => {
      const { user, token } = await api.login(phone, code);
      await Promise.all([AsyncStorage.setItem(KEY.token, token), AsyncStorage.setItem(KEY.user, JSON.stringify(user))]).catch(() => undefined);
      seen.current = new Set();
      firstLook.current = true;
      meAt.current = Date.now();
      update({ token, user, orders: [], jobs: [], reachable: true, problem: null });
      void loadShops(true);
      void refresh();
    },
    [api, update, loadShops, refresh],
  );

  const logout = useCallback(async () => {
    // Go offline first, so no shop is left waiting for a partner who has gone.
    if (live.current.user?.online) await api.setPartner({ online: false }).catch(() => undefined);
    await forget();
  }, [api, forget]);

  const setOnline = useCallback(
    async (online: boolean) => {
      const { user } = await api.setPartner({ online });
      seen.current = new Set();
      firstLook.current = true;
      update({ user, jobs: online ? live.current.jobs : [] });
      remember(user);
      void refresh();
    },
    [api, update, refresh],
  );

  const chooseArea = useCallback(
    async (place: Place) => {
      await AsyncStorage.setItem(KEY.gps, 'off').catch(() => undefined);
      update({ gpsWanted: false, fix: null, sentAt: null });
      const { user } = await api.setPartner({ place });
      update({ user });
      remember(user);
      void refresh();
    },
    [api, update, refresh],
  );

  const shareGps = useCallback(async () => {
    await AsyncStorage.setItem(KEY.gps, 'on').catch(() => undefined);
    lastSent.current = null;
    update({ gpsWanted: true });
  }, [update]);

  const act = useCallback(
    async (id: string, action: 'claim' | 'pickup' | 'deliver', otp?: string) => {
      const { order } = await api.act(id, action, otp === undefined ? undefined : { otp });
      orderEdits.current++;
      update({
        orders: [order, ...live.current.orders.filter((o) => o.id !== order.id)],
        jobs: live.current.jobs.filter((j) => j.id !== id),
      });
      void refresh();
      return order;
    },
    [api, update, refresh],
  );

  const setServer = useCallback(
    async (address: string | null) => {
      if (address === null) {
        await AsyncStorage.removeItem(KEY.server).catch(() => undefined);
        update({ server: detectedServer() ?? '', serverSaved: false, reachable: null, problem: null });
      } else {
        const clean = cleanServer(address);
        if (!clean) throw new Error('That is not a server address. It looks like http://192.168.1.5:3000');
        await AsyncStorage.setItem(KEY.server, clean).catch(() => undefined);
        update({ server: clean, serverSaved: true, reachable: null, problem: null });
      }
      if (live.current.token) {
        void loadShops(true);
        void refresh();
      }
    },
    [update, loadShops, refresh],
  );

  const active = useMemo(() => state.orders.find(isUnderWay) ?? null, [state.orders]);

  const value = useMemo(
    () => ({ ...state, api, active, login, logout, refresh, setOnline, chooseArea, shareGps, act, setServer, notify, dismiss }),
    [state, api, active, login, logout, refresh, setOnline, chooseArea, shareGps, act, setServer, notify, dismiss],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
