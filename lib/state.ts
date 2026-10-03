'use client';

// One small client-side store. The cart, location and preferences are saved in this
// browser; the user, orders and catalogue come from the server.
// No library: React's useSyncExternalStore does the subscribing.

import { useSyncExternalStore } from 'react';
import { api, type Me } from './api';
import { PLACES, setDataset, type Dataset, type Place, type Product } from './data';
import type { Order } from './orders';
import type { Mode } from './select';

export type Toast = { id: number; text: string };
/** A packed order a delivery partner could take, with the ride to the shop. */
export type Job = Order & { pickupKm: number };

export type State = {
  ready: boolean;
  place: Place;
  cart: Record<string, number>;
  user: Me | null;
  orders: Order[];
  /** Delivery partners only: packed orders nearby that nobody has taken. */
  available: Job[];
  recent: string[];
  mode: Mode;
  panel: 'cart' | 'search' | 'place' | null;
  toasts: Toast[];
  /** Bumps each time something is added, so the cart button can react. */
  bump: number;
  /** Goes up each time a fresh catalogue arrives, so pages recalculate. */
  tick: number;
  /** Whether the live connection to the server is up. */
  live: boolean;
  /** True when the server could not be reached and the site is showing built-in sample data. */
  offline: boolean;
};

const KEY = 'localrush:v2';
const SAVED: (keyof State)[] = ['place', 'cart', 'recent', 'mode'];

const initial: State = {
  ready: false,
  place: PLACES[0],
  cart: {},
  user: null,
  orders: [],
  available: [],
  recent: [],
  mode: 'balanced',
  panel: null,
  toasts: [],
  bump: 0,
  tick: 0,
  live: false,
  offline: false,
};

let state: State = initial;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function save() {
  try {
    const out: Record<string, unknown> = {};
    for (const k of SAVED) out[k] = state[k];
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // Private windows can refuse storage; the site still works for this visit.
  }
}

function set(patch: Partial<State>, persist = true) {
  state = { ...state, ...patch };
  if (persist && state.ready) save();
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Read part of the store. Selectors must return something already in the state. */
export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => pick(state),
    () => pick(initial),
  );
}

export const getState = () => state;

let toastId = 1;
let started = false;

