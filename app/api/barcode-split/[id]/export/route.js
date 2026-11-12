import { isValidObjectId } from 'mongoose';
import * as XLSX from 'xlsx';
import dbConnect from '@/lib/db';
import BarcodeSplit from '@/models/BarcodeSplit';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { splitExportRows } from '@/lib/barcodeSplit';

/* GET /api/barcode-split/[id]/export - a real .xlsx of the split.

   One row per child barcode, carrying the inherited original reference, the
   conversion applied, the new prices and the genealogy. This is the same
   layout as the import template, so an exported split can be re-imported as
   a new draft when that is what the operator wants. */

export async function GET(req, { params }) {
  const { id } = await params;
  if (!isValidObjectId(String(id))) {
    return Response.json({ error: 'Invalid split id.' }, { status: 400 });
  }

  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_SPLIT, action: PERM.DOWNLOAD,
    businessId: sp.get('business'), label: 'barcode splits',
  });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const split = await BarcodeSplit.findOne({
    _id: id,
    ...(sp.get('business') && isValidObjectId(sp.get('business')) ? { businessId: sp.get('business') } : {}),
  }).lean();
  if (!split) return Response.json({ error: 'Split not found.' }, { status: 404 });

  const rows = splitExportRows(split);
  const headers = rows.length ? Object.keys(rows[0]) : ['Split Transaction Code', 'Original Barcode'];

  const wb = XLSX.utils.book_new();
  const detail = XLSX.utils.json_to_sheet(rows, { header: headers });
  XLSX.utils.book_append_sheet(wb, detail, 'Barcode Split');

  const summary = XLSX.utils.json_to_sheet([{
    'Split Transaction Code': split.splitNo,
    'Original Barcode': split.originalBarcodeNo,
    'Item Code': split.itemCode,
    'Item Name': split.itemName,
    'Supplier': split.supplierName,
    'Original Quantity': split.originalQty,
    'Original UOM': split.originalUom,
    'Total Split Quantity': split.totalSplitQty,
    'Remaining Quantity': split.remainingQty,
    'New Barcode Count': split.childCount,
    'Status': split.status,
    'Created By': split.createdByName,
    'Created Date': split.createdAt,
  }]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'BarcodeSplit_' + String(split.splitNo || id).replace(/[^\w-]+/g, '_') + '.xlsx';

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
    },
  });
}
