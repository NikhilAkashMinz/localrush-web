// Every /api/... address except /api/health is answered by server/api.ts.
import { handle } from '@/server/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
