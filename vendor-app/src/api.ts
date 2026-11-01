// Talking to the LocalRush server. Every request:
//   - names the "shop" seat, so the app only ever acts as a shop owner;
//   - carries the login token from the server (Authorization: Bearer ...), not a cookie;
//   - gives up after a few seconds, so a dropped Wi-Fi never leaves a button spinning.

import type { Catalog, DemoAccount, Health, Me, NewProduct, Order, Period, Product, SalesReport } from './types';

/** An error the server explained, or a network problem. `message` can be shown to the owner as it is. */
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

type Connection = () => { server: string; token: string | null };

const TIMEOUT_MS = 10_000;

export function createApi(connection: Connection) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { server, token } = connection();
    if (!server) throw new ApiError('Set the LocalRush server address first (Shop → Server).', 0, 'network');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${server}/api/${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-LocalRush-Seat': 'shop',
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
    /** Every order sent to this shop, newest first. */
    orders: () => call<{ orders: Order[] }>('GET', 'orders'),
    act: (id: string, action: 'accept' | 'reject' | 'pack') => call<{ order: Order }>('POST', `orders/${encodeURIComponent(id)}/${action}`, {}),
    /** All LocalRush products and shops, and every shop's prices and stock. */
    catalog: () => call<Catalog>('GET', 'catalog'),
    setStock: (pid: string, price: number, stock: number) => call<{ pid: string; price: number; stock: number }>('PUT', 'shop/stock', { pid, price, stock }),
    addProduct: (product: NewProduct) => call<{ product: Product }>('POST', 'shop/products', product),
    setPaused: (paused: boolean) => call<{ paused: boolean }>('PUT', 'shop/paused', { paused }),
    sales: (period: Period) => call<SalesReport>('GET', `shop/sales?period=${period}`),
  };
}

export type Api = ReturnType<typeof createApi>;
