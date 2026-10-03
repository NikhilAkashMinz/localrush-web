'use client';

// The website's way of talking to the server. Every call goes to /api/... on the same
// address the site is served from, and the login cookie is sent automatically.
//
// Each side of LocalRush is a "seat" with its own login: the shop dashboard is the shop
// seat, the delivery screen the partner seat, everything else the customer seat. That is
// why one browser can keep all three logged in, each in its own tab.

import type { Place } from './data';

export type Role = 'customer' | 'shop' | 'partner';
export type Address = { id: string; tag: string; line: string; place: Place };

/** The logged-in user, as the server describes them. */
export type Me = {
  id: string;
  name: string;
  phone: string;
  role: Role;
  storeId?: string;
  online?: boolean;
  place?: Place;
  addresses: Address[];
};

/** Which seat a page address belongs to. */
export const seatFor = (path: string): Role =>
  path.startsWith('/dashboard') ? 'shop' : path.startsWith('/partner') ? 'partner' : 'customer';

/**
 * The seat of the page this tab is showing right now. It is read from the address every
 * time, never remembered, so a request can never go out under the wrong login.
 */
export const currentSeat = (): Role => (typeof location === 'undefined' ? 'customer' : seatFor(location.pathname));

/** An error the server explained. `message` is written to be shown to the person as it is. */
export class ApiFail extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      method,
      headers: { 'X-LocalRush-Seat': currentSeat(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiFail('Could not reach the server. Check your connection and try again.', 0, 'network');
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // An empty or non-JSON reply is handled below.
  }
  if (!response.ok) {
    const info = (data ?? {}) as { error?: string; code?: string };
    throw new ApiFail(info.error ?? 'Something went wrong. Try again.', response.status, info.code);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
