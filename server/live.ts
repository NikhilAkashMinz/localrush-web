// The live stream (server-sent events). A browser keeps one connection open to /api/live;
// whenever something it cares about changes, the server sends a short message and the page
// re-reads the data. The stream only says "something changed", so a missed message can
// never leave a page showing wrong data for long.

import type { Repo, User } from './types';

/** Which change counters a user's pages should follow. */
export function channelsFor(user: User | null): string[] {
  if (!user) return ['catalog'];
  if (user.role === 'shop') return ['catalog', 'store:' + user.storeId];
  if (user.role === 'partner') return ['partners', 'partner:' + user.id];
  return ['catalog', 'user:' + user.id];
}

const kind = (channel: string) => (channel === 'catalog' ? 'catalog' : 'orders');

/** A stream is closed after this long; the browser reconnects on its own. Keeps any leak bounded. */
const MAX_LIFE_MS = 10 * 60 * 1000;

export function liveResponse(repo: Repo, channels: string[], request: Request, everyMs = 1000): Response {
  // Hold on to the request itself, not just its signal: if the request object is garbage
  // collected, its signal can stop hearing about the browser disconnecting.
  const signal = request.signal;
  const startedAt = Date.now();
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const stop = () => {
        clearInterval(timer);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
      };
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      signal.addEventListener('abort', stop);

      // Note the counters first, then say hello: anything that changes after this point is
      // reported, and the page loads fresh data on hello, so no change can slip between.
      let last = await repo.versions(channels).catch(() => channels.map(() => 0));
      // The browser may have gone away while we were reading; do not start a timer for nobody.
      if (closed || signal.aborted) return stop();

      // "retry" tells the browser how soon to reconnect; "hello" tells the page to load fresh data.
      send('retry: 3000\n\n');
      send(`data: ${JSON.stringify({ hello: true })}\n\n`);

      let quiet = 0;
      timer = setInterval(async () => {
        if (closed || request.signal.aborted || Date.now() - startedAt > MAX_LIFE_MS) return stop();
        try {
          const now = await repo.versions(channels);
          const changed = [...new Set(channels.filter((_, i) => now[i] !== last[i]).map(kind))];
          last = now;
          if (changed.length) send(`data: ${JSON.stringify({ changed })}\n\n`);
          else if (++quiet % 15 === 0) send(': still here\n\n');
        } catch {
          // The database was briefly unreachable; try again on the next tick.
        }
      }, everyMs);
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
