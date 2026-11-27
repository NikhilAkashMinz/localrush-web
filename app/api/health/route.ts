// Health check. Kubernetes calls this to decide whether a copy of the site is ready,
// and the deploy pipeline calls it to confirm the new version is the one serving.
// It always answers 200 while the site itself is up: a database problem is reported in
// the reply, but it must not make Kubernetes restart a healthy web server.

import { adminEmails, adminPhones, loginMethod, missingSecret, mode } from '@/server/config';
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
    // "live" is the real service, "demo" the showcase with sample shops (server/config.ts).
    mode: mode(),
    // What still needs setting up, without revealing any value: "firebase" means logging in works.
    login: loginMethod(),
    sessionSecret: missingSecret() ? 'missing' : 'set',
    admins: adminEmails().length + adminPhones().length,
    time: new Date().toISOString(),
  });
}
