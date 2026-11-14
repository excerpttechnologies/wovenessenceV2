import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import CompanyLocation from '@/models/CompanyLocation';
import StockMovement from '@/models/StockMovement';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { json, num, r2, scopeOf, dateRange } from '@/lib/reports';

const OUTGOING_TYPES = ['TRANSFER_OUT', 'TRANSFER_RETURN_OUT', 'ECOM_OUT'];

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to view stock out lines.' }, 422);

  const fromDate = sp.get('fromDate');
  const toDate = sp.get('toDate');
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (Number.isNaN(new Date(fromDate).getTime()) || Number.isNaN(new Date(toDate).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }

  await dbConnect();
  const movements = await StockMovement.find({
    businessId: scope.businessId,
    ...(scope.finYear ? { finYear: scope.finYear } : {}),
    ...(scope.locationId ? { fromLocationId: scope.locationId } : {}),
    ...dateRange(sp, 'at'),
    type: { $in: OUTGOING_TYPES },
  }).sort({ at: -1, refNo: 1 }).limit(20000).lean();

  const barcodeIds = [...new Set(movements.map((movement) => String(movement.barcodeId || '')))]
    .filter(isValidObjectId);
  const barcodeRows = barcodeIds.length
    ? await BarcodeLabel.find({ _id: { $in: barcodeIds } })
      .select('_id itemCode printDescription supplierId purRate finalNet imageUrl barcodeNo barcodeGenerated').lean()
    : [];
  const barcodeById = new Map(barcodeRows.map((barcode) => [String(barcode._id), barcode]));

  const destinationIds = [...new Set(movements
    .map((movement) => String(movement.toLocationId || ''))
    .filter(isValidObjectId))];
  const destinationLocations = destinationIds.length
    ? await CompanyLocation.find({ _id: { $in: destinationIds } })
      .select('_id name businessPrintName').lean()
    : [];
  const locationById = new Map(destinationLocations.map((location) => [
    String(location._id), location.name || location.businessPrintName || '',
  ]));

  const rows = movements.map((movement) => {
    const barcode = barcodeById.get(String(movement.barcodeId || ''));
    const qty = Math.abs(num(movement.qty));
    const rate = num(barcode?.finalNet) || num(barcode?.purRate);
    const toLocationId = String(movement.toLocationId || '');
    return {
      _id: String(movement._id),
      number: movement.refNo || '-',
      date: movement.at || movement.createdAt || null,
      party: locationById.get(toLocationId) || movement.reason || 'Transfer',
      itemName: movement.itemName || barcode?.printDescription || '',
      itemCode: movement.itemCode || barcode?.itemCode || '',
      qty: r2(qty),
      rate: r2(rate),
      value: r2(qty * rate),
      imageUrl: barcode?.imageUrl || '',
    };
  });

  const documentKeys = new Set(movements.map((movement) =>
    `${movement.refModel || ''}|${movement.refId || movement.refNo || movement._id}`
  ));
  const totals = rows.reduce((sum, row) => ({
    qty: sum.qty + row.qty,
    value: sum.value + row.value,
  }), { qty: 0, value: 0 });

  return json({
    rows,
    totals: {
      documents: documentKeys.size,
      lines: rows.length,
      qty: r2(totals.qty),
      value: r2(totals.value),
    },
  });
}
