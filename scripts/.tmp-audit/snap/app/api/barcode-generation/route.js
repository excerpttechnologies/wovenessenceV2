import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Item from '@/models/Item';
import Contact from '@/models/Contact';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { reserveBarcodeNumbers, loadFormat, uomTypeOf, batchTypeOf } from '@/lib/barcodeEngine';
import { withTransaction, receiveIntoStock, restateReceipt, voidUnits, InventoryError } from '@/lib/inventory';
import { matchRowsToUnits, editedFields, toGridRow, rowBarcode, unitBarcode, clientIdOf } from '@/lib/barcodeRowSync';
import { composeBarcodeValue, barcodeValueProblem, nextSeqStart, highestSeq, hasComposedBarcode } from '@/lib/barcodeValue';
import { purchasePriceError, normalisePurchasePrice } from '@/lib/purchasePrice';
import { saveBatchTypeOf } from '@/lib/barcodeUnits';

/* /api/barcode-generation

   Barcode Generation is where stock ENTERS the system - it is the only thing
   that creates a barcodeLabel row, and a barcodeLabel row is one unit of
   stock. Two things changed here:

   1. The barcode NUMBER is issued by the server, from the atomic counter, not
      by the browser. See ../reserve/route.js for why.
   2. Saving now also places the stock: each new row is stamped IN_STOCK at
      the receiving location and gets its opening entry in the movement
      ledger. Before this, a generated barcode existed but was nowhere, which
      is why nothing downstream could tell available stock from sold stock.

   Both happen in one transaction with the GRC header, so a half-generated
   receipt is not a state the database can be left in. */

const PER_PAGE = 20;

/* ================================================================= list === */

