// Health check. Kubernetes calls this to decide whether a copy of the site is ready,
// and the deploy pipeline calls it to confirm the new version is the one serving.

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    // The commit this image was built from, set by the pipeline at build time.
    version: process.env.APP_VERSION ?? 'dev',
    time: new Date().toISOString(),
  });
}
