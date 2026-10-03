'use client';

// The website's way of talking to the server. Every call goes to /api/... on the same
// address the site is served from, and the login cookie is sent automatically.

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
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
