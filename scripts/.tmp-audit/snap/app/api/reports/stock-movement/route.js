import { Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import CompanyLocation from '@/models/CompanyLocation';
import { json, r2, scopeOf, pageOf, paged } from '@/lib/reports';

/* /api/reports/stock-movement - read-only.

   The operational report the business runs daily: every stock event in a
   window, five ways.

     daily      one row per day - what came in, what went out, net
     bytype     one row per event type - received, transferred, sold, returned
     bylocation one row per location - what it took in and sent out
     bybarcode  one row per barcode - its whole movement in the window
     bydocument one row per document - GRC, transfer, invoice, credit note

   Every figure comes from models/StockMovement.js, which is written by the
   same transaction that moves the stock. Nothing here is estimated,
   reconstructed or seeded: a window with no trading returns empty rows and
   says so, rather than inventing activity.

   That last point matters for the "report for the whole of August"
   requirement. This route reports whatever the ledger holds for the dates
   asked for. Movements are recorded from the moment the ledger was
   introduced, so a window that predates it reports the documents that exist
   and flags the gap in `coverage` - see below - instead of fabricating
   history that was never captured. */

export const GET = handler(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = ['bytype', 'bylocation', 'bybarcode', 'bydocument'].includes(sp.get('tab'))
    ? sp.get('tab') : 'daily';

  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  if (!from || !to) return json({ error: 'Date From and Date To are required.' }, 422);

  const start = new Date(from);
  const end = new Date(to + 'T23:59:59.999');

  const match = { at: { $gte: start, $lte: end } };
  if (scope.businessId) match.businessId = toId(scope.businessId);
  if (scope.finYear) match.finYear = scope.finYear;
  if (scope.locationId) {
    match.$or = [
      { fromLocationId: toId(scope.locationId) },
      { toLocationId: toId(scope.locationId) },
    ];
  }
  const type = sp.get('type');
  if (type && MOVEMENT_TYPES[type]) match.type = type;

  const rows = await StockMovement.find(match).sort({ at: -1 }).limit(20000).lean();

  /* location names, resolved once for every shape below */
  const locIds = [...new Set(
    rows.flatMap((r) => [r.fromLocationId, r.toLocationId]).filter(Boolean).map(String)
  )];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name businessPrintName').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || l.businessPrintName || '']));
  const nameOf = (id) => (id ? locName.get(String(id)) || '(unknown)' : '-');

  const inQty = (r) => (r.qty > 0 ? r.qty : 0);
  const outQty = (r) => (r.qty < 0 ? Math.abs(r.qty) : 0);

  /* ------------------------------------------------------------- tiles -- */
  const tiles = {
    events: rows.length,
    inQty: r2(rows.reduce((a, r) => a + inQty(r), 0)),
    outQty: r2(rows.reduce((a, r) => a + outQty(r), 0)),
    netQty: r2(rows.reduce((a, r) => a + r.qty, 0)),
    barcodes: new Set(rows.map((r) => r.barcodeNo).filter(Boolean)).size,
    documents: new Set(rows.map((r) => r.refNo).filter(Boolean)).size,
    received: r2(sumOf(rows, MOVEMENT_TYPES.GRC_IN)),
    transferred: r2(Math.abs(sumOf(rows, MOVEMENT_TYPES.TRANSFER_OUT, MOVEMENT_TYPES.ECOM_OUT))),
    sold: r2(Math.abs(sumOf(rows, MOVEMENT_TYPES.POS_OUT))),
    returned: r2(Math.abs(sumOf(rows,
      MOVEMENT_TYPES.POS_RETURN_IN, MOVEMENT_TYPES.TRANSFER_RETURN_OUT, MOVEMENT_TYPES.TRANSFER_RETURN_IN))),
  };

  /* ------------------------------------------------------------- shape -- */
  let list = [];

  if (tab === 'daily') {
    const acc = new Map();
    rows.forEach((r) => {
      const day = new Date(r.at).toISOString().slice(0, 10);
      const row = acc.get(day) || {
        _id: day, day, events: 0, inQty: 0, outQty: 0, net: 0,
        received: 0, transferredOut: 0, transferredIn: 0, sold: 0, returned: 0, barcodes: new Set(),
      };
      row.events += 1;
      row.inQty += inQty(r);
      row.outQty += outQty(r);
      row.net += r.qty;
      if (r.barcodeNo) row.barcodes.add(r.barcodeNo);
      bump(row, r);
      acc.set(day, row);
    });
    list = [...acc.values()]
      .map((r) => ({ ...r, ...rounded(r), barcodes: r.barcodes.size }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  } else if (tab === 'bytype') {
    const acc = new Map();
    rows.forEach((r) => {
      const row = acc.get(r.type) || { _id: r.type, type: String(r.type).replace(/_/g, ' '), events: 0, inQty: 0, outQty: 0, net: 0 };
      row.events += 1;
      row.inQty += inQty(r);
      row.outQty += outQty(r);
      row.net += r.qty;
      acc.set(r.type, row);
    });
    list = [...acc.values()].map((r) => ({ ...r, ...rounded(r) })).sort((a, b) => b.events - a.events);
  } else if (tab === 'bylocation') {
    const acc = new Map();
    const touch = (id) => {
      const key = String(id || 'none');
      if (!acc.has(key)) {
        acc.set(key, { _id: key, location: nameOf(id), inQty: 0, outQty: 0, net: 0, events: 0 });
      }
      return acc.get(key);
    };
    rows.forEach((r) => {
      if (r.toLocationId) { const t = touch(r.toLocationId); t.inQty += Math.abs(r.qty); t.net += Math.abs(r.qty); t.events += 1; }
      if (r.fromLocationId) { const f = touch(r.fromLocationId); f.outQty += Math.abs(r.qty); f.net -= Math.abs(r.qty); f.events += 1; }
    });
    list = [...acc.values()].map((r) => ({ ...r, ...rounded(r) }))
      .sort((a, b) => a.location.localeCompare(b.location));
  } else if (tab === 'bybarcode') {
    const acc = new Map();
    rows.forEach((r) => {
      if (!r.barcodeNo) return;
      const row = acc.get(r.barcodeNo) || {
        _id: r.barcodeNo, barcodeNo: r.barcodeNo, itemCode: r.itemCode, itemName: r.itemName,
        events: 0, net: 0, first: r.at, last: r.at, trail: [],
      };
      row.events += 1;
      row.net += r.qty;
      if (new Date(r.at) < new Date(row.first)) row.first = r.at;
      if (new Date(r.at) > new Date(row.last)) row.last = r.at;
      row.trail.push(String(r.type).replace(/_/g, ' '));
      acc.set(r.barcodeNo, row);
    });
    list = [...acc.values()]
      .map((r) => ({
        ...r, net: r2(r.net),
        /* oldest first reads as a story: received, transferred, received, sold */
        trail: r.trail.slice().reverse().join(' -> '),
        status: r.net > 0 ? 'In stock' : 'Out',
      }))
      .sort((a, b) => new Date(b.last) - new Date(a.last));
  } else {
    const acc = new Map();
    rows.forEach((r) => {
      const key = (r.refModel || '-') + ':' + (r.refNo || String(r.refId || '-'));
      const row = acc.get(key) || {
        _id: key, document: r.refNo || '(no number)', docType: r.refModel || '-',
        at: r.at, events: 0, qty: 0, user: r.userName || r.userEmail || '',
        from: nameOf(r.fromLocationId), to: nameOf(r.toLocationId),
      };
      row.events += 1;
      row.qty += Math.abs(r.qty);
      if (new Date(r.at) > new Date(row.at)) row.at = r.at;
      acc.set(key, row);
    });
    list = [...acc.values()].map((r) => ({ ...r, qty: r2(r.qty) }))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  const p = paged(list, page, perPage);

  /* Honest about what the ledger can and cannot answer for this window. The
     screen prints this rather than letting an empty August look like a month
     with no trade. */
  const earliest = await StockMovement.findOne(
    scope.businessId ? { businessId: toId(scope.businessId) } : {}
  ).sort({ at: 1 }).select('at').lean();

  const coverage = {
    ledgerStartsAt: earliest?.at || null,
    windowStart: start,
    /* true when the window asks for dates before anything was ever recorded */
    partial: Boolean(earliest?.at && new Date(earliest.at) > start),
    note: earliest?.at && new Date(earliest.at) > start
      ? 'Stock movements have been recorded since ' +
        new Date(earliest.at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) +
        '. Anything before that date is not in the ledger and is not shown - the documents from that period still exist on their own screens.'
      : '',
  };

  return json({
    tiles,
    coverage,
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        events: sum(list, 'events'),
        inQty: sum(list, 'inQty'),
        outQty: sum(list, 'outQty'),
        net: sum(list, 'net'),
        qty: sum(list, 'qty'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
});

/* ------------------------------------------------------------- internals -- */

function bump(row, r) {
  switch (r.type) {
    case MOVEMENT_TYPES.GRC_IN: row.received += Math.abs(r.qty); break;
    case MOVEMENT_TYPES.TRANSFER_OUT: case MOVEMENT_TYPES.ECOM_OUT:
      row.transferredOut += Math.abs(r.qty); break;
    case MOVEMENT_TYPES.TRANSFER_IN: row.transferredIn += Math.abs(r.qty); break;
    case MOVEMENT_TYPES.POS_OUT: row.sold += Math.abs(r.qty); break;
    case MOVEMENT_TYPES.POS_RETURN_IN:
    case MOVEMENT_TYPES.TRANSFER_RETURN_OUT:
    case MOVEMENT_TYPES.TRANSFER_RETURN_IN:
      row.returned += Math.abs(r.qty); break;
    default:
  }
}

const NUMERIC = ['inQty', 'outQty', 'net', 'received', 'transferredOut', 'transferredIn', 'sold', 'returned'];
function rounded(row) {
  const out = {};
  NUMERIC.forEach((k) => { if (row[k] !== undefined) out[k] = r2(row[k]); });
  return out;
}

const sum = (list, k) => r2(list.reduce((a, x) => a + (Number(x[k]) || 0), 0));

function sumOf(rows, ...types) {
  return rows.filter((r) => types.includes(r.type)).reduce((a, r) => a + r.qty, 0);
}

function toId(v) {
  return new Types.ObjectId(String(v));
}