export const actions = {
  /** Load what was saved in this browser, then the catalogue and the logged-in user from the server. */
  async hydrate() {
    if (started) return;
    started = true;
    let saved: Partial<State> = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = JSON.parse(raw) as Partial<State>;
    } catch {
      saved = {};
    }
    const clean: Partial<State> = {};
    for (const k of SAVED) if (saved[k] !== undefined && saved[k] !== null) Object.assign(clean, { [k]: saved[k] });
    state = { ...state, ...clean };
    await Promise.all([actions.refreshCatalog(), actions.refreshMe()]);
    await actions.refreshOrders();
    set({ ready: true });
  },

  async refreshCatalog() {
    try {
      const data = await api<Dataset>('GET', 'catalog');
      setDataset(data);
      set({ tick: state.tick + 1, offline: false }, false);
    } catch {
      // Keep whatever catalogue we already have (the built-in sample, on a first load).
      set({ offline: true }, false);
    }
  },

  async refreshMe() {
    try {
      const { user } = await api<{ user: Me | null }>('GET', 'me');
      set({ user }, false);
    } catch {
      // Stay as we are; the next action will show a clear error if the server is down.
    }
  },

  async refreshOrders() {
    if (!state.user) {
      if (state.orders.length || state.available.length) set({ orders: [], available: [] }, false);
      return;
    }
    try {
      const data = await api<{ orders: Order[]; available?: Job[] }>('GET', 'orders');
      set({ orders: data.orders, available: data.available ?? [] }, false);
    } catch {
      // Leave the last known list on screen.
    }
  },

  async login(input: { name: string; phone: string; code: string }) {
    const { user } = await api<{ user: Me }>('POST', 'auth/login', input);
    set({ user }, false);
    await actions.refreshOrders();
    return user;
  },

  async logout() {
    await api('POST', 'auth/logout').catch(() => undefined);
    set({ user: null, orders: [], available: [] }, false);
  },

  async rename(name: string) {
    const { user } = await api<{ user: Me }>('PATCH', 'me', { name });
    set({ user }, false);
  },

  async deleteAddress(id: string) {
    const { user } = await api<{ user: Me }>('DELETE', 'me/addresses/' + encodeURIComponent(id));
    set({ user }, false);
  },

  /** Send the cart to the server, which picks the shops and creates one order per shop. */
  async placeOrders(input: { line: string; tag: string; payment: Order['payment'] }) {
    const result = await api<{ orders: Order[]; leftOut: string[]; user: Me | null }>('POST', 'orders', {
      cart: state.cart,
      place: state.place,
      mode: state.mode,
      ...input,
    });
    set({ orders: [...result.orders, ...state.orders], cart: {}, user: result.user ?? state.user });
    void actions.refreshCatalog();
    return result;
  },

  /** Move an order on: accept, reject, pack, claim, pickup, deliver or cancel. */
  async orderAction(id: string, action: string, body?: unknown) {
    try {
      const { order } = await api<{ order: Order }>('POST', `orders/${id}/${action}`, body ?? {});
      const known = state.orders.some((o) => o.id === id);
      set(
        {
          // Keep fields only this user was sent before (the customer's door code, for one).
          orders: known ? state.orders.map((o) => (o.id === id ? { ...o, ...order } : o)) : [order, ...state.orders],
          available: state.available.filter((o) => o.id !== id),
        },
        false,
      );
      void actions.refreshOrders();
      return order;
    } catch (e) {
      // Someone else may have moved it first: show where things really stand.
      void actions.refreshOrders();
      throw e;
    }
  },

  /** Shop owners: stop or start taking orders. */
  async setShopPaused(paused: boolean) {
    await api('PUT', 'shop/paused', { paused });
    await actions.refreshCatalog();
  },

  /** Shop owners: set the price and stock of one product in their shop. */
  async saveStock(pid: string, price: number, stock: number) {
    await api('PUT', 'shop/stock', { pid, price, stock });
    await actions.refreshCatalog();
  },

  /** Shop owners: add a product that is not in the catalogue yet. */
  async addProduct(input: { name: string; unit: string; cat: string; mrp: number; price: number; stock: number; emoji: string }) {
    const { product } = await api<{ product: Product }>('POST', 'shop/products', input);
    await actions.refreshCatalog();
    return product;
  },

  /** Delivery partners: go online or offline, or say which area they are in. */
  async setPartner(patch: { online?: boolean; place?: Place }) {
    const { user } = await api<{ user: Me }>('PUT', 'partner', patch);
    set({ user }, false);
    await actions.refreshOrders();
  },

  setLive(live: boolean) {
    if (state.live !== live) set({ live }, false);
  },

  setPlace(place: Place) {
    set({ place, panel: null });
  },

  add(pid: string, delta: number, max = 12) {
    const next = Math.max(0, Math.min(max, (state.cart[pid] ?? 0) + delta));
    const cart = { ...state.cart };
    if (next === 0) delete cart[pid];
    else cart[pid] = next;
    set({ cart, bump: delta > 0 ? state.bump + 1 : state.bump });
  },

  remove(pid: string) {
    const cart = { ...state.cart };
    delete cart[pid];
    set({ cart });
  },

  clearCart() {
    set({ cart: {} });
  },

  setMode(mode: Mode) {
    set({ mode });
  },

  open(panel: State['panel']) {
    set({ panel }, false);
  },

  remember(query: string) {
    const q = query.trim();
    if (!q) return;
    set({ recent: [q, ...state.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6) });
  },

  forgetRecent() {
    set({ recent: [] });
  },

  toast(text: string) {
    const id = toastId++;
    set({ toasts: [...state.toasts, { id, text }] }, false);
    setTimeout(() => {
      set({ toasts: state.toasts.filter((t) => t.id !== id) }, false);
    }, 2600);
  },
};

export const cartCount = (cart: Record<string, number>) => Object.values(cart).reduce((a, b) => a + b, 0);
