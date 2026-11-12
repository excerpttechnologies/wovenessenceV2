import * as XLSX from 'xlsx';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* GET /api/barcode-merge/import/template - the merge workbook, empty.

   A merge group is one merged barcode; each row in the group is one source.
   Prices are the approved prices for the MERGED barcode, entered once for the
   group - they are never an average of the sources. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenialAnyAction({
    session, screens: [SCREENS.BARCODE_MERGE], actions: [PERM.CREATE, PERM.READ],
    businessId: sp.get('business'), label: 'barcode merges',
  });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const headers = [
    'Merge Group', 'Source Barcode', 'Merged UOM',
    'Purchase Rate', 'Discount', 'Final Purchase Rate',
    'RSP', 'RSP Offer Price', 'WSP', 'WSP Offer Price',
    'DP', 'DP Offer Price', 'SP',
  ];

  const sample = [
    { 'Merge Group': '1', 'Source Barcode': '8A123501', 'Merged UOM': 'MTR', 'Purchase Rate': 100, Discount: 0, 'Final Purchase Rate': 100, RSP: 150, 'RSP Offer Price': 0, WSP: 140, 'WSP Offer Price': 0, DP: 130, 'DP Offer Price': 0, SP: 145 },
    { 'Merge Group': '1', 'Source Barcode': '8A123502', 'Merged UOM': 'MTR', 'Purchase Rate': 100, Discount: 0, 'Final Purchase Rate': 100, RSP: 150, 'RSP Offer Price': 0, WSP: 140, 'WSP Offer Price': 0, DP: 130, 'DP Offer Price': 0, SP: 145 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample, { header: headers }), 'Barcode Merge Import');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['How to use this workbook'],
    ['Rows sharing a Merge Group become one merged barcode. A group needs at least two source barcodes.'],
    ['Sources must be the same item, supplier, HSN/GST, batch and location, with an approved UOM conversion where units differ.'],
    ['Purchase Rate and RSP are mandatory and apply to the merged barcode. Source prices are preserved, never averaged.'],
    ['Nothing is posted by the import. Upload, review the preview, then confirm the merge in the Merge screen.'],
  ]), 'Instructions');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Barcode_Merge_Import_Template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
