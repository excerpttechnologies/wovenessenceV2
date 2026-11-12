import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { findOriginalUnit, originalDetails, validateSplitLines } from '@/lib/barcodeSplit';
import { handler } from '@/lib/apiError';

/* POST /api/barcode-split/import/preview

   Validates rows read from the Split workbook and returns what the split
   WOULD be. Nothing is written and no stock moves - the operator reviews the
   preview, then saves it as a draft or finalises it through /api/barcode-split.

   The workbook carries one original barcode per split. Rows for several
   originals are validated independently and returned as groups, so a sheet
   cannot silently mix unrelated items into one split. */

const json = (d, s = 200) => Response.json(d, { status: s });

export const POST = handler(async (req) => {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const denied = await screenDenialAnyAction({
    session, screens: [SCREENS.BARCODE_SPLIT], actions: [PERM.CREATE, PERM.UPDATE],
    businessId: body.business, label: 'barcode splits',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ error: 'The file has no data rows.', code: 'EMPTY_IMPORT' }, 422);

  const businessId = body.business && isValidObjectId(String(body.business)) ? body.business : null;

  /* group by the original barcode the row is for */
  const grouped = new Map();
  rows.forEach((row, index) => {
    const key = String(row.originalBarcode || row.originalBarcodeNo || '').trim();
    const sheetRow = Number(row.row || index + 2);
    if (!key) {
      if (!grouped.has('__missing__')) grouped.set('__missing__', []);
      grouped.get('__missing__').push({ ...row, sheetRow });
      return;
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ ...row, sheetRow });
  });

  const groups = [];
  const globalErrors = [];

  const missingRows = grouped.get('__missing__') || [];
  if (missingRows.length) {
    missingRows.forEach((row) => globalErrors.push({
      row: row.sheetRow, field: 'originalBarcode',
      message: 'Original Barcode is required on every row.',
    }));
    grouped.delete('__missing__');
  }

  for (const [barcodeNo, sheetRows] of grouped.entries()) {
    let unit;
    try {
      unit = await findOriginalUnit({ businessId, code: barcodeNo });
    } catch {
      sheetRows.forEach((row) => globalErrors.push({
        row: row.sheetRow, field: 'originalBarcode',
        message: 'Original barcode ' + barcodeNo + ' was not found in this business.',
      }));
      continue;
    }

    const details = await originalDetails(unit);
    const lines = sheetRows.map((row) => ({
      qty: row.qty,
      uom: row.uom || details.uom,
      barcodeNo: row.barcodeNo,
      purchaseRate: row.purchaseRate,
      discount: row.discount,
      finalPurchaseRate: row.finalPurchaseRate,
      rsp: row.rsp,
      rspOfferPrice: row.rspOfferPrice,
      wsp: row.wsp,
      wspOfferPrice: row.wspOfferPrice,
      dp: row.dp,
      dpOfferPrice: row.dpOfferPrice,
      sellingPrice: row.sellingPrice,
      hsn: row.hsn,
      gst: row.gst,
      batchNo: row.batchNo,
      itemName: row.itemName,
    }));

    const checked = await validateSplitLines({ original: unit, lines, businessId });
    const errors = checked.errors.map((err) => ({
      ...err,
      row: err.row > 0 ? sheetRows[err.row - 1]?.sheetRow || err.row : sheetRows[0]?.sheetRow || 0,
    }));

    /* Child numbers supplied in the file must not collide with each other or
       with an existing label. */
    const supplied = lines.map((l) => String(l.barcodeNo || '').trim()).filter(Boolean);
    const seen = new Set();
    supplied.forEach((number, index) => {
      const upper = number.toUpperCase();
      if (seen.has(upper)) {
        errors.push({ row: sheetRows[index]?.sheetRow || 0, field: 'barcode', message: 'Barcode ' + number + ' appears twice in this file.' });
      }
      seen.add(upper);
    });
    if (supplied.length) {
      const clash = await BarcodeLabel.find({
        barcodeNo: { $in: supplied },
        ...(businessId ? { businessId: String(businessId) } : {}),
      }).select('barcodeNo').lean();
      if (clash.length) {
        errors.push({
          row: sheetRows[0]?.sheetRow || 0, field: 'barcode',
          message: 'These barcode numbers already exist: ' + clash.map((c) => c.barcodeNo).join(', ') + '.',
        });
      }
    }

    groups.push({
      original: details,
      lines: checked.normalized.map((line, index) => ({
        ...line,
        barcodeNo: line.providedBarcodeNo,
        sheetRow: sheetRows[index]?.sheetRow || 0,
        providedBarcodeNo: line.providedBarcodeNo,
        conversionFactor: line.conversionFactor,
        qtyInOriginalUom: line.qtyInOriginalUom,
      })),
      available: checked.available,
      totalSplitQty: checked.totalInOriginalUom,
      remaining: checked.remaining,
      errors,
    });
  }

  const errorCount = globalErrors.length + groups.reduce((sum, g) => sum + g.errors.length, 0);
  return json({
    ok: errorCount === 0,
    groups,
    errors: globalErrors,
    errorCount,
    rowCount: rows.length,
  });
});
