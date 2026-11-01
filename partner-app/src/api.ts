// Talking to the LocalRush server. Every request:
//   - names the "partner" seat, so it only ever acts as a delivery partner;
//   - carries the login token from the server (Authorization: Bearer ...), not a cookie;
//   - gives up after a few seconds, so a dropped Wi-Fi never leaves a button spinning.

import type { DemoAccount, EarningsReport, Health, Job, Me, Order, Period, Place, Shop } from './types';

/** An error the server explained, or a network problem. `message` can be shown to the partner as it is. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.code === 'network';

type Connection = () => { server: string; token: string | null };

const TIMEOUT_MS = 10_000;

export function createApi(connection: Connection) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { server, token } = connection();
    if (!server) throw new ApiError('Set the LocalRush server address first (Account → Server).', 0, 'network');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${server}/api/${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-LocalRush-Seat': 'partner',
          'X-LocalRush-Client': 'app',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        `Cannot reach the LocalRush server at ${server}. Check that it is running and that this phone is on the same Wi-Fi.`,
        0,
        'network',
      );
    } finally {
      clearTimeout(timer);
    }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // An empty or non-JSON reply is handled below.
    }
    if (!response.ok) {
      const info = (data ?? {}) as { error?: string; code?: string };
      throw new ApiError(info.error ?? `The server answered with an error (${response.status}).`, response.status, info.code);
    }
    return data as T;
  }

  return {
    health: () => call<Health>('GET', 'health'),
    demo: () => call<{ accounts: DemoAccount[] }>('GET', 'demo'),
    login: (phone: string, code: string) => call<{ user: Me; token: string }>('POST', 'auth/login', { phone, code }),
    me: () => call<{ user: Me | null }>('GET', 'me'),
    /** The partner's own orders, and the packed orders nearby that they could take. */
    orders: () => call<{ orders: Order[]; available?: Job[] }>('GET', 'orders'),
    act: (id: string, action: 'claim' | 'pickup' | 'deliver', body?: { otp: string }) =>
      call<{ order: Order }>('POST', `orders/${encodeURIComponent(id)}/${action}`, body ?? {}),
    setPartner: (patch: { online?: boolean; place?: Place; gps?: boolean }) => call<{ user: Me }>('PUT', 'partner', patch),
    earnings: (period: Period) => call<EarningsReport>('GET', `partner/earnings?period=${period}`),
    /** The LocalRush shops, for their locations. */
    shops: async () => (await call<{ stores: Shop[] }>('GET', 'catalog')).stores,
  };
}

export type Api = ReturnType<typeof createApi>;