export const GET = handler(async (req) => {
  await requirePermission(null);
  await dbConnect();
  const sp = new URL(req.url).searchParams;

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(1000, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const business = sp.get('business');
  const location = sp.get('location');
  const finYear = sp.get('finYear');
  const grcId = sp.get('grcId');
  const supplier = sp.get('supplier');
  if (business) filter.businessId = business;
  if (location) filter.locationId = location;
  if (finYear) filter.finYear = finYear;
  if (grcId) filter.grcId = grcId;
  if (supplier) filter.supplierId = supplier;
  const status = sp.get('status'); if (status) filter.status = status;

  const code = (sp.get('code') || '').trim();
  const name = (sp.get('name') || '').trim();

  const andClauses = [];
  if (code) {
    const rx = { $regex: escapeRegex(code), $options: 'i' };
    andClauses.push({ $or: [{ itemCode: rx }, { oldBarcode: rx }, { barcodeGenerated: rx }, { barcodeNo: rx }] });
  }
  if (name) {
    const rx = { $regex: escapeRegex(name), $options: 'i' };
    andClauses.push({ $or: [{ supplierDescription: rx }, { printDescription: rx }] });
  }
  if (andClauses.length) filter.$and = andClauses;

  const total = await BarcodeLabel.countDocuments(filter);
  const rows = await BarcodeLabel.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* Supplier name and GRC number, resolved for the screens that list these
     rows - NOT for the printed label. A label no longer carries either
     (lib/barcodeLabelPrint.js toLabelData whitelists what it may print); they
     stay here because they are ERP data the listing screens show.

     Resolved per page rather than denormalised onto every row - a supplier's
     name can be corrected, and a screen opened tomorrow should show the
     corrected one. */
  const supplierIds = [...new Set(
    rows.map((r) => r.supplierId).filter((s) => s && isValidObjectId(String(s))).map(String)
  )];
  const grcIds = [...new Set(
    rows.filter((r) => !r.grcNo).map((r) => r.grcId).filter((g) => g && isValidObjectId(String(g))).map(String)
  )];

  const [suppliers, grcs] = await Promise.all([
    supplierIds.length
      ? Contact.find({ _id: { $in: supplierIds } }).select('businessName firstName lastName contactId').lean()
      : [],
    grcIds.length
      ? Grc.find({ _id: { $in: grcIds } }).select('grcNumber').lean()
      : [],
  ]);

  const supplierName = new Map(suppliers.map((s) => [
    String(s._id),
    (s.businessName || [s.firstName, s.lastName].filter(Boolean).join(' ') || '').trim(),
  ]));
  const grcNumber = new Map(grcs.map((g) => [String(g._id), g.grcNumber || '']));

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      supplierName: supplierName.get(String(r.supplierId)) || '',
      grcNo: r.grcNo || grcNumber.get(String(r.grcId)) || '',
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
});

/* ============================================================== generate === */

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const {
    rows, business, location, finYear, totals,
    supplierId, vendorDocNo, grcDate, grcId, stockPointId,
  } = body || {};
  /* Saved barcodes the operator removed and confirmed on the screen, by id.
     Deletion is only ever what is named here - see the edit path below. */
  const deleteIds = [...new Set(
    (Array.isArray(body?.deleteIds) ? body.deleteIds : []).map(String).filter((id) => isValidObjectId(id))
  )];

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: location });
  await dbConnect();

  /* an edit of an existing GRC may consist of deletions alone */
  if (!Array.isArray(rows) || (rows.length === 0 && !(grcId && deleteIds.length))) {
    return json({ error: 'No rows to save', code: 'EMPTY' }, 400);
  }

  /* Purchase price - must be greater than 0. The same rule the Add Item form,
     the grid and its Excel import apply (lib/purchasePrice.js), enforced here
     so it holds for a request that never went through them. Checked before
     anything is written, so a refused save changes nothing.

     The value checked is exactly the one buildDocs below will store -
     `r.purRate || r.purchaseRate` - and once it passes it is stored as the
     plain number the check read: "₹1,980" passes, but written as typed it
     would read back as NaN everywhere. */
  const priceErrors = [];
  rows.forEach((row, index) => {
    const field = row.purRate ? 'purRate' : 'purchaseRate';
    const problem = purchasePriceError(row[field]);
    if (problem) {
      priceErrors.push({ ref: row.itemCode || row.itemName || `Row ${index + 1}`, problem });
      return;
    }
    row[field] = normalisePurchasePrice(row[field]);
  });

  if (priceErrors.length > 0) {
    return json({
      /* the operator's words, not a code */
      error: priceErrors[0].problem,
      code: 'INVALID_PRICE',
      details: priceErrors.slice(0, 5).map((p) => `${p.ref}: ${p.problem}`),
      totalErrors: priceErrors.length,
    }, 400);
  }

  /* P-M-F and SM are both optional - a row without one saves with it blank. */

  /* An Old Barcode that is supplied must actually EXIST.

     The Add Item form makes it mandatory and will not submit until the code
     has resolved, but the client is not trusted to have done that - a typed
     or replayed code that matches nothing would otherwise be saved onto the
     new label, pointing its traceability at a record that is not there.

     Deliberately NOT mandatory here: the Excel import on this same screen
     builds rows without an Old Barcode, and requiring one server-side would
     break that existing path. So this validates what is sent, and does not
     demand that something be sent. */
  const suppliedOldBarcodes = [...new Set(
    rows.map((r) => String(r.oldBarcode || '').trim()).filter(Boolean)
  )];
  if (suppliedOldBarcodes.length) {
    const found = await BarcodeLabel.find({
      $or: [
        { barcodeNo: { $in: suppliedOldBarcodes } },
        { barcodeGenerated: { $in: suppliedOldBarcodes } },
        { oldBarcode: { $in: suppliedOldBarcodes } },
      ],
      ...(business ? { businessId: String(business) } : {}),
    }).select('barcodeNo barcodeGenerated oldBarcode').lean();

    const known = new Set(found.flatMap((u) => [u.barcodeNo, u.barcodeGenerated, u.oldBarcode].filter(Boolean).map(String)));
    const missing = suppliedOldBarcodes.filter((c) => !known.has(c));
    if (missing.length) {
      return json({
        error: 'Barcode not found. Please enter or scan a valid barcode.',
        code: 'INVALID_INPUT',
        missing,
      }, 400);
    }
  }

  /* ---- money, derived from the rows rather than trusted from the form ---
     An existing GRC is re-totalled from every row it holds once the save has
     landed, since the request may carry only some of them (grcTotals). */
  const { totalQuantity, gst } = grcTotals(rows);

  /* Item codes on the rows are free text; resolving them once here means the
     barcode carries a real itemId and the reports stop having to re-match on
     a string. Unmatched codes are not an error - the operator may be
     receiving something not yet in the item master. */
  const itemByCode = await resolveItems(rows, business);

  const result = await withTransaction(async (dbSession) => {
    /* ---------------------------------------------- editing an existing --

       NON-DESTRUCTIVE. This used to void and delete every barcode row of the
       GRC and insert whatever the request carried: every row got a new _id on
       every save, the ledger gained a void and a receipt per row per save,
       and any row the request did not carry was gone - Generate For Changes
       sends only the changed rows, so it deleted all the others.

       Now each submitted row is matched to the barcode it already is
       (lib/barcodeRowSync.js). A matched row is updated in place, and only
       where something actually changed; a row that matches nothing is the
       only thing inserted, numbered and received into stock; and a stored row
       the request does not mention is left exactly as it is. A barcode leaves
       a GRC only by explicit deletion: the ids in deleteIds, applied in this
       same transaction, or the DELETE below.

       Everything is checked before anything is written, and a refusal is
       thrown rather than returned, so the transaction rolls back whole. */
    if (grcId) {
      if (!isValidObjectId(grcId)) return json({ error: 'Invalid grcId', code: 'BAD_INPUT' }, 400);

      /* Written FIRST, so two saves of one GRC cannot interleave: the second
         conflicts on this document, and withTransaction runs it again once
         the first has committed - when it can see the rows the first one
         inserted. That is what stops a double-clicked Submit inserting its
         new rows twice. */
      const existing = await Grc.findByIdAndUpdate(
        grcId,
        { $set: { updatedAt: new Date() } },
        { new: true, timestamps: false, ...(dbSession ? { session: dbSession } : {}) }
      );
      if (!existing) return json({ error: 'GRC not found', code: 'NOT_FOUND' }, 404);

      const current = await BarcodeLabel.find({ grcId: String(grcId) })
        .session(dbSession || null).lean();

      /* Rows removed on the screen and confirmed, named by id - never
         inferred from what the request leaves out. An id no longer on this
         GRC was deleted already and is skipped. A row of this same save may
         not name one, by id or by number: that would delete a barcode and
         bring it straight back. */
      const deleting = current.filter((u) => deleteIds.includes(String(u._id)));
      if (deleting.length) {
        /* the same three identities matchRowsToUnits uses - never a barcode
           number for a row the screen made, since those need not be unique */
        const deletingIds = new Set(deleting.map((u) => String(u._id)));
        const deletingClientIds = new Set(deleting.map((u) => String(u.clientRowId ?? '').trim()).filter(Boolean));
        const deletingNos = new Set(deleting.map(unitBarcode).filter(Boolean));
        const clash = rows.filter((row) => {
          if (row?._id) return deletingIds.has(String(row._id));
          if (clientIdOf(row)) return deletingClientIds.has(clientIdOf(row));
          return deletingNos.has(rowBarcode(row));
        });
        if (clash.length) {
          throw new InventoryError('DELETE_CONFLICT',
            'Barcode ' + [...new Set(clash.map(rowBarcode))].slice(0, 8).join(', ') +
            ' is both deleted and kept in this save. Nothing was saved. Reload the page and try again.',
            { status: 409, skipped: clash.map(rowBarcode) });
        }
        const movedAway = deleting.filter(hasMoved);
        if (movedAway.length) {
          throw new InventoryError('BARCODE_LOCKED',
            movedAway.length + ' barcode(s) marked for deletion have already moved (' +
            [...new Set(movedAway.map((u) => u.status))].join(', ') +
            ') and cannot be deleted: ' + movedAway.map(unitBarcode).slice(0, 8).join(', ') +
            '. Nothing was saved.',
            { status: 409, skipped: movedAway.map(unitBarcode) });
        }
      }
      const kept = current.filter((u) => !deleteIds.includes(String(u._id)));
      const { matched, fresh, stale, duplicated } = matchRowsToUnits(rows, kept);

      /* A row naming an _id this GRC does not hold comes from a screen opened
         before that barcode was deleted. Saving it as new would bring a
         deliberately deleted barcode back. */
      if (stale.length) {
        throw new InventoryError('STALE_ROWS',
          'This screen is out of date: ' + stale.length + ' barcode(s) on it are no longer on this GRC (' +
          stale.map(rowBarcode).filter(Boolean).slice(0, 8).join(', ') +
          ') - they were deleted from another screen. Nothing was saved. Reload the page and make your changes again.',
          { status: 409, skipped: stale.map(rowBarcode) });
      }
      if (duplicated.length) {
        throw new InventoryError('DUPLICATE_BARCODE',
          'Barcode ' + [...new Set(duplicated.map(rowBarcode))].slice(0, 8).join(', ') +
          ' appears more than once in this save. Nothing was saved. Reload the page and try again.',
          { status: 409, skipped: duplicated.map(rowBarcode) });
      }

      const docScope = {
        business, location, finYear, grcId: String(grcId),
        supplierId: body.supplierId || String(existing.supplierId || ''),
        grcNo: existing.grcNumber, itemByCode,
      };

      /* The supplier's code, once for the whole save: every barcode value on
         this GRC is SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY (lib/barcodeValue.js). */
      docScope.supplierCode = await supplierCodeOf(docScope.supplierId);
      const valueParts = { supplierCode: docScope.supplierCode, grcNumber: existing.grcNumber };

      /* What the operator changed on each matched row: the row as submitted
         against the same row as the screen shows it untouched, both through
         the one mapping that stores them. Comparing with the stored document
         directly would read every blank the screen fills in on load as an
         edit. The submitted row is laid over the untouched one, so a field
         the request leaves out is left as it is, not blanked. */
      const updates = [];
      const locked = [];
      /* every value the GRC's barcodes hold, so no two ever share one */
      const takenValues = new Set(kept.map(unitBarcode).filter(Boolean));
      matched.forEach(({ row, unit }) => {
        const untouched = untouchedRow(unit);
        const set = editedFields(
          buildDoc({ ...untouched, ...row }, docScope),
          buildDoc(untouched, docScope),
        );
        /* A barcode value carries its own line's quantity. When that quantity
           is corrected the value follows - same SEQ, new QTY - so the bars, the
           text under them and the grid never disagree. Only for a value this
           route composed; an older number stays as it was printed. */
        if ('qty' in set && hasComposedBarcode(unit, valueParts)) {
          const before = unitBarcode(unit);
          const value = composeBarcodeValue({ ...valueParts, seq: unit.seq, qty: set.qty });
          if (value && value !== before) {
            if (takenValues.has(value)) {
              throw new InventoryError('DUPLICATE_BARCODE',
                'Barcode ' + value + ' is already on this GRC. Nothing was saved.', { status: 409, skipped: [value] });
            }
            takenValues.delete(before);
            takenValues.add(value);
            set.barcodeNo = value;
            set.barcodeGenerated = value;
            if (unit.batchNo && unit.batchNo === before) set.batchNo = value;
          }
        }
        if (!Object.keys(set).length) return;
        if (hasMoved(unit)) locked.push(unit);
        else updates.push({ unit, set });
      });

      /* A unit that has been sold, transferred or returned has a history that
         editing it here would rewrite. It no longer blocks the rest of the GRC
         as it used to - left unchanged it is simply skipped - but it cannot
         itself be changed from this screen. */
      if (locked.length) {
        throw new InventoryError('BARCODE_LOCKED',
          locked.length + ' barcode(s) on this GRC have already moved (' +
          [...new Set(locked.map((u) => u.status))].join(', ') +
          ') and can no longer be changed here: ' +
          locked.map(unitBarcode).slice(0, 8).join(', ') +
          '. Nothing was saved. Undo the changes to those rows, or raise a stock adjustment instead.',
          { status: 409, skipped: locked.map(unitBarcode) });
      }

      if (deleting.length) {
        /* written off in the ledger first, so the trail shows the deletion
           rather than a silent disappearance */
        await voidUnits({
          units: deleting,
          ref: { model: 'grc', _id: existing._id, no: existing.grcNumber },
          reason: 'Barcode row deleted from the GRC',
          user: session, session: dbSession,
        });
        /* guarded on the unit still being in stock - one sold in between is
           not deleted */
        const gone = await BarcodeLabel.deleteMany(
          {
            _id: { $in: deleting.map((u) => u._id) },
            grcId: String(grcId),
            status: { $in: [BARCODE_STATUS.IN_STOCK, '', null] },
          },
          dbSession ? { session: dbSession } : {}
        );
        if (gone.deletedCount !== deleting.length) {
          throw new InventoryError('MOVEMENT_CONFLICT',
            'Some of the barcodes being deleted were changed by someone else while this was saving. Nothing was saved. Reload and try again.',
            { status: 409 });
        }
      }

      if (updates.length) {
        const res = await BarcodeLabel.bulkWrite(
          updates.map(({ unit, set }) => ({
            updateOne: {
              /* guarded on the status just read, so a unit sold in between is not edited */
              filter: { _id: unit._id, grcId: String(grcId), ...(unit.status ? { status: unit.status } : {}) },
              update: { $set: set },
            },
          })),
          dbSession ? { session: dbSession, ordered: true } : { ordered: true }
        );
        if (res.matchedCount !== updates.length) {
          throw new InventoryError('MOVEMENT_CONFLICT',
            'Some of these barcodes were changed by someone else while this was saving. Nothing was saved. Reload and try again.',
            { status: 409 });
        }

        /* the stock reports add the ledger up by item code, so a corrected
           quantity or item has to reach it as well */
        const corrections = updates
          .filter(({ set }) => LEDGER_FIELDS.some((key) => key in set))
          .map(({ unit, set }) => ({ before: unit, after: set }));
        if (corrections.length) {
          await restateReceipt({ corrections, grc: existing, user: session, session: dbSession });
        }
      }

      let created = [];
      if (fresh.length) {
        /* SEQ carries on after every barcode this GRC has ever given -
           lastBarcodeSeq remembers the ones since deleted - so a value once
           printed is never given out again */
        const docs = await buildDocs({
          rows: fresh, ...docScope, takenValues,
          startSeq: nextSeqStart(current, Number(existing.get?.('lastBarcodeSeq') ?? existing.lastBarcodeSeq) || 0),
        });
        created = await BarcodeLabel.insertMany(docs, dbSession ? { session: dbSession, ordered: true } : { ordered: true });

        /* only the new barcodes become stock and get an opening entry - the
           existing ones were received when they were created */
        await receiveIntoStock({
          units: created.map((d) => d.toObject()),
          businessId: business, locationId: location, stockPointId,
          grc: existing, user: session, session: dbSession,
        });
      }

      /* re-totalled from every row the GRC now holds, not just the ones sent */
      const all = await BarcodeLabel.find({ grcId: String(grcId) }).session(dbSession || null).lean();
      await Grc.findByIdAndUpdate(
        grcId,
        { ...grcTotals(all), $max: { lastBarcodeSeq: highestSeq(all) } },
        dbSession ? { session: dbSession } : {}
      );

      return {
        grcId: String(grcId), grcNumber: existing.grcNumber, count: all.length,
        created: created.length, updated: updates.length, unchanged: matched.length - updates.length,
        deleted: deleting.length,
        /* the stored values - the screen shows and prints these, never its own */
        rows: savedRowsOf(all),
        createdRows: created.map((doc, i) => ({ id: clientIdOf(fresh[i]), _id: String(doc._id), barcodeNo: doc.barcodeNo, seq: doc.seq })),
      };
    }

    /* ------------------------------------------------- a brand new GRC -- */
    const grcPayload = {
      grcDate: grcDate || new Date(),
      vendorDocNo: vendorDocNo || '',
      totalQuantity: totals?.count || totalQuantity,
      gst,
      netAmount: totals?.value || 0,
      taxable: (totals?.value || 0) - (totals?.discAmount || 0),
    };
    if (business && isValidObjectId(business)) grcPayload.businessId = business;
    if (location && isValidObjectId(location)) grcPayload.locationId = location;
    if (finYear) grcPayload.finYear = finYear;
    if (supplierId && isValidObjectId(supplierId)) grcPayload.supplierId = supplierId;
    if (stockPointId && isValidObjectId(stockPointId)) grcPayload.stockPointId = stockPointId;

    /* checked before a GRC number is taken: a GRC that cannot give its
       barcodes a value is not made at all */
    const supplierCode = await supplierCodeOf(grcPayload.supplierId);
    const supplierProblem = barcodeValueProblem({ supplierCode, grcNumber: 'pending' });
    if (supplierProblem) throw new InventoryError('BARCODE_VALUE', supplierProblem, { status: 400 });

    grcPayload.grcNumber = await nextDocNumber(Grc, 'grcNumber', 'Goods Receipt Challan', {
      businessId: grcPayload.businessId,
      locationId: grcPayload.locationId,
      finYear: grcPayload.finYear,
    });

    const [grc] = await Grc.create([grcPayload], dbSession ? { session: dbSession } : {});

    const docs = await buildDocs({
      rows, business, location, finYear, grcId: String(grc._id),
      supplierId, supplierCode, grcNo: grcPayload.grcNumber, itemByCode,
      startSeq: 1, takenValues: new Set(),
    });

    const created = await BarcodeLabel.insertMany(docs, dbSession ? { session: dbSession, ordered: true } : { ordered: true });

    /* the barcodes become stock at the receiving location, and the ledger
       gets each unit's opening entry */
    await receiveIntoStock({
      units: created.map((d) => d.toObject()),
      businessId: business, locationId: location, stockPointId,
      grc, user: session, session: dbSession,
    });

    await Grc.updateOne({ _id: grc._id }, { $max: { lastBarcodeSeq: highestSeq(created) } }, dbSession ? { session: dbSession } : {});

    return {
      grcId: String(grc._id), grcNumber: grcPayload.grcNumber, count: created.length,
      rows: savedRowsOf(created),
      createdRows: created.map((doc, i) => ({ id: clientIdOf(rows[i]), _id: String(doc._id), barcodeNo: doc.barcodeNo, seq: doc.seq })),
    };
  });

  /* a validation short-circuit inside the transaction returns a Response */
  if (result instanceof Response) return result;

  return json({ ok: true, ...result });
});

