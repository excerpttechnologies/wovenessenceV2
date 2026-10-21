import dbConnect from '@/lib/db';
import StockTransferPacket from '@/models/StockTransferPacket';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS, computeTotals } from '@/app/admin/transaction/stocktransfers/transferstockpacket/fields';

/* /api/stock-transfer-packet/<id> - read one, update, delete.

   Locked once a Stock Transfer Location has claimed it: that document's lines
   were copied from these, so an edit here would put the pair out of step.
   Same rule the Inter Company Delivery Challan applies once invoiced. */

const json = (d, s = 200) => Response.json(d, { status: s });

function applyTotals(doc, body) {
  const items = Array.isArray(body.data?.items) ? body.data.items : [];
  const t = computeTotals(items);

  doc.items = items;
  doc.totalQty = t.totalQty;
  doc.taxableValue = t.taxableValue;
  doc.igstTotal = t.igstTotal;
  doc.cgstTotal = t.cgstTotal;
  doc.sgstTotal = t.sgstTotal;
  doc.netValue = t.netValue;
}

async function stampLocations(doc) {
  const [from, to] = await Promise.all([
    doc.fromLocationId ? CompanyLocation.findById(doc.fromLocationId).lean() : null,
    doc.toLocationId ? CompanyLocation.findById(doc.toLocationId).lean() : null,
  ]);

  const addr = (l) => [l?.addressLine1, l?.addressLine2, l?.city].filter(Boolean).join(', ');

  doc.fromGstn = from?.gstin || '';
  doc.fromAddress = addr(from);
  doc.fromState = from?.state || '';
  doc.toGstn = to?.gstin || '';
  doc.toAddress = addr(to);
  doc.toState = to?.state || '';
}

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await StockTransferPacket.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const existing = await StockTransferPacket.findById(id).select('stockTransferLocationId').lean();
  if (!existing) return json({ error: 'Not found' }, 404);
  if (existing.stockTransferLocationId) {
    return json(
      { error: 'This packet is already on a stock transfer location and cannot be edited.' },
      409
    );
  }

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (String(doc.fromLocationId) === String(doc.toLocationId)) {
    return json({
      errors: { toLocationId: 'The destination must be a different location from the source.' },
    }, 422);
  }

  applyTotals(doc, body);
  await stampLocations(doc);

  /* never overwrite the document number on edit */
  delete doc.packetNo;

  const updated = await StockTransferPacket.findByIdAndUpdate(id, doc, {
    new: true, runValidators: true,
  });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await StockTransferPacket.findById(id).select('stockTransferLocationId').lean();
  if (!existing) return json({ ok: true });
  if (existing.stockTransferLocationId) {
    return json(
      { error: 'This packet is on a stock transfer location. Delete that transfer first.' },
      409
    );
  }

  await StockTransferPacket.findByIdAndDelete(id);
  return json({ ok: true });
}
