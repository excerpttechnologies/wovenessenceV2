import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { loadMergeSources, validateMergeSources } from '@/lib/barcodeMerge';
import { handler } from '@/lib/apiError';

/* POST /api/barcode-merge/import/preview

   A merge workbook is a list of source barcodes, one group per merged
   barcode. Every group is validated exactly like the Merge screen's own
   selection - compatibility and approved conversions - and nothing is
   written. The operator then saves the group through /api/barcode-merge. */

const json = (d, s = 200) => Response.json(d, { status: s });

export const POST = handler(async (req) => {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const denied = await screenDenialAnyAction({
    session, screens: [SCREENS.BARCODE_MERGE], actions: [PERM.CREATE, PERM.UPDATE],
    businessId: body.business, label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ error: 'The file has no data rows.', code: 'EMPTY_IMPORT' }, 422);

  const businessId = body.business && isValidObjectId(String(body.business)) ? body.business : null;

  const grouped = new Map();
  rows.forEach((row, index) => {
    const group = String(row.mergeGroup || '1').trim() || '1';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push({ ...row, sheetRow: Number(row.row || index + 2) });
  });

  const groups = [];
  const errors = [];

  for (const [group, sheetRows] of grouped.entries()) {
    const codes = sheetRows.map((r) => String(r.barcodeNo || r.barcode || '').trim()).filter(Boolean);
    if (codes.length < 2) {
      errors.push({ row: sheetRows[0]?.sheetRow || 0, field: 'barcodeNo', message: 'Merge group ' + group + ' needs at least two source barcodes.' });
      continue;
    }

    let units;
    try {
      units = await loadMergeSources({ businessId, codes });
    } catch (err) {
      errors.push({
        row: sheetRows[0]?.sheetRow || 0, field: 'barcodeNo',
        message: err?.message || 'The barcodes in merge group ' + group + ' could not be read.',
      });
      continue;
    }

    const checked = await validateMergeSources({ businessId, units, targetUom: body.uom });
    groups.push({
      group,
      sources: checked.sources,
      totalQty: checked.totalQty,
      uom: checked.uom,
      uomType: checked.uomType,
      errors: checked.errors.map((err) => ({
        ...err,
        row: sheetRows[(Number(err.row) || 1) - 1]?.sheetRow || sheetRows[0]?.sheetRow || 0,
      })),
      sheetRows: sheetRows.map((r) => r.sheetRow),
    });
  }

  const errorCount = errors.length + groups.reduce((sum, g) => sum + g.errors.length, 0);
  return json({ ok: errorCount === 0, groups, errors, errorCount, rowCount: rows.length });
});
