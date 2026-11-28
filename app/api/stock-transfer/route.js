import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransfer, { TRANSFER_STATUS } from '@/models/StockTransfer';
import CompanyLocation from '@/models/CompanyLocation';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS, locationScope } from '@/lib/rbac';
import { escapeRegex } from '@/lib/validate';
import { nextSeriesNumber } from '@/lib/docnumber';
import { withLocationPairLock } from '@/lib/locks';
import {
  withTransaction, loadUnits, despatchTransfer, InventoryError, shape, unitsByCode,
} from '@/lib/inventory';
import { barcodeSearchPattern, unitAnswersTo, barcodeKey } from '@/lib/barcodeValue';
import { sortedPage } from '@/lib/listSort';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

/* /api/stock-transfer - list + despatch.

   POST creates the document AND moves the stock in one transaction: there is
   no state where a transfer exists but its barcodes are still sellable at the
   source. That is the whole reason the two are not separate endpoints. */

const PER_PAGE = 10;
const TRANSFER_PREFIX = 'ST/';

/* ================================================================= list === */

export const GET = handler(async (req) => {
  const session = await requirePermission(null);
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = await resolveAuthorizedScope(session, {
    businessId: sp.get('business'),
    locationId: sp.get('location'),
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  if (scope.businessFilter) filter.businessId = scope.businessFilter;
  const y = sp.get('finYear'); if (y) filter.finYear = y;
  const status = sp.get('status'); if (status) filter.status = status;
  const src = sp.get('source'); if (src) filter.source = src;

  /* `box` is which side of the transfer the caller is looking at:
       out - documents this location despatched
       in  - documents addressed TO this location (the receiving screen)
     Without it the list shows both, which is right for an administrator. */
  const box = sp.get('box');
  const location = sp.get('location');
  if (box === 'in' && location && isValidObjectId(location)) filter.toLocationId = location;
  else if (box === 'out' && location && isValidObjectId(location)) filter.fromLocationId = location;

  /* A user restricted to certain locations only ever sees transfers with one
     end at one of them, whatever the query string asks for. */
  const allowed = locationScope(session, null);
  if (allowed && (session.locationIds || []).length) {
    filter.$and = [...(filter.$and || []), {
      $or: [{ fromLocationId: allowed }, { toLocationId: allowed }],
    }];
  }

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.transferDate = { ...(filter.transferDate || {}), $gte: new Date(from) };
  if (to) filter.transferDate = { ...(filter.transferDate || {}), $lte: new Date(to + 'T23:59:59.999') };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    /* a barcode may be typed with or without the spaces around '*' */
    const barcodeRx = { $regex: barcodeSearchPattern(search), $options: 'i' };
    filter.$and = [...(filter.$and || []), {
      $or: [{ transferNo: rx }, { waybill: rx }, { 'lines.barcodeNo': barcodeRx }, { billingNo: rx }],
    }];
  }

  const total = await StockTransfer.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(StockTransfer, filter, sp, {
    page,
    perPage,
    keys: ['transferNo', 'transferDate', 'fromLocationName', 'toLocationName', 'status', 'sentQty', 'sentCount', 'receivedQty', 'returnedQty', 'pendingQty', 'billableQty', 'billingNo', 'netValue', 'waybill'],
    select: '-lines',
  })) ?? await StockTransfer.find(filter)
    .select('-lines')                     // the list never needs every barcode
    .sort({ transferDate: -1, createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
});

/* ============================================================= despatch === */

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const {
    business, finYear, barcodes = [], fromLocationId, toLocationId,
    toStockPointId = null, transferDate, waybill = '', remarks = '',
    source = 'STOCK_TRANSFER', ecomReference = '',
  } = body || {};

  /* `lines` is the current contract: [{ barcodeNo, qty }] - the quantity the
     operator typed per scanned row, in the row's own UOM (pieces for PC,
     metres for MTR). `barcodes` is the older flat list and still works: it
     moves every unit whole, exactly as before. */
  const lineList = Array.isArray(body?.lines) ? body.lines : [];
  const codeOf = (l) => String(l?.barcodeNo || l?.barcode || l?.code || '').trim();
  const seen = new Set();
  const codes = (lineList.length ? lineList.map(codeOf) : (barcodes || []).map((c) => String(c || '').trim()))
    .filter((c) => {
      const key = barcodeKey(c);
      if (!c || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const session = await requirePermission(PERMISSIONS.TRANSFER_DESPATCH, { locationId: fromLocationId });
  await dbConnect();

  const scope = await resolveAuthorizedScope(session, {
    businessId: business,
    locationId: fromLocationId,
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  if (!isValidObjectId(fromLocationId)) {
    return json({ errors: { fromLocationId: 'Choose the source location.' } }, 422);
  }
  if (!isValidObjectId(toLocationId)) {
    return json({ errors: { toLocationId: 'Choose the destination location.' } }, 422);
  }
  if (String(fromLocationId) === String(toLocationId)) {
    return json({ errors: { toLocationId: 'The destination must be a different location from the source.' } }, 422);
  }
  if (!codes.length) {
    return json({ errors: { barcodes: 'Scan at least one barcode into the transfer.' } }, 422);
  }

  /* Quantities the operator typed, keyed by the code as scanned. A line with
     no usable quantity moves its unit whole - the old behaviour. Anything
     that is not a positive number is refused here rather than deep in the
     movement, so the message names the line. */
  const qtyByCode = new Map();
  lineList.forEach((l) => {
    const code = codeOf(l);
    const key = barcodeKey(code);
    if (!key || qtyByCode.has(key)) return;
    const raw = l?.qty;
    if (raw === undefined || raw === null || raw === '') return;
    const q = Number(raw);
    if (!Number.isFinite(q) || q <= 0) {
      throw new InventoryError('INVALID_QTY',
        'Quantity for ' + (code || 'a line') + ' must be greater than zero.',
        { status: 422, skipped: [code] });
    }
    qtyByCode.set(key, q);
  });

  const [fromLoc, toLoc] = await Promise.all([
    CompanyLocation.findById(fromLocationId).lean(),
    CompanyLocation.findById(toLocationId).lean(),
  ]);
  if (!fromLoc) return json({ errors: { fromLocationId: 'Source location not found.' } }, 422);
  if (!toLoc) return json({ errors: { toLocationId: 'Destination location not found.' } }, 422);

  /* Hold the pair for the whole commit. Another transfer between these two
     locations waits; transfers between any other pair are unaffected. */
  const result = await withLocationPairLock(
    {
      businessId: business, fromLocationId, toLocationId,
      operation: 'stock-transfer:despatch', user: session,
    },
    async () => withTransaction(async (dbSession) => {
      /* Re-read the barcodes INSIDE the transaction and the lock. The list the
         browser holds was assembled scan by scan and may be seconds old. */
      const units = await loadUnits(codes, { businessId: business, session: dbSession });

      /* a code may be any spelling the unit answers to - its own number, its
         composed value, its old barcode */
      const missing = codes.filter(
        (c) => !units.some((u) => unitAnswersTo(u, c))
      );
      if (missing.length) {
        throw new InventoryError('BARCODE_NOT_FOUND',
          'These barcodes are not in the system: ' + missing.slice(0, 10).join(', '),
          { status: 422, skipped: missing });
      }

      /* The typed quantity belongs to the UNIT the code resolved to, not to
         the string that was scanned - the same barcode can be typed in two
         spellings. unitsByCode walks loadUnits' output in the codes' order,
         so each unit finds the quantity its own code carried. */
      const unitByCode = unitsByCode(codes, units);
      const qtyByUnit = new Map();
      lineList.forEach((l) => {
        const unit = unitByCode.get(barcodeKey(codeOf(l)));
        const q = unit ? qtyByCode.get(barcodeKey(codeOf(l))) : undefined;
        if (unit && q !== undefined) qtyByUnit.set(String(unit._id), q);
      });

      const transferNo = await nextTransferNo({ businessId: business, finYear });

      const doc = new StockTransfer({
        businessId: business, finYear: finYear || '',
        transferNo,
        transferDate: transferDate
          ? (/^\d{4}-\d{2}-\d{2}$/.test(String(transferDate).trim())
              ? new Date(`${String(transferDate).trim()}T00:00:00`)
              : new Date(transferDate))
          : new Date(),
        fromLocationId, fromLocationName: fromLoc.name || fromLoc.businessPrintName || '',
        fromGstn: fromLoc.gstin || '',
        fromAddress: address(fromLoc),
        toLocationId, toLocationName: toLoc.name || toLoc.businessPrintName || '',
        toGstn: toLoc.gstin || '',
        toAddress: address(toLoc),
        toStockPointId: isValidObjectId(toStockPointId) ? toStockPointId : null,
        status: TRANSFER_STATUS.IN_TRANSIT,
        source, ecomReference,
        waybill, remarks,
        submittedAt: new Date(),
        submittedBy: session.name || session.email || '',
      });

      /* Guarded, per unit: anything another request took in the meantime is
         reported by barcode rather than silently dropped from the document.
         Runs BEFORE the document is saved so its lines can be built from the
         units that actually moved - a partial line's snapshot is the child
         row carrying the entered quantity, not the whole parent. The whole
         thing is one transaction, so a failure anywhere rolls back together. */
      const { moved } = await despatchTransfer({
        units, transfer: doc, fromLocationId, toLocationId,
        user: session, session: dbSession, qtyByUnit,
      });

      doc.lines = moved.map(lineFrom);
      doc.recalc();

      await doc.save(dbSession ? { session: dbSession } : {});

      return doc;
    })
  );

  return json({
    ok: true,
    id: String(result._id),
    transferNo: result.transferNo,
    sentQty: result.sentQty,
    sentCount: result.sentCount,
  }, 201);
});

/* ------------------------------------------------------------- internals -- */

/* ST/<fy>/0001, from the atomic counter - see lib/docnumber.js. The unique
   index on (businessId, transferNo) is the actual guarantee. */
async function nextTransferNo({ businessId, finYear }) {
  const yy = String(finYear || '').slice(2, 4) || String(new Date().getFullYear()).slice(2);
  return nextSeriesNumber(StockTransfer, 'transferNo', TRANSFER_PREFIX + yy + '/', {
    scope: { businessId, finYear },
    pad: 4,
  });
}

/* A transfer line is a snapshot of the barcode at despatch. Prices are copied
   rather than joined so the document keeps the value it was raised at. */
function lineFrom(u) {
  const s = shape(u);
  return {
    barcodeId: u._id,
    barcodeNo: s.barcodeNo,
    itemId: u.itemId || null,
    itemCode: s.itemCode,
    itemName: s.itemName,
    description: s.description,
    uom: s.uom,
    uomType: s.uomType || '',
    batchType: s.batchType,
    qty: s.qty,
    hsn: s.hsn,
    gst: s.gst,
    rate: s.rate,
    rsp: s.rsp,
    supplierId: s.supplierId,
    grcNo: s.grcNo,
  };
}

function address(loc) {
  return [loc.addressLine1, loc.addressLine2, loc.city, loc.state, loc.zipCode]
    .map((p) => String(p || '').trim()).filter(Boolean).join(', ');
}
