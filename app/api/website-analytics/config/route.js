import { ga4PublicConfig } from '@/lib/website-analytics/ga4';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* Public tag configuration for the storefront. Only the measurement ID and
   coarse site metadata are returned; the property ID, service account, private
   key and access tokens never leave the server. */
const DEFAULT_ORIGINS = [
  'https://ecom.wovenessence.in',
  'https://www.ecom.wovenessence.in',
  'https://wovenessence.in',
  'https://www.wovenessence.in',
  'https://wovenessence.etpl.ai',
];

function origins() {
  const configured = String(process.env.WEBSITE_ANALYTICS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...configured])];
}

function allowedOrigin(request) {
  const origin = request.headers.get('origin') || '';
  return origins().includes(origin) ? origin : '';
}

function headers(origin) {
  return {
    'Cache-Control': 'public, max-age=300, s-maxage=300',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req) {
  const origin = allowedOrigin(req);
  if (!origin) {
    return new Response(null, { status: 204, headers: { Vary: 'Origin' } });
  }
  return new Response(null, { status: 204, headers: headers(origin) });
}

export async function GET(req) {
  const origin = allowedOrigin(req);
  return Response.json(ga4PublicConfig(), { headers: headers(origin) });
}
