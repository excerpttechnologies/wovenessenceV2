import { isValidObjectId } from 'mongoose';
import * as XLSX from 'xlsx';
import dbConnect from '@/lib/db';
import BarcodeMerge from '@/models/BarcodeMerge';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { mergeExportRows } from '@/lib/barcodeMerge';

/* GET /api/barcode-merge/[id]/export - a real .xlsx of the merge.

   One row per source barcode, with the conversion applied, the merged total
   and the approved merged prices. Every source's own prices are also on the
   merge document; this sheet is the operational view. */

export async function GET(req, { params }) {
  const { id } = await params;
  if (!isValidObjectId(String(id))) {
    return Response.json({ error: 'Invalid merge id.' }, { status: 400 });
  }

  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.DOWNLOAD,
    businessId: sp.get('business'), label: 'barcode merges',
  });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const merge = await BarcodeMerge.findOne({
    _id: id,
    ...(sp.get('business') && isValidObjectId(sp.get('business')) ? { businessId: sp.get('business') } : {}),
  }).lean();
  if (!merge) return Response.json({ error: 'Merge not found.' }, { status: 404 });

  const rows = mergeExportRows(merge);
  const headers = rows.length ? Object.keys(rows[0]) : ['Merge Transaction Code', 'Merged Barcode'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: headers }), 'Barcode Merge');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    'Merge Transaction Code': merge.mergeNo,
    'Merged Barcode': merge.mergedBarcodeNo,
    'Item Code': merge.itemCode,
    'Item Name': merge.itemName,
    'Supplier': merge.supplierName,
    'Number of Source Barcodes': merge.sourceCount,
    'Total Quantity': merge.totalQty,
    UOM: merge.uom,
    'Purchase Rate': merge.purchaseRate,
    RSP: merge.rsp,
    WSP: merge.wsp,
    DP: merge.dp,
    SP: merge.sellingPrice,
    Status: merge.status,
    'Created By': merge.createdByName,
    'Created Date': merge.createdAt,
  }]), 'Summary');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = 'BarcodeMerge_' + String(merge.mergeNo || id).replace(/[^\w-]+/g, '_') + '.xlsx';

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'no-store',
    },
  });
}
