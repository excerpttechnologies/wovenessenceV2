import { requireSession } from '@/lib/session';
import { lookupGstin, isGstLookupConfigured, GST_PROVIDER_ENV } from '@/lib/gstLookup';
import { GSTIN_RE, normalizeGstin } from '@/lib/gstin';

/* /api/gst/lookup - resolve a GSTIN to taxpayer details.

   This exists so the browser never sees the provider URL or the API key. The
   client posts a GSTIN here, this route calls the configured provider with the
   credentials held in the server environment, and only the normalised, form
   shaped result goes back.

   There is deliberately NO built-in provider and no hardcoded endpoint: GSTIN
   lookup is a paid third-party service and every reseller has its own host and
   auth header. Until the two environment variables are set the route reports
   501 with the variable names, which is an honest "not configured yet" rather
   than a request to an address nobody chose. */

const json = (d, s = 200) => Response.json(d, { status: s });

/* Format check only. It is worth doing here as well as in the browser so a
   malformed code never reaches - and never gets billed by - the provider.
   GSTIN_RE is lib/gstin.js's, the same rule the supplier form and API use. */

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const gstin = normalizeGstin(body.gstin);
  if (!gstin) return json({ error: 'Enter a GSTIN.' }, 400);
  if (!GSTIN_RE.test(gstin)) {
    return json({ error: 'That is not a valid GSTIN. It should be 15 characters, e.g. 22AAAAA0000A1Z5.' }, 400);
  }

  if (!isGstLookupConfigured()) {
    return json({
      error: 'GST lookup is not configured on this server yet.',
      /* the operator sees which variables to set; no value is ever echoed */
      configured: false,
      requires: GST_PROVIDER_ENV,
    }, 501);
  }

  try {
    const result = await lookupGstin(gstin);
    if (!result.ok) return json({ error: result.error || 'GSTIN not found.' }, result.status || 404);
    return json({ ok: true, gstin, data: result.data });
  } catch (error) {
    console.error('GST lookup failed', error);
    /* the provider's own message can carry the key or the account id, so it is
       logged server-side and not returned */
    return json({ error: 'Could not reach the GST service. Try again.' }, 502);
  }
}