/* ================================================================ delete === */

export const DELETE = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const session = await requirePermission(PERMISSIONS.GRC_MANAGE);
  await dbConnect();

  if (body?.grcId) {
    return withTransaction(async (dbSession) => {
      const units = await BarcodeLabel.find({ grcId: body.grcId }).session(dbSession || null).lean();

      const moved = units.filter((u) => u.status && u.status !== BARCODE_STATUS.IN_STOCK);
      if (moved.length) {
        throw new InventoryError('GRC_LOCKED',
          'This GRC cannot be deleted: ' + moved.length + ' of its barcodes have already moved ('
          + [...new Set(moved.map((m) => m.status))].join(', ') + ').',
          { status: 409, skipped: moved.map((m) => m.barcodeNo || m.barcodeGenerated) });
      }

      const grc = await Grc.findById(body.grcId).session(dbSession || null).lean();
      if (units.length) {
        await voidUnits({
          units,
          ref: { model: 'grc', _id: body.grcId, no: grc?.grcNumber || '' },
          reason: 'GRC deleted',
          user: session, session: dbSession,
        });
      }

      await Grc.findByIdAndDelete(body.grcId, dbSession ? { session: dbSession } : {});
      await BarcodeLabel.deleteMany({ grcId: body.grcId }, dbSession ? { session: dbSession } : {});
      return json({ ok: true });
    });
  }

  if (body?.id) {
    return withTransaction(async (dbSession) => {
      const unit = await BarcodeLabel.findById(body.id).session(dbSession || null).lean();
      if (!unit) return json({ ok: true });

      if (unit.status && unit.status !== BARCODE_STATUS.IN_STOCK) {
        throw new InventoryError('BARCODE_LOCKED',
          'Barcode ' + (unit.barcodeNo || unit.barcodeGenerated) + ' has already moved (' + unit.status + ') and cannot be deleted.',
          { status: 409 });
      }
      await voidUnits({
        units: [unit], ref: { model: 'barcodeLabel', _id: unit._id, no: unit.barcodeNo },
        reason: 'Barcode row deleted', user: session, session: dbSession,
      });
      await BarcodeLabel.findByIdAndDelete(body.id, dbSession ? { session: dbSession } : {});

      /* the GRC it came off is re-totalled from the rows it still holds */
      if (unit.grcId && isValidObjectId(unit.grcId)) {
        const rest = await BarcodeLabel.find({ grcId: unit.grcId }).session(dbSession || null).lean();
        await Grc.findByIdAndUpdate(unit.grcId, grcTotals(rest), dbSession ? { session: dbSession } : {});
      }
      return json({ ok: true });
    });
  }

  return json({ error: 'id or grcId required', code: 'BAD_INPUT' }, 400);
});

