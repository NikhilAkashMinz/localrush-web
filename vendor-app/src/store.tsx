// Everything the app knows, in one place: who is logged in, their shop, its orders, its stock
// and prices, and the server's address. Screens read it with useApp().
//
// While the app is open it keeps a live connection to the server (src/live.ts), the same one the
// website uses: the moment an order arrives or changes, the server says so and the app reads it
// at once. An order it has not seen before makes the phone buzz and shows a banner at the top of
// the screen. It also checks by itself now and then, in case the live connection is down.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';
import { ApiError, createApi, errorText, type Api } from './api';
import { stockKey } from './catalog';
import { cleanServer, detectedServer } from './config';
import { itemCount, plural, rupee } from './format';
import { openLive } from './live';
import type { Catalog, Me, NewProduct, Order, Product, Status, Store } from './types';

// Separate from the partner app's keys, in case both run on one phone.
const KEY = { server: 'lr.vendor.server', token: 'lr.vendor.token', user: 'lr.vendor.user' } as const;

/** How often to look for new orders while the live connection is down... */
const POLL_MS = 4000;
/** ...and while it is up, only as a safety net: changes then arrive the moment they happen. */
const POLL_LIVE_MS = 30_000;
/** How often to re-read the owner's account, in case it changed on the website. */
const ME_EVERY_MS = 30_000;
/** How often to re-read stock, prices and whether the shop is paused, which can change on the website too. */
const CATALOG_EVERY_MS = 30_000;
/** The buzz for a new order: three long pulses, to be noticed on a busy counter. */
const BUZZ = [0, 500, 200, 500, 200, 500];
/** A new order stays highlighted this long. */
export const FRESH_MS = 15_000;

export type Banner = { id: number; tone: 'new' | 'good' | 'bad' | 'info'; title: string; body?: string };

type Action = 'accept' | 'reject' | 'pack';

type State = {
  /** False until the saved login and settings have been read. */
  ready: boolean;
  server: string;
  /** True when the address was typed in by the owner; false when it was worked out from Expo. */
  serverSaved: boolean;
  token: string | null;
  user: Me | null;
  orders: Order[];
  catalog: Catalog | null;
  /** When each new order arrived, so it can stand out for a few seconds. */
  fresh: Record<string, number>;
  /** Whether the last request to the server worked; null before the first one. */
  reachable: boolean | null;
  problem: string | null;
  syncedAt: number | null;
  /** Whether the live connection is up, so changes arrive the moment they happen. */
  live: boolean;
  banner: Banner | null;
};

const INITIAL: State = {
  ready: false,
  server: '',
  serverSaved: false,
  token: null,
  user: null,
  orders: [],
  catalog: null,
  fresh: {},
  reachable: null,
  problem: null,
  syncedAt: null,
  live: false,
  banner: null,
};

