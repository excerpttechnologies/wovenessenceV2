import crypto from 'crypto';

/* ==========================================================================
   e-Invoice provider - one switch, three backends.

     EINVOICE_MODE=mock     (default) everything answered locally - no GSTIN,
                            no credentials, no network. IRN / Ack No / signed
                            QR are FAKE but shaped exactly like the IRP's, and
                            every print says so.
     EINVOICE_MODE=sandbox  NIC test IRP     } same code path, different
     EINVOICE_MODE=live     NIC production   } base URL + credentials

   For sandbox / live set, in .env:
     EINVOICE_BASE_URL       e.g. https://einv-apisandbox.nic.in
     EINVOICE_CLIENT_ID      from the IRP "API Registration" screen
     EINVOICE_CLIENT_SECRET
     EINVOICE_USERNAME       the API user created on the IRP
     EINVOICE_PASSWORD
     EINVOICE_GSTIN          the GSTIN those credentials belong to
     EINVOICE_PUBLIC_KEY     NIC's public key (PEM, or the bare base64)

   generateIrn(payload) -> { irn, ackNo, ackDate, signedQrCode, signedInvoice }
   cancelIrn(irn, reasonCode, remark) -> { cancelDate }
   Both throw Error(message) on failure; the message is shown to the user.
   ========================================================================== */

export const einvoiceMode = () => {
  const m = String(process.env.EINVOICE_MODE || 'mock').trim().toLowerCase();
  return ['sandbox', 'live'].includes(m) ? m : 'mock';
};

export const CANCEL_REASONS = {
  1: 'Duplicate',
  2: 'Data entry mistake',
  3: 'Order cancelled',
  4: 'Others',
};

/* "yyyy-mm-dd hh:mm:ss" India time - the IRP's AckDt format */
const irpStamp = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ':' + p.second;
};

/* "yyyy-mm-dd hh:mm:ss" (IST) -> Date */
export const parseIrpStamp = (s) => {
  if (!s) return null;
  const x = new Date(String(s).replace(' ', 'T') + '+05:30');
  return Number.isNaN(x.getTime()) ? null : x;
};

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/* ------------------------------------------------------------------ mock */

const mock = {
  async generate(payload) {
    const { SellerDtls, BuyerDtls, DocDtls, ItemList, ValDtls } = payload;
    /* the real IRN is SHA-256 of GSTIN + FY + doc type + doc no; the date
       is part of the input here only so a re-generated mock never repeats */
    const irn = crypto.createHash('sha256')
      .update([SellerDtls.Gstin || 'MOCK', DocDtls.Dt, DocDtls.Typ, DocDtls.No].join('|'))
      .digest('hex');
    /* 15 digits, like a real Ack No */
    const ackNo = '1' + Date.now() + crypto.randomInt(0, 10);
    const ackDate = irpStamp();

    /* the signed QR is a JWT whose `data` claim carries these ten fields -
       same shape here, but unsigned and marked MOCK */
    const qrData = {
      SellerGstin: SellerDtls.Gstin,
      BuyerGstin: BuyerDtls.Gstin,
      DocNo: DocDtls.No,
      DocTyp: DocDtls.Typ,
      DocDt: DocDtls.Dt,
      TotInvVal: ValDtls.TotInvVal,
      ItemCnt: ItemList.length,
      MainHsnCode: ItemList[0]?.HsnCd || '',
      Irn: irn,
      IrnDt: ackDate,
    };
    const signedQrCode = [
      b64url({ alg: 'none', typ: 'JWT', kid: 'MOCK' }),
      b64url({ data: JSON.stringify(qrData), iss: 'MOCK-IRP (not valid for GST)' }),
      'MOCK-NOT-SIGNED',
    ].join('.');
    const signedInvoice = [
      b64url({ alg: 'none', typ: 'JWT', kid: 'MOCK' }),
      b64url({ data: JSON.stringify({ ...payload, AckNo: ackNo, AckDt: ackDate, Irn: irn }), iss: 'MOCK-IRP' }),
      'MOCK-NOT-SIGNED',
    ].join('.');

    return { irn, ackNo, ackDate, signedQrCode, signedInvoice };
  },

  async cancel() {
    return { cancelDate: irpStamp() };
  },
};

/* ------------------------------------------------------- NIC (direct API)

   Written to the NIC e-invoice API spec but NOT yet exercised against the
   sandbox (no credentials at the time of writing). When the sandbox
   credentials arrive, verify the three PATHS and the auth body encoding
   below against the NIC developer portal first.                          */

