// The HTTP API. One function takes a web Request and returns a Response, so it runs the
// same under Next.js (app/api/[...path]/route.ts) and in the tests, with no framework needed.
//
//   GET    /api/catalog                    everyone       products, shops, stock
//   POST   /api/auth/login                 everyone       { name, phone, code }
//   POST   /api/auth/logout
//   GET    /api/me                         everyone       the logged-in user, or null
//   PATCH  /api/me                         logged in      { name }
//   DELETE /api/me/addresses/:id           logged in
//   GET    /api/orders                     logged in      orders for this user's role
//   POST   /api/orders                     customer       place an order
//   GET    /api/orders/:id                 logged in
//   POST   /api/orders/:id/:action         by role        accept, reject, pack, claim, pickup, deliver, cancel
//   PUT    /api/shop/stock                 shop owner     { pid, price, stock }
//   POST   /api/shop/products              shop owner     add a new product
//   PUT    /api/shop/paused                shop owner     { paused }
//   PUT    /api/partner                    partner        { online, place }
//   GET    /api/live                       everyone       server-sent events

import { channelsFor, liveResponse } from './live';
import { getRepo } from './repo';
import * as service from './service';
import { ApiError } from './service';
import { clearCookie, readSession, sessionCookie } from './session';
import type { Repo, User } from './types';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 20_000) throw new ApiError(413, 'That request is too large.');
  if (!text) return {};
  try {
    const data: unknown = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    throw new ApiError(400, 'The request was not valid JSON.');
  }
}

async function currentUser(repo: Repo, request: Request): Promise<User | null> {
  const id = readSession(request);
  return id ? repo.userById(id) : null;
}

function need(user: User | null): User {
  if (!user) throw new ApiError(401, 'Log in to continue.', 'login');
  return user;
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const route = `${request.method} ${parts[0] ?? ''}${parts[1] && parts[0] !== 'orders' && parts[0] !== 'me' ? '/' + parts[1] : ''}`;

  try {
    const repo = await getRepo();
    const user = await currentUser(repo, request);

    switch (route) {
      case 'GET catalog':
        return json(await service.catalogue(repo));

      case 'POST auth/login': {
        const who = await service.login(repo, await body(request));
        return json({ user: service.publicUser(who) }, 200, { 'Set-Cookie': sessionCookie(who.id) });
      }
      case 'POST auth/logout':
        return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

      case 'GET me':
        return json({ user: user ? service.publicUser(user) : null });
      case 'PATCH me':
        return json({ user: service.publicUser(await service.rename(repo, need(user), (await body(request)).name)) });
      case 'DELETE me':
        if (parts[1] !== 'addresses' || !parts[2]) break;
        return json({ user: service.publicUser(await service.deleteAddress(repo, need(user), parts[2])) });

      case 'GET orders':
        if (parts[1]) return json({ order: await service.getOrder(repo, need(user), parts[1]) });
        return json(await service.listOrders(repo, need(user)));
      case 'POST orders': {
        if (parts[1] && parts[2]) {
          return json({ order: await service.act(repo, need(user), parts[1], parts[2], await body(request)) });
        }
        if (parts[1]) break;
        const result = await service.placeOrder(repo, need(user), await body(request));
        const fresh = await repo.userById(need(user).id);
        return json({ ...result, user: fresh ? service.publicUser(fresh) : null }, 201);
      }

      case 'PUT shop/stock':
        return json(await service.setStock(repo, need(user), await body(request)));
      case 'POST shop/products':
        return json({ product: await service.addProduct(repo, need(user), await body(request)) }, 201);
      case 'PUT shop/paused':
        return json(await service.setPaused(repo, need(user), (await body(request)).paused));

      case 'PUT partner':
        return json({ user: service.publicUser(await service.setPartner(repo, need(user), await body(request))) });

      case 'GET live':
        return liveResponse(repo, channelsFor(user), request);
    }
    return json({ error: 'There is nothing at this address.' }, 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message, code: e.code }, e.status);
    console.error('[localrush] API error on', route, e);
    const down = process.env.MONGODB_URI ? 'The database could not be reached. Try again in a moment.' : 'Something went wrong on the server.';
    return json({ error: down }, process.env.MONGODB_URI ? 503 : 500);
  }
}