type Actions = {
  api: Api;
  /** The owner's shop, from the catalogue. Null until the catalogue has loaded. */
  shop: Store | null;
  login(phone: string, code: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  loadCatalog(): Promise<void>;
  act(id: string, action: Action): Promise<Order>;
  saveStock(productId: string, price: number, stock: number): Promise<void>;
  addProduct(input: NewProduct): Promise<Product>;
  setPaused(paused: boolean): Promise<void>;
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

const describe = (o: Order) => `${o.customerName} · ${plural(itemCount(o.lines), 'item')} · ${rupee(o.subtotal)}`;

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

  // ---------- What has been seen ----------

  /** New orders already announced, so each one buzzes only once. */
  const seen = useRef(new Set<string>());
  /** The step each order was in at the last look, to notice changes made by others. */
  const steps = useRef(new Map<string, Status>());
  /** True until the first list of orders after logging in: those do not buzz. */
  const firstLook = useRef(true);
  /** Goes up with every change the owner makes, so a reply that started before it is not used. */
  const orderEdits = useRef(0);
  const catalogEdits = useRef(0);

  const forget = useCallback(
    async (message?: string) => {
      await Promise.all([AsyncStorage.removeItem(KEY.token), AsyncStorage.removeItem(KEY.user)]).catch(() => undefined);
      seen.current = new Set();
      steps.current = new Map();
      firstLook.current = true;
      update({ token: null, user: null, orders: [], fresh: {}, syncedAt: null });
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

  /** Tell the owner about new orders, and about changes others made: a partner taking one, a customer cancelling. */
  const announce = useCallback(
    (orders: Order[]) => {
      const waiting = orders.filter((o) => o.status === 'placed');
      const arrived = waiting.filter((o) => !seen.current.has(o.id));
      waiting.forEach((o) => seen.current.add(o.id));
      const changed: Order[] = [];
      for (const o of orders) {
        const before = steps.current.get(o.id);
        if (before && before !== o.status) changed.push(o);
        steps.current.set(o.id, o.status);
      }

      if (firstLook.current) {
        firstLook.current = false;
        if (waiting.length > 0) {
          notify({ tone: 'info', title: `${plural(waiting.length, 'order')} waiting for you`, body: 'Accept or turn down each one below.' });
        }
        return;
      }
      if (arrived.length > 0) {
        Vibration.vibrate(BUZZ);
        const now = Date.now();
        const fresh = Object.fromEntries(Object.entries(live.current.fresh).filter(([, at]) => now - at < FRESH_MS));
        arrived.forEach((o) => (fresh[o.id] = now));
        update({ fresh });
        notify({ tone: 'new', title: arrived.length === 1 ? `New order ${arrived[0].id}` : `${arrived.length} new orders`, body: describe(arrived[0]) }, 9000);
        return;
      }
      const cancelled = changed.find((o) => o.status === 'cancelled');
      if (cancelled) {
        notify({ tone: 'bad', title: `${cancelled.id} was cancelled`, body: `${cancelled.customerName} cancelled it before you accepted. Its items are back in your stock.` });
        return;
      }
      const coming = changed.find((o) => o.status === 'assigned');
      if (coming) {
        notify({ tone: 'info', title: `${coming.partnerName ?? 'A delivery partner'} is coming for ${coming.id}`, body: 'Keep the bag ready at the counter.' });
        return;
      }
      const delivered = changed.find((o) => o.status === 'delivered');
      if (delivered) notify({ tone: 'good', title: `${delivered.id} delivered`, body: `${rupee(delivered.subtotal)} added to your sales.` });
    },
    [notify, update],
  );

  // ---------- Reading from the server ----------

  const catalogAt = useRef(0);
  const catalogBusy = useRef(false);
  const catalogAgain = useRef(false);
  const loadCatalog = useCallback(async () => {
    // Asked again while a copy is on its way: it may be from before the change, so read once more after it.
    if (catalogBusy.current) {
      catalogAgain.current = true;
      return;
    }
    catalogBusy.current = true;
    try {
      do {
        catalogAgain.current = false;
        catalogAt.current = Date.now();
        const edits = catalogEdits.current;
        try {
          const catalog = await api.catalog();
          // Skip a copy that was on its way while the owner changed something: it may not have the change yet.
          if (edits === catalogEdits.current) update({ catalog });
        } catch {
          // The orders check reports connection problems; the next refresh tries again.
        }
      } while (catalogAgain.current);
    } finally {
      catalogBusy.current = false;
    }
  }, [api, update]);

  const meAt = useRef(0);
  const refreshMe = useCallback(async () => {
    if (!live.current.token) return;
    meAt.current = Date.now();
    try {
      const { user } = await api.me();
      if (!user || user.role !== 'shop') return forget('Your login has ended. Log in again.');
      update({ user, reachable: true, problem: null });
      remember(user);
    } catch (e) {
      await failed(e);
    }
  }, [api, update, forget, failed]);

  const readOrders = useCallback(async () => {
    if (Date.now() - meAt.current > ME_EVERY_MS) await refreshMe();
    if (!live.current.token) return;
    if (Date.now() - catalogAt.current > CATALOG_EVERY_MS) void loadCatalog();
    const edits = orderEdits.current;
    const { orders } = await api.orders();
    if (edits !== orderEdits.current || !live.current.token) return;
    const storeId = live.current.user?.storeId;
    const mine = orders.filter((o) => o.storeId === storeId);
    announce(mine);
    update({ orders: mine, reachable: true, problem: null, syncedAt: Date.now() });
  }, [api, update, announce, loadCatalog, refreshMe]);

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
        await readOrders();
      } while (again.current && live.current.token);
    } catch (e) {
      await failed(e);
    } finally {
      busy.current = false;
    }
  }, [readOrders, failed]);

  // Read the saved login and settings once, when the app starts.
  useEffect(() => {
    void (async () => {
      const [savedServer, token, userJson] = await Promise.all(
        [KEY.server, KEY.token, KEY.user].map((k) => AsyncStorage.getItem(k).catch(() => null)),
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
      });
      if (loggedIn) {
        void loadCatalog();
        void refresh();
      }
    })();
  }, [update, loadCatalog, refresh]);

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
        `${server}/api/live?seat=shop`,
        { Authorization: `Bearer ${token}`, 'X-LocalRush-Seat': 'shop', 'X-LocalRush-Client': 'app' },
        {
          onHello: () => {
            void refresh();
            void loadCatalog();
          },
          onChange: (kinds) => {
            if (kinds.includes('orders')) void refresh();
            if (kinds.includes('catalog')) void loadCatalog();
          },
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
        catalogAt.current = 0;
        start();
      } else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [token, server, refresh, loadCatalog, update]);

  // ---------- Actions ----------

  const login = useCallback(
    async (phone: string, code: string) => {
      const { user, token } = await api.login(phone, code);
      await Promise.all([AsyncStorage.setItem(KEY.token, token), AsyncStorage.setItem(KEY.user, JSON.stringify(user))]).catch(() => undefined);
      seen.current = new Set();
      steps.current = new Map();
      firstLook.current = true;
      meAt.current = Date.now();
      update({ token, user, orders: [], fresh: {}, reachable: true, problem: null });
      void loadCatalog();
      void refresh();
    },
    [api, update, loadCatalog, refresh],
  );

  const logout = useCallback(() => forget(), [forget]);

  const act = useCallback(
    async (id: string, action: Action) => {
      const { order } = await api.act(id, action);
      orderEdits.current++;
      steps.current.set(order.id, order.status);
      const others = live.current.orders.filter((o) => o.id !== order.id);
      // A turned-down order that moved to another shop is no longer this shop's.
      update({ orders: order.storeId === live.current.user?.storeId ? [order, ...others] : others });
      if (action !== 'accept') {
        // Packing and turning down change stock and what customers see.
        catalogAt.current = 0;
      }
      void refresh();
      return order;
    },
    [api, update, refresh],
  );

  const saveStock = useCallback(
    async (productId: string, price: number, stock: number) => {
      const storeId = live.current.user?.storeId;
      if (!storeId) throw new Error('Log in again to change your stock.');
      const saved = await api.setStock(productId, price, stock);
      catalogEdits.current++;
      const c = live.current.catalog;
      if (c) update({ catalog: { ...c, stock: { ...c.stock, [stockKey(storeId, productId)]: { price: saved.price, stock: saved.stock } } } });
    },
    [api, update],
  );

  const addProduct = useCallback(
    async (input: NewProduct) => {
      const storeId = live.current.user?.storeId;
      if (!storeId) throw new Error('Log in again to add a product.');
      const { product } = await api.addProduct(input);
      catalogEdits.current++;
      const c = live.current.catalog;
      if (c) {
        update({
          catalog: {
            ...c,
            products: [...c.products.filter((p) => p.id !== product.id), product],
            stock: { ...c.stock, [stockKey(storeId, product.id)]: { price: input.price, stock: input.stock } },
          },
        });
      }
      return product;
    },
    [api, update],
  );

  const setPaused = useCallback(
    async (paused: boolean) => {
      const storeId = live.current.user?.storeId;
      const result = await api.setPaused(paused);
      catalogEdits.current++;
      const c = live.current.catalog;
      if (c) update({ catalog: { ...c, stores: c.stores.map((s) => (s.id === storeId ? { ...s, paused: result.paused } : s)) } });
    },
    [api, update],
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
        void loadCatalog();
        void refresh();
      }
    },
    [update, loadCatalog, refresh],
  );

  const shop = useMemo(() => state.catalog?.stores.find((s) => s.id === state.user?.storeId) ?? null, [state.catalog, state.user]);

  const value = useMemo(
    () => ({ ...state, api, shop, login, logout, refresh, loadCatalog, act, saveStock, addProduct, setPaused, setServer, notify, dismiss }),
    [state, api, shop, login, logout, refresh, loadCatalog, act, saveStock, addProduct, setPaused, setServer, notify, dismiss],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