/* ------------------------------------------------------------- internals -- */

/* Turns the screen's NEW rows into barcode documents, each with the value it
   will carry everywhere - the bars, the text under them, the grid, the till:

     SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY          e.g. "G1318 * 05178 * 1 * 16"

   (lib/barcodeValue.js). SEQ is the GRC's own running number, from startSeq
   on, one per barcode in the order the rows arrive; QTY is that same row's
   quantity - never the GRC's total. A value the GRC already holds (an older
   barcode that happens to compose the same text) is skipped to the next SEQ,
   so no two barcodes of a GRC share one. Whatever number a row arrives with
   is ignored: the value is made here, and only here. */
async function buildDocs({ rows, startSeq = 1, takenValues = new Set(), ...scope }) {
  const supplierCode = scope.supplierCode ?? await supplierCodeOf(scope.supplierId);
  const problem = barcodeValueProblem({ supplierCode, grcNumber: scope.grcNo });
  if (problem) throw new InventoryError('BARCODE_VALUE', problem, { status: 400 });

  let seq = startSeq;
  return rows.map((r) => {
    const valueAt = (n) => composeBarcodeValue({ supplierCode, grcNumber: scope.grcNo, seq: n, qty: r.qty });
    if (!valueAt(seq)) {
      throw new InventoryError('BARCODE_VALUE',
        (r.itemCode || r.itemName || 'A row') + ' has no quantity, so its barcode value (SUPPLIER CODE * GRC NUMBER * SEQ * QTY) cannot be made. Nothing was saved.',
        { status: 400 });
    }
    while (takenValues.has(valueAt(seq))) seq += 1;
    const barcodeNo = valueAt(seq);
    takenValues.add(barcodeNo);
    const doc = buildDoc(r, { ...scope, barcodeNo, seq: String(seq) });
    seq += 1;
    return doc;
  });
}

