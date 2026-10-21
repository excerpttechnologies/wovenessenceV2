/* GSTIN lookup service layer.

   Server-only. Nothing here may be imported from a client component: it reads
   the provider credentials out of the environment, and anything bundled for
   the browser would ship them to every visitor.

   WHY THERE IS NO DEFAULT PROVIDER
   GSTIN-to-taxpayer lookup is a paid third-party API and there is no single
   public endpoint to fall back on - every reseller (and the GSTN sandbox
   itself) has its own host, its own auth header and its own envelope. Guessing
   one would mean shipping a URL that nobody signed up for and that fails at
   runtime with a confusing error. So the host and key come from the
   environment, and until they are set the caller is told exactly that.

   TO ENABLE IT
     GST_API_URL   the provider's lookup endpoint. If it contains {gstin} the
                   code is substituted there; otherwise it is appended as a
                   ?gstin= query parameter.
     GST_API_KEY   sent as the value of the header named by GST_API_KEY_HEADER
                   (default "x-api-key"). Never leaves the server.

   Optional:
     GST_API_KEY_HEADER   header name for the key, default "x-api-key"
     GST_API_TIMEOUT_MS   request timeout, default 10000 */

export const GST_PROVIDER_ENV = ['GST_API_URL', 'GST_API_KEY'];

export function isGstLookupConfigured() {
  return Boolean(process.env.GST_API_URL && process.env.GST_API_KEY);
}

/* The first two characters of a GSTIN are the state code, so the state can be
   filled in even when the provider omits it from the address block. */
const STATE_BY_CODE = {
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI', '08': 'RAJASTHAN', '09': 'UTTAR PRADESH',
  '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH', '13': 'NAGALAND', '14': 'MANIPUR',
  '15': 'MIZORAM', '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL',
  '20': 'JHARKHAND', '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH',
  '24': 'GUJARAT', '25': 'DAMAN AND DIU', '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  '27': 'MAHARASHTRA', '28': 'ANDHRA PRADESH', '29': 'KARNATAKA', '30': 'GOA',
  '31': 'LAKSHADWEEP', '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY',
  '35': 'ANDAMAN AND NICOBAR ISLANDS', '36': 'TELANGANA', '37': 'ANDHRA PRADESH',
  '38': 'LADAKH', '97': 'OTHER TERRITORY',
};

export function stateFromGstin(gstin) {
  return STATE_BY_CODE[String(gstin || '').slice(0, 2)] || '';
}

export function stateCodeFromGstin(gstin) {
  const code = String(gstin || '').slice(0, 2);
  return /^[0-9]{2}$/.test(code) ? code : '';
}

const pick = (...values) => {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
};

/* Providers wrap the taxpayer record differently - some return it at the top
   level, most nest it under data/result/taxpayerInfo. Unwrap whichever we got
   rather than demanding one shape. */
function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return payload.taxpayerInfo || payload.data?.taxpayerInfo || payload.data || payload.result || payload;
}

/* The GSTN field names (lgnm, tradeNam, pradr.addr.*) are the de-facto
   standard: resellers pass the government envelope through largely untouched.
   Longer aliases are accepted alongside them for the ones that do rename. */
export function normalizeTaxpayer(payload, gstin) {
  const t = unwrap(payload);
  const addr = t.pradr?.addr || t.primaryAddress || t.address || {};

  const line1 = pick(
    [pick(addr.bno, addr.buildingNumber), pick(addr.bnm, addr.buildingName), pick(addr.flno, addr.floorNumber)]
      .filter(Boolean).join(', '),
    addr.addressLine1, t.addressLine1,
  );
  const line2 = pick(
    [pick(addr.st, addr.street), pick(addr.loc, addr.location, addr.locality)].filter(Boolean).join(', '),
    addr.addressLine2, t.addressLine2,
  );

  return {
    gstin: pick(t.gstin, t.gstNo, gstin).toUpperCase(),
    legalName: pick(t.lgnm, t.legalName, t.legal_name),
    tradeName: pick(t.tradeNam, t.tradeName, t.trade_name),
    addressLine1: line1,
    addressLine2: line2,
    city: pick(addr.dst, addr.city, addr.district, addr.loc),
    state: pick(addr.stcd, addr.state, t.state) || stateFromGstin(gstin),
    stateCode: pick(addr.stcode, t.stateCode) || stateCodeFromGstin(gstin),
    pincode: pick(addr.pncd, addr.pincode, addr.zip, addr.postalCode),
    country: 'INDIA',
    mobile: pick(t.mobNum, t.mobile, t.contactNumber, addr.mobNum),
    email: pick(t.email, t.emailId, addr.email),
    /* registration metadata - shown in the preview, mapped only where the
       supplier form has a matching field */
    registrationDate: pick(t.rgdt, t.registrationDate),
    taxpayerType: pick(t.dty, t.ctb, t.taxpayerType),
    status: pick(t.sts, t.status),
  };
}

export async function lookupGstin(gstin) {
  const base = process.env.GST_API_URL;
  const key = process.env.GST_API_KEY;
  const header = process.env.GST_API_KEY_HEADER || 'x-api-key';
  const timeout = Number(process.env.GST_API_TIMEOUT_MS || 10000);

  const url = base.includes('{gstin}')
    ? base.replace('{gstin}', encodeURIComponent(gstin))
    : base + (base.includes('?') ? '&' : '?') + 'gstin=' + encodeURIComponent(gstin);

  /* a hung provider must not hold the request open indefinitely */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', [header]: key },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status === 404) return { ok: false, status: 404, error: 'No taxpayer found for that GSTIN.' };
    if (!response.ok) return { ok: false, status: 502, error: `GST service returned ${response.status}.` };

    const payload = await response.json();
    const data = normalizeTaxpayer(payload, gstin);
    if (!data.legalName && !data.tradeName && !data.addressLine1) {
      return { ok: false, status: 404, error: 'The GST service returned no details for that GSTIN.' };
    }
    return { ok: true, data };
  } finally {
    clearTimeout(timer);
  }
}
