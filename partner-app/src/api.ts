// Talking to the LocalRush server. Every request:
//   - names the "partner" seat, so it only ever acts as a delivery partner;
//   - carries the login token from the server (Authorization: Bearer ...), not a cookie;
//   - gives up after a few seconds, so a dropped Wi-Fi never leaves a button spinning.

import type { Config, DemoAccount, EarningsReport, Health, Job, Me, Order, Period, Place, Shop } from './types';
import { onLaptop, SERVER_PORT } from './config';

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
/** The website on Render's free plan sleeps when nobody uses it, and takes up to a minute to wake. */
const WAKE_MS = 75_000;

export type LoginProof = { phone: string; code: string } | { idToken: string };

export function createApi(connection: Connection) {
  async function call<T>(method: string, path: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
    const { server, token } = connection();
    if (!server) throw new ApiError('Set the LocalRush server address first (Account → Server).', 0, 'network');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        onLaptop(server)
          ? `Cannot reach the LocalRush server at ${server}. Check that it is running and that this phone is on the same Wi-Fi.`
          : `Cannot reach LocalRush at ${server}. Check this phone's internet connection and try again.`,
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
    // Every LocalRush reply is a JSON object. Anything else came from something that is not the
    // LocalRush server, such as Expo on port 8081.
    const isLocalRush = !!data && typeof data === 'object';
    if (!isLocalRush && (response.ok || response.status === 404)) {
      throw new ApiError(
        onLaptop(server)
          ? `${server} is not the LocalRush server. Use the laptop's address with port ${SERVER_PORT}, for example http://192.168.1.5:${SERVER_PORT}, and check that "npm run dev" is running.`
          : `${server} is not the LocalRush website. Check the address.`,
        0,
        'network',
      );
    }
    if (!response.ok) {
      const info = (data ?? {}) as { error?: string; code?: string };
      throw new ApiError(info.error ?? `The server answered with an error (${response.status}).`, response.status, info.code);
    }
    return data as T;
  }

  return {
    health: () => call<Health>('GET', 'health', undefined, WAKE_MS),
    /** Whether this is the demo or the live service, and how to log in. The first call can wake the server up. */
    config: () => call<Config>('GET', 'config', undefined, WAKE_MS),
    demo: () => call<{ accounts: DemoAccount[] }>('GET', 'demo'),
    /** The demo logs in with a number and any 4 digits; the live service with Firebase's proof of the person's email. */
    login: (proof: LoginProof) => call<{ user: Me; token: string }>('POST', 'auth/login', proof),
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