/* One screen row as the document it is stored as. Pure: the barcode value
   and its SEQ are decided by buildDocs. The edit path also runs an untouched
   copy of a stored row through here to see what the operator changed - the
   value and SEQ are not editable fields, so they play no part there. */
function buildDoc(r, { business, location, finYear, grcId, supplierId, grcNo, barcodeNo = '', seq = '', itemByCode }) {
  const uomType = uomTypeOf(r.uom);
  /* the same expression as always, now shared with the label printer
     (lib/barcodeUnits.js), so a row prints under the type it is stored with */
  const batchType = saveBatchTypeOf(r);
  const item = itemByCode.get(String(r.itemCode || '').trim());

  return {
    grcId,
    grcNo: grcNo || '',
    supplierId: supplierId || '',
    groupId: r.groupId || '',
    oldBarcode: r.oldBarcode || '',
    itemCode: r.itemCode || '',
    batchUnique: batchType,
    billSlNo: r.billSlNo || '',
    /* the barcode's running number within its GRC - see buildDocs */
    seq,
    /* the screen's own id for this row, so a repeated Submit finds the unit
       it already made (see matchRowsToUnits) */
    clientRowId: clientIdOf(r),
    dummy: r.dummy || '',
    supplierDescription: r.supplierDescription || '',
    goodsType: r.goodsType || '',
    sm: r.sm || (r.goodsType === 'SM' ? 'SM' : ''),
    p_m_f: r.p_m_f || (r.goodsType === 'P-M-F' ? 'P-M-F' : ''),
    qty: String(r.qty ?? ''),
    /* "-" is how the grid shows no cuts - stored as none */
    noOfCuts: String(r.noOfCuts ?? '').trim().replace(/^-$/, ''),
    uom: r.uom || '',
    hsn: r.hsn || '',
    /* The Barcode Generation grid names these two purchaseRate and
       finalPrice; only an imported row ever arrives under the stored names.
       Reading just the stored names wrote an empty string for every row
       generated on screen, so the cost price was lost on save and the
       label's CP line came out blank after a reload. The stored name is
       still preferred, so an import keeps behaving exactly as it did.

       `disc` is deliberately NOT given the same treatment. It is read back
       in grcTotals as a PERCENTAGE (rate * disc / 100), while the grid's
       `discount` is a percentage or a flat rupee amount depending on the
       row's Discount Type. Feeding a flat amount into that sum would
       quietly change the GRC's taxable value, which is worse than the
       blank it leaves today. Reconciling the two is a separate change. */
    purRate: r.purRate || r.purchaseRate || '',
    /* buildDoc is a whitelist - a key the client adds to a row does not
       reach the database unless it is copied here. Same stored/grid name
       pair as purRate/purchaseRate above. */
    encodedPurRate: r.encodedPurRate || r.encodedPurchaseRate || '',
    disc: r.disc || '',
    finalNet: r.finalNet || r.finalPrice || '',
    gst: r.gst || '',
    printDescription: r.printDescription || '',
    retailPrice: r.retailPrice || '',
    disc2: r.disc2 || '',
    offerPrice: r.offerPrice || '',
    wspPrice: r.wspPrice || '',
    dpPrice: r.dpPrice || '',
    customFields: r.customFields && typeof r.customFields === 'object' ? r.customFields : {},
    fma: r.fma || '',
    silkMark: r.silkMark || '',

    /* canonical + legacy, kept in step so nothing that still reads
       barcodeGenerated breaks */
    barcodeNo,
    barcodeGenerated: barcodeNo,

    /* ---- lifecycle ---- */
    itemId: item?._id || null,
    /* The name on the row wins - what the operator typed on the grid, or
       picked from the item master on Add Item - and the master's name fills
       in only when the row has none. Master-first quietly threw away an Item
       name edited on the grid. */
    itemName: r.itemName || item?.name || r.printDescription || r.supplierDescription || '',
    uomType,
    batchType,
    qtyNum: Number(r.qty) || 1,
    batchNo: batchType === 'batch' ? String(r.batchNo || barcodeNo) : '',
    serialNo: String(r.serialNo || r.billSlNo || ''),
    status: BARCODE_STATUS.IN_STOCK,
    currentLocationId: isValidObjectId(location) ? location : null,
    currentBusinessId: isValidObjectId(business) ? business : null,

    businessId: business || '',
    locationId: location || '',
    finYear: finYear || '',
  };
}

