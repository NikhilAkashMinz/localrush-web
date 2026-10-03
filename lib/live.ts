'use client';

// One live connection to the server per browser tab. The server sends a short message
// whenever the catalogue or this user's orders change; pages react by re-reading the data.
// If the connection drops, the browser reconnects by itself and we check every few
// seconds in the meantime, so nothing is missed.

import { currentSeat } from './api';

export type LiveKind = 'catalog' | 'orders';
type Handler = (kinds: LiveKind[]) => void;

const handlers = new Set<Handler>();
const statusHandlers = new Set<(connected: boolean) => void>();
let source: EventSource | null = null;
let fallback: ReturnType<typeof setInterval> | null = null;

const emit = (kinds: LiveKind[]) => handlers.forEach((h) => h(kinds));
const setStatus = (connected: boolean) => statusHandlers.forEach((h) => h(connected));

function stopFallback() {
  if (fallback) clearInterval(fallback);
  fallback = null;
}

function startFallback() {
  if (!fallback) fallback = setInterval(() => emit(['catalog', 'orders']), 5000);
}

/** Open (or reopen) the connection. Call again after logging in or out, as each user follows different things. */
export function startLive() {
  stopLive();
  if (typeof EventSource === 'undefined') {
    startFallback();
    return;
  }
  // EventSource cannot send headers, so the seat goes in the address.
  source = new EventSource('/api/live?seat=' + currentSeat());
  source.onmessage = (e) => {
    stopFallback();
    setStatus(true);
    try {
      const data = JSON.parse(e.data) as { hello?: boolean; changed?: LiveKind[] };
      // "hello" arrives on every (re)connect: reload everything in case changes were missed.
      emit(data.hello ? ['catalog', 'orders'] : (data.changed ?? []));
    } catch {
      emit(['catalog', 'orders']);
    }
  };
  source.onerror = () => {
    setStatus(false);
    startFallback();
  };
}

export function stopLive() {
  source?.close();
  source = null;
  stopFallback();
}

export function onLive(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function onLiveStatus(handler: (connected: boolean) => void) {
  statusHandlers.add(handler);
  return () => {
    statusHandlers.delete(handler);
  };
}
