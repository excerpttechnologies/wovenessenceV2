import * as XLSX from 'xlsx';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* GET /api/barcode-split/import/template - the Split workbook, empty.

   The columns are the reference SPLIT.xlsx layout plus the conversion and new
   pricing fields the module needs. A split child's number may be left blank -
   the server issues one - or supplied, in which case it is checked for
   uniqueness before anything is saved. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenialAnyAction({
    session, screens: [SCREENS.BARCODE_SPLIT], actions: [PERM.CREATE, PERM.READ],
    businessId: sp.get('business'), label: 'barcode splits',
  });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const headers = [
    'Original Barcode', 'Original Item Code', 'Item Name', 'New Barcode',
    'Split Quantity', 'Split UOM', 'Purchase Rate', 'Discount',
    'Final Purchase Rate', 'RSP', 'RSP Offer Price', 'WSP',
    'WSP Offer Price', 'DP', 'DP Offer Price', 'SP',
    'HSN', 'GST', 'Batch', 'Supplier', 'GRC No', 'Purchase Reference',
  ];

  const sample = [
    {
      'Original Barcode': '8A1235',
      'Original Item Code': '4-SRT',
      'Item Name': 'Sample fabric',
      'New Barcode': '',
      'Split Quantity': 2,
      'Split UOM': 'MTR',
      'Purchase Rate': 100,
      Discount: 0,
      'Final Purchase Rate': 100,
      RSP: 150,
      'RSP Offer Price': 0,
      WSP: 140,
      'WSP Offer Price': 0,
      DP: 130,
      'DP Offer Price': 0,
      SP: 145,
      HSN: '',
      GST: '',
      Batch: '',
      Supplier: '',
      'GRC No': '',
      'Purchase Reference': '',
    },
    {
      'Original Barcode': '8A1235',
      'Original Item Code': '4-SRT',
      'Item Name': 'Sample fabric',
      'New Barcode': '',
      'Split Quantity': 1,
      'Split UOM': 'PCS',
      'Purchase Rate': 60,
      Discount: 0,
      'Final Purchase Rate': 60,
      RSP: 90,
      'RSP Offer Price': 0,
      WSP: 85,
      'WSP Offer Price': 0,
      DP: 80,
      'DP Offer Price': 0,
      SP: 88,
      HSN: '',
      GST: '',
      Batch: '',
      Supplier: '',
      'GRC No': '',
      'Purchase Reference': '',
    },
  ];

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sample, { header: headers });
  XLSX.utils.book_append_sheet(wb, sheet, 'Barcode Split Import');

  const note = XLSX.utils.aoa_to_sheet([
    ['How to use this workbook'],
    ['One original barcode per split. Leave New Barcode blank to let the system issue child numbers.'],
    ['Split UOM must be the original UOM or a unit with an approved conversion on Tools > UOM Conversion.'],
    ['Purchase Rate and RSP are mandatory for every child. Prices here are the NEW child prices - the original barcode is never repriced.'],
    ['Nothing is posted by the import. Upload, review the preview, then Save Draft or Finalize.'],
  ]);
  XLSX.utils.book_append_sheet(wb, note, 'Instructions');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Barcode_Split_Import_Template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
