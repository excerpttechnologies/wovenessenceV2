import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import IcItemInvoice from '@/models/IcItemInvoice';
import IcPurchaseReceived from '@/models/IcPurchaseReceived';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { nextDocNumber } from '@/lib/docnumber';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/ic-purchase-received - the RECEIVER's Auto Purchases Receiveds.

   GET  ?business=<receiver>&location=<receiver loc>&view=pending
        the senders' consignment Sales Invoices raised ON this receiver
        whose e-invoice (IRN) is GENERATED and that it has not saved yet -
        with every line, and a suggested Product Group per line
   GET  ...&view=received
        what this receiver has saved, newest first
   POST { business, location, finYear,
          data: { invoiceId, lines: [{ productGroupId, productGroupName, hsn }] } }
        saves ONE invoice as received. Record only - no stock moves (the
        stock came in on the Delivery Challan). One record per invoice,
        enforced by a unique index as well as the check below.

   The sender's invoices are read through the RAW DRIVER, as elsewhere in
   the IC flow: `einvoice` is newer than the compiled model a dev server may
   still hold, and a strict query would drop that filter silently. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

const IC_PR = { screen: SCREENS.IC_PURCHASE_RECEIVED, label: 'auto purchases received' };
const oid = (v) => new Types.ObjectId(String(v));
const str = (v) => String(v ?? '');

async function nameMaps(invoices) {
  const bizIds = [...new Set(invoices.map((i) => str(i.businessId)).filter(isValidObjectId))];
  const locIds = [...new Set(invoices.map((i) => str(i.locationId)).filter(isValidObjectId))];
  const [biz, locs] = await Promise.all([
    bizIds.length ? Business.find({ _id: { $in: bizIds } }).select('name businessPrintName').lean() : [],
    locIds.length ? CompanyLocation.find({ _id: { $in: locIds } }).select('name businessPrintName').lean() : [],
  ]);
  return {
    bizName: new Map(biz.map((b) => [str(b._id), b.name || b.businessPrintName || ''])),
    locName: new Map(locs.map((l) => [str(l._id), l.name || l.businessPrintName || ''])),
  };
}

/* Each line's Product Group NAME, so the receiver's picker can preselect the
   group of the same name (user, 14-10-2026: shown by default, changeable).
   Read from the BARCODE row the unit was sold on when its groupId is a real
   Product Group id, else from the Item master by item code / name (barcode
   rows often carry a non-id group code such as "pc-102"). */