const PATHS = {
  auth: '/eivital/v1.04/auth',
  generate: '/eicore/v1.03/Invoice',
  cancel: '/eicore/v1.03/Invoice/Cancel',
};

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error('e-Invoice ' + einvoiceMode() + ' mode needs ' + k + ' in .env.');
  return v;
};

const publicKey = () => {
  const raw = env('EINVOICE_PUBLIC_KEY').replace(/\\n/g, '\n').trim();
  if (raw.startsWith('-----BEGIN')) return raw;
  return '-----BEGIN PUBLIC KEY-----\n' + raw.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
};

const aesEnc = (key, text) => {
  const c = crypto.createCipheriv('aes-256-ecb', key, null);
  return Buffer.concat([c.update(text), c.final()]).toString('base64');
};
const aesDec = (key, b64) => {
  const d = crypto.createDecipheriv('aes-256-ecb', key, null);
  return Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]);
};

/* decrypted response bodies come back either as JSON or base64(JSON) */
const parseData = (buf) => {
  const t = buf.toString('utf8');
  try { return JSON.parse(t); } catch { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); }
};

const irpError = (res) => {
  let list = res?.ErrorDetails;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = [{ ErrorMessage: list }]; } }
  const msg = (Array.isArray(list) ? list : [])
    .map((e) => (e.ErrorCode ? e.ErrorCode + ': ' : '') + (e.ErrorMessage || '')).join('; ');
  return new Error('IRP: ' + (msg || 'request failed'));
};

/* one session per server process, renewed a few minutes before expiry */
let session = null;

async function nicSession() {
  if (session && session.expires > Date.now() + 5 * 60 * 1000) return session;

  const appKey = crypto.randomBytes(32);
  const body = JSON.stringify({
    UserName: env('EINVOICE_USERNAME'),
    Password: env('EINVOICE_PASSWORD'),
    AppKey: appKey.toString('base64'),
    ForceRefreshAccessToken: false,
  });
  const Data = crypto.publicEncrypt(
    { key: publicKey(), padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(Buffer.from(body).toString('base64'))
  ).toString('base64');

  const r = await fetch(env('EINVOICE_BASE_URL') + PATHS.auth, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: env('EINVOICE_CLIENT_ID'),
      client_secret: env('EINVOICE_CLIENT_SECRET'),
      Gstin: env('EINVOICE_GSTIN'),
    },
    body: JSON.stringify({ Data }),
  });
  const res = await r.json().catch(() => null);
  if (!res || String(res.Status) !== '1') throw irpError(res);

  const d = typeof res.Data === 'string' ? JSON.parse(res.Data) : res.Data;
  session = {
    token: d.AuthToken,
    sek: aesDec(appKey, d.Sek),
    expires: new Date(d.TokenExpiry || Date.now() + 6 * 3600 * 1000).getTime(),
  };
  return session;
}

async function nicCall(path, json) {
  const s = await nicSession();
  const r = await fetch(env('EINVOICE_BASE_URL') + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: env('EINVOICE_CLIENT_ID'),
      client_secret: env('EINVOICE_CLIENT_SECRET'),
      Gstin: env('EINVOICE_GSTIN'),
      user_name: env('EINVOICE_USERNAME'),
      AuthToken: s.token,
    },
    body: JSON.stringify({ Data: aesEnc(s.sek, JSON.stringify(json)) }),
  });
  const res = await r.json().catch(() => null);
  if (!res || String(res.Status) !== '1') {
    /* a dead token - drop it so the next attempt logs in again */
    if (r.status === 401) session = null;
    throw irpError(res);
  }
  return parseData(aesDec(s.sek, res.Data));
}

const nic = {
  async generate(payload) {
    const d = await nicCall(PATHS.generate, payload);
    return {
      irn: d.Irn,
      ackNo: String(d.AckNo),
      ackDate: d.AckDt,
      signedQrCode: d.SignedQRCode,
      signedInvoice: d.SignedInvoice,
    };
  },
  async cancel(irn, reason, remark) {
    const d = await nicCall(PATHS.cancel, { Irn: irn, CnlRsn: String(reason), CnlRem: remark });
    return { cancelDate: d.CancelDate };
  },
};

/* --------------------------------------------------------------- public */

const backend = () => (einvoiceMode() === 'mock' ? mock : nic);

export const generateIrn = (payload) => backend().generate(payload);
export const cancelIrn = (irn, reason, remark) => backend().cancel(irn, reason, remark);
