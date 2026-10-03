// Health check. Kubernetes calls this to decide whether a copy of the site is ready,
// and the deploy pipeline calls it to confirm the new version is the one serving.
// It always answers 200 while the site itself is up: a database problem is reported in
// the reply, but it must not make Kubernetes restart a healthy web server.

import { getRepo, storeMode } from '@/server/repo';

export const dynamic = 'force-dynamic';

async function database(): Promise<string> {
  if (storeMode() === 'memory') return 'not used';
  const slow = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500));
  const ping = getRepo()
    .then((repo) => repo.ping())
    .catch(() => false);
  return (await Promise.race([ping, slow])) ? 'connected' : 'unreachable';
}

export async function GET() {
  return Response.json({
    status: 'ok',
    // The commit this image was built from, set by the pipeline at build time.
    version: process.env.APP_VERSION ?? 'dev',
    // "memory" keeps data only while the server runs; "mongo" is the real database.
    storage: storeMode(),
    database: await database(),
    time: new Date().toISOString(),
  });
}