async function lineGroups(invoices) {
  const lines = invoices.flatMap((i) => i.items || []);
  const ids = [...new Set(lines.flatMap((l) => [str(l.barcodeId), str(l.sourceBarcodeId)]).filter(isValidObjectId))];
  const rows = ids.length
    ? await BarcodeLabel.collection.find({ _id: { $in: ids.map(oid) } }, { projection: { groupId: 1, itemCode: 1 } }).toArray()
    : [];
  const rowGroup = new Map(rows.map((r) => [str(r._id), str(r.groupId)]));

  /* the Item master keeps the code in `name` on most rows (itemCode is
     blank there), so either field matches */
  const codes = [...new Set(lines.map((l) => l.itemCode).filter(Boolean))];
  const items = codes.length
    ? await Item.find({ $or: [{ itemCode: { $in: codes } }, { name: { $in: codes } }], subGroupId: { $ne: null } })
      .select('itemCode name subGroupId').lean()
    : [];
  const itemGroup = new Map();
  items.forEach((i) => {
    [i.itemCode, i.name].filter(Boolean).forEach((k) => { if (!itemGroup.has(k)) itemGroup.set(k, str(i.subGroupId)); });
  });

  const groupIdOf = (l) => [rowGroup.get(str(l.barcodeId)), rowGroup.get(str(l.sourceBarcodeId)), itemGroup.get(l.itemCode)]
    .find(isValidObjectId) || '';
  const gIds = [...new Set(lines.map(groupIdOf).filter(Boolean))];
  const groups = gIds.length ? await ProductGroup.find({ _id: { $in: gIds } }).select('name').lean() : [];
  const gName = new Map(groups.map((g) => [str(g._id), g.name || '']));
  return (l) => gName.get(groupIdOf(l)) || '';
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const business = sp.get('business');
  const location = sp.get('location');
  if (!business || !isValidObjectId(business)) return json({ rows: [] });

  await dbConnect();
  const denied = await screenDenial({ session, ...IC_PR, action: PERM.READ, businessId: business });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  /* ------------------------------------------------------ received ----- */
  if (sp.get('view') === 'received') {
    const filter = { businessId: business };
    if (location && isValidObjectId(location)) filter.locationId = location;
    const rows = await IcPurchaseReceived.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    return json({ rows: rows.map((r) => ({ ...r, _id: str(r._id) })) });
  }

  /* ------------------------------------------------------- pending ----- */
  const match = { toBusinessId: oid(business), 'einvoice.status': 'GENERATED' };
  /* this receiver location's invoices, plus any raised without a location */
  if (location && isValidObjectId(location)) match.toLocationId = { $in: [oid(location), null] };
  const invoices = await IcItemInvoice.collection.find(match).sort({ createdAt: -1 }).limit(200).toArray();

  const done = new Set((await IcPurchaseReceived.find({ icItemInvoiceId: { $in: invoices.map((i) => i._id) } })
    .select('icItemInvoiceId').lean()).map((r) => str(r.icItemInvoiceId)));
  const open = invoices.filter((i) => !done.has(str(i._id)));

  const { bizName, locName } = await nameMaps(open);
  const groupOf = await lineGroups(open);

  return json({
    rows: open.map((i) => ({
      invoiceId: str(i._id),
      invoiceNo: i.invoiceNo || '',
      invoiceDate: i.invoiceDate || i.createdAt,
      irn: i.einvoice?.irn || '',
      fromBusinessId: str(i.businessId),
      fromLocationId: str(i.locationId),
      fromBusinessName: bizName.get(str(i.businessId)) || '',
      fromLocationName: locName.get(str(i.locationId)) || '',
      items: (i.items || []).map((l) => ({ ...l, suggestedGroup: groupOf(l) })),
      totalQty: Number(i.totalQty || 0),
      taxableValue: Number(i.taxableValue || 0),
      igstTotal: Number(i.igstTotal || 0),
      cgstTotal: Number(i.cgstTotal || 0),
      sgstTotal: Number(i.sgstTotal || 0),
      roundOff: Number(i.roundOff || 0),
      netValue: Number(i.netValue || 0),
    })),
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const business = isValidObjectId(body.business) ? body.business : null;
  const location = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';
  const invoiceId = body.data?.invoiceId;
  if (!business) return json({ error: 'No business selected.' }, 422);
  if (!isValidObjectId(invoiceId)) return json({ error: 'No invoice chosen.' }, 422);

  await dbConnect();
  const denied = await screenDenial({ session, ...IC_PR, action: PERM.CREATE, businessId: business });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const inv = await IcItemInvoice.collection.findOne({ _id: oid(invoiceId) });
  if (!inv) return json({ error: 'That invoice no longer exists.' }, 404);
  if (str(inv.toBusinessId) !== str(business)) {
    return json({ error: 'This invoice was not raised on the selected business.' }, 403);
  }
  if (inv.einvoice?.status !== 'GENERATED') {
    return json({ error: 'The sender has not generated the e-invoice (IRN) for this invoice yet.' }, 409);
  }
  if (await IcPurchaseReceived.exists({ icItemInvoiceId: inv._id })) {
    return json({ error: 'Invoice ' + (inv.invoiceNo || '') + ' has already been received.' }, 409);
  }

  /* the receiver's corrections, line by line, in the invoice's own order */
  const edits = Array.isArray(body.data?.lines) ? body.data.lines : [];
  const items = (inv.items || []).map((l, n) => {
    const e = edits[n] || {};
    return {
      ...l,
      productGroupId: isValidObjectId(e.productGroupId) ? str(e.productGroupId) : '',
      productGroupName: str(e.productGroupName).trim(),
      /* `hsn` is what the receiver kept; `invoiceHsn` what the sender
         invoiced - the View popup shows both as Old / Received */
      invoiceHsn: l.hsn || '',
      hsn: str(e.hsn).trim() || l.hsn || '',
    };
  });

  const { bizName, locName } = await nameMaps([inv]);

  let recNo = await nextDocNumber(IcPurchaseReceived, 'recNo', 'Auto Purchase Received', {
    businessId: business, locationId: location, finYear,
  });
  /* bare digits when no Doc Setup series exists - "APR0001" reads better */
  if (/^\d/.test(recNo)) recNo = 'APR' + recNo;

  try {
    const rec = await IcPurchaseReceived.create({
      businessId: business,
      locationId: location,
      finYear,
      recNo,
      receivedAt: new Date(),
      icItemInvoiceId: inv._id,
      invoiceNo: inv.invoiceNo || '',
      invoiceDate: inv.invoiceDate || inv.createdAt || null,
      irn: inv.einvoice?.irn || '',
      fromBusinessId: inv.businessId || null,
      fromLocationId: inv.locationId || null,
      fromBusinessName: bizName.get(str(inv.businessId)) || '',
      fromLocationName: locName.get(str(inv.locationId)) || '',
      items,
      totalQty: Number(inv.totalQty || 0),
      taxableValue: Number(inv.taxableValue || 0),
      igstTotal: Number(inv.igstTotal || 0),
      cgstTotal: Number(inv.cgstTotal || 0),
      sgstTotal: Number(inv.sgstTotal || 0),
      roundOff: Number(inv.roundOff || 0),
      netValue: Number(inv.netValue || 0),
      createdBy: session.name || session.email || '',
    });
    return json({ ok: true, id: str(rec._id), recNo }, 201);
  } catch (err) {
    /* two people saving the same invoice at once - the unique index wins */
    if (err?.code === 11000) {
      return json({ error: 'Invoice ' + (inv.invoiceNo || '') + ' has already been received.' }, 409);
    }
    throw err;
  }
}
