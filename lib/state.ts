'use client';

// One small client-side store, saved to the browser's localStorage.
// No library: React's useSyncExternalStore does the subscribing.

import { useSyncExternalStore } from 'react';
import { PLACES, type Place } from './data';
import { PARTNERS, secondsToNextStage, type Order } from './orders';
import type { Mode, Shipment } from './select';

export type User = { name: string; phone: string };
export type Address = { id: string; tag: string; line: string; place: Place };
export type Toast = { id: number; text: string };

export type State = {
  ready: boolean;
  place: Place;
  cart: Record<string, number>;
  user: User | null;
  addresses: Address[];
  orders: Order[];
  recent: string[];
  mode: Mode;
  panel: 'cart' | 'search' | 'place' | null;
  toasts: Toast[];
  /** Bumps each time something is added, so the cart button can react. */
  bump: number;
};

const KEY = 'localrush:v1';
const SAVED: (keyof State)[] = ['place', 'cart', 'user', 'addresses', 'orders', 'recent', 'mode'];

const initial: State = {
  ready: false,
  place: PLACES[0],
  cart: {},
  user: null,
  addresses: [],
  orders: [],
  recent: [],
  mode: 'balanced',
  panel: null,
  toasts: [],
  bump: 0,
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

export const actions = {
  /** Load what was saved in this browser. Called once after the first render. */
  hydrate() {
    if (state.ready) return;
    let saved: Partial<State> = {};
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = JSON.parse(raw) as Partial<State>;
    } catch {
      saved = {};
    }
    const clean: Partial<State> = {};
    for (const k of SAVED) if (saved[k] !== undefined && saved[k] !== null) Object.assign(clean, { [k]: saved[k] });
    state = { ...state, ...clean, ready: true };
    emit();
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

  login(user: User) {
    set({ user });
  },

  logout() {
    set({ user: null });
  },

  saveAddress(a: Omit<Address, 'id'>) {
    const address: Address = { ...a, id: 'a' + Date.now().toString(36) };
    set({ addresses: [address, ...state.addresses] });
    return address;
  },

  deleteAddress(id: string) {
    set({ addresses: state.addresses.filter((a) => a.id !== id) });
  },

  remember(query: string) {
    const q = query.trim();
    if (!q) return;
    set({ recent: [q, ...state.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6) });
  },

  forgetRecent() {
    set({ recent: [] });
  },

  /** Turn each planned delivery into an order and empty the cart. */
  placeOrders(shipments: Shipment[], address: string, payment: Order['payment']) {
    const now = Date.now();
    const created: Order[] = shipments.map((s, i) => ({
      id: 'LR' + (now + i).toString(36).toUpperCase().slice(-6),
      placedAt: now,
      storeId: s.near.store.id,
      lines: s.lines,
      subtotal: s.subtotal,
      fee: s.fee,
      total: s.subtotal + s.fee,
      address,
      payment,
      etaMin: s.etaMin,
      distKm: s.near.distKm,
      otp: String(1000 + Math.floor(Math.random() * 9000)),
      partner: PARTNERS[Math.floor(Math.random() * PARTNERS.length)],
      skip: 0,
    }));
    set({ orders: [...created, ...state.orders], cart: {} });
    return created;
  },

  skipStage(orderId: string) {
    set({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, skip: o.skip + secondsToNextStage(o, Date.now()) } : o,
      ),
    });
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