/* A stored unit as the screen holds it when it loads the GRC, with its price
   in the form the POST handler normalises every submitted row to. */
function untouchedRow(unit) {
  const row = toGridRow(unit);
  const field = row.purRate ? 'purRate' : 'purchaseRate';
  row[field] = normalisePurchasePrice(row[field]);
  return row;
}

/* The supplier's code - Contact.contactId, "G1318" - the first part of every
   barcode value. '' when the GRC has no supplier or the supplier no code. */
async function supplierCodeOf(supplierId) {
  if (!supplierId || !isValidObjectId(String(supplierId))) return '';
  const contact = await Contact.findById(supplierId).select('contactId').lean();
  return String(contact?.contactId || '').trim();
}

/* What the screen gets back about every barcode of the GRC after a save: the
   stored value to show and print, never one the browser made up. */
function savedRowsOf(units) {
  return (units || []).map((u) => ({
    _id: String(u._id), clientRowId: u.clientRowId || '', barcodeNo: unitBarcode(u), seq: u.seq || '', qty: u.qty || '',
  }));
}

/* The stored fields the stock reports add the ledger up by. */
const LEDGER_FIELDS = ['itemCode', 'qtyNum'];

/* A unit that has left the shelf it was received onto: sold, in transit,
   returned or written off - or received at another branch, which leaves it
   IN_STOCK but no longer here. */
