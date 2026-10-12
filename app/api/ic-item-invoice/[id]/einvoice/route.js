import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import IcItemInvoice from '@/models/IcItemInvoice';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { buildPayload, loadParties } from '@/lib/einvoice/payload';
import {
  einvoiceMode, generateIrn, cancelIrn, parseIrpStamp, CANCEL_REASONS,
} from '@/lib/einvoice/provider';

/* /api/ic-item-invoice/<id>/einvoice - GST e-Invoice (IRN) for one
   consignment sales invoice.

   GET   { mode, einvoice, payload, problems } - the IRP request this invoice
         would send, and what the real IRP would reject in it
   POST  { action: 'generate' }                 register it, get the IRN
         { action: 'cancel', reason: 1-4, remark }  cancel the IRN (IRP
                                                 allows this within 24 h)

   Writes go through the RAW DRIVER (.collection), as the rest of the IC
   flow does, so a dev server holding the model compiled before the
   `einvoice` field existed cannot drop them silently.

   Only the IRN is cancelled - the invoice itself and its billed units are
   left exactly as they are. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

const IC_SI = { screen: SCREENS.IC_ITEM_INVOICE, label: 'inter company sales invoices' };
/* a PENDING older than this is a crashed attempt and may be retried */
const STALE_MS = 2 * 60 * 1000;
const CANCEL_WINDOW_MS = 24 * 3600 * 1000;

/* what the client may see - the long signed blobs stay on the server */
const view = (e) => (e ? {
  status: e.status || '',
  mode: e.mode || '',
  irn: e.irn || '',
  ackNo: e.ackNo || '',
  ackDate: e.ackDate || null,
  generatedAt: e.generatedAt || null,
  generatedBy: e.generatedBy || '',
  error: e.error || '',
  cancelledAt: e.cancelledAt || null,
  cancelReason: e.cancelReason || '',
  cancelRemark: e.cancelRemark || '',
  cancellable: e.status === 'GENERATED' && !!e.ackDate
    && Date.now() - new Date(e.ackDate).getTime() < CANCEL_WINDOW_MS,
} : null);

async function load(req, params, action) {
  const session = await requireSession();
  if (!session) return { fail: json({ error: 'Unauthorized' }, 401) };

  const { id } = await params;
  if (!isValidObjectId(id)) return { fail: json({ error: 'Not found' }, 404) };
  await dbConnect();

  const inv = await IcItemInvoice.collection.findOne({ _id: new Types.ObjectId(id) });
  if (!inv) return { fail: json({ error: 'Not found' }, 404) };

  const denied = await screenDenial({ session, ...IC_SI, action, businessId: inv.businessId });
  if (denied) return { fail: json({ error: denied.message, code: denied.code }, 403) };

  return { session, inv };
}

export async function GET(req, { params }) {
  const { fail, inv } = await load(req, params, PERM.READ);
  if (fail) return fail;

  const { payload, problems } = buildPayload(inv, await loadParties(inv));
  return json({ mode: einvoiceMode(), einvoice: view(inv.einvoice), payload, problems });
}

export async function POST(req, { params }) {
  const body = await req.json().catch(() => ({}));
  const action = body.action === 'cancel' ? 'cancel' : 'generate';

  const { fail, session, inv } = await load(req, params, action === 'cancel' ? PERM.DELETE : PERM.CREATE);
  if (fail) return fail;

  const who = session.name || session.email || '';
  const col = IcItemInvoice.collection;
  const mode = einvoiceMode();

  /* ------------------------------------------------------------ cancel */
  if (action === 'cancel') {
    const e = inv.einvoice;
    if (!e || e.status !== 'GENERATED') return json({ error: 'This invoice has no active IRN to cancel.' }, 409);
    if (!view(e).cancellable) {
      return json({ error: 'The IRP only allows an IRN to be cancelled within 24 hours of generation. Raise a credit note instead.' }, 409);
    }
    if (e.mode !== mode) {
      return json({ error: 'This IRN was generated in ' + e.mode + ' mode; the server is now in ' + mode + ' mode.' }, 409);
    }
    const reason = Number(body.reason);
    if (!CANCEL_REASONS[reason]) return json({ error: 'Pick a cancellation reason.' }, 422);
    const remark = String(body.remark || CANCEL_REASONS[reason]).trim().slice(0, 100);

    try {
      const out = await cancelIrn(e.irn, reason, remark);
      await col.updateOne(
        { _id: inv._id, 'einvoice.status': 'GENERATED', 'einvoice.irn': e.irn },
        {
          $set: {
            'einvoice.status': 'CANCELLED',
            'einvoice.cancelledAt': parseIrpStamp(out.cancelDate) || new Date(),
            'einvoice.cancelledBy': who,
            'einvoice.cancelReason': CANCEL_REASONS[reason],
            'einvoice.cancelRemark': remark,
          },
        }
      );
    } catch (err) {
      return json({ error: err.message || 'Could not cancel the IRN.' }, 502);
    }
    const fresh = await col.findOne({ _id: inv._id });
    return json({ ok: true, mode, einvoice: view(fresh.einvoice) });
  }

  /* ---------------------------------------------------------- generate */
  const cur = inv.einvoice;
  if (cur?.status === 'GENERATED') {
    return json({ ok: true, mode, einvoice: view(cur), already: true });
  }
  /* the last attempt (a cancelled IRN, a failure) is kept one level deep */
  const prev = cur ? (({ previous, ...rest }) => rest)(cur) : null;

  const { payload, problems } = buildPayload(inv, await loadParties(inv));
  /* the real IRP rejects these - only the mock lets them through, so the
     flow can be tried before every master is filled in */
  if (problems.length && mode !== 'mock') {
    return json({ error: 'Fix these before generating the IRN:', problems }, 422);
  }

  /* claim the invoice so a double click cannot register it twice */
  const claim = await col.updateOne(
    {
      _id: inv._id,
      $or: [
        { einvoice: null },
        { einvoice: { $exists: false } },
        { 'einvoice.status': { $in: ['FAILED', 'CANCELLED'] } },
        { 'einvoice.status': 'PENDING', 'einvoice.startedAt': { $lt: new Date(Date.now() - STALE_MS) } },
      ],
    },
    { $set: { einvoice: { status: 'PENDING', mode, startedAt: new Date(), startedBy: who, previous: prev } } }
  );
  if (!claim.modifiedCount) {
    return json({ error: 'An IRN is already being generated for this invoice. Wait a moment and refresh.' }, 409);
  }

  try {
    const out = await generateIrn(payload);
    await col.updateOne(
      { _id: inv._id, 'einvoice.status': 'PENDING' },
      {
        $set: {
          einvoice: {
            status: 'GENERATED',
            mode,
            irn: out.irn,
            ackNo: out.ackNo,
            ackDate: parseIrpStamp(out.ackDate) || new Date(),
            signedQrCode: out.signedQrCode,
            signedInvoice: out.signedInvoice,
            request: payload,
            generatedAt: new Date(),
            generatedBy: who,
            previous: prev,
          },
        },
      }
    );
  } catch (err) {
    await col.updateOne(
      { _id: inv._id, 'einvoice.status': 'PENDING' },
      {
        $set: {
          einvoice: {
            status: 'FAILED', mode, error: err.message || 'IRP request failed', request: payload, previous: prev,
          },
        },
      }
    );
    return json({ error: err.message || 'Could not generate the IRN.' }, 502);
  }

  const fresh = await col.findOne({ _id: inv._id });
  return json({ ok: true, mode, einvoice: view(fresh.einvoice), warnings: problems });
}