function hasMoved(unit) {
  if (unit.status && unit.status !== BARCODE_STATUS.IN_STOCK) return true;
  const at = String(unit.currentLocationId || '');
  const from = String(unit.locationId || '');
  return Boolean(at && from && at !== from);
}

/* The GRC header's money, from barcode rows - stored or submitted, they use
   the same field names. */
function grcTotals(rows) {
  const qtyOf = (row) => parseFloat(row.qty) || 0;
  const totalQuantity = rows.reduce((sum, row) => sum + qtyOf(row), 0);
  const netAmount = rows.reduce((sum, row) => {
    const price = parseFloat(row.offerPrice || row.retailPrice) || 0;
    return sum + price * qtyOf(row);
  }, 0);
  const discountAmount = rows.reduce((sum, row) => {
    const rate = parseFloat(row.finalNet || row.purRate) || 0;
    const discount = parseFloat(row.disc) || 0;
    return sum + (rate * discount) / 100 * qtyOf(row);
  }, 0);
  const gst = rows.reduce((sum, row) => sum + (parseFloat(row.gst) || 0), 0);
  return { totalQuantity, gst, netAmount, taxable: netAmount - discountAmount };
}

async function resolveItems(rows, businessId) {
  const codes = [...new Set(rows.map((r) => String(r.itemCode || '').trim()).filter(Boolean))];
  if (!codes.length) return new Map();

  const items = await Item.find({
    itemCode: { $in: codes },
    ...(businessId && isValidObjectId(businessId) ? { businessId } : {}),
  }).select('_id name itemCode').lean();

  return new Map(items.map((i) => [String(i.itemCode), i]));
}
