import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import DeliveryChallan from '@/models/DeliveryChallan';
import CompanyLocation from '@/models/CompanyLocation';
import StockTransferLocation from '@/models/StockTransferLocation';

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await dbConnect();

  try {
    const challan = await DeliveryChallan.findById(params.id).lean();
    if (!challan) return json({ error: 'Delivery Challan not found' }, 404);

    const source = challan.stockTransferLocationId
      ? await StockTransferLocation.findById(challan.stockTransferLocationId).select('packetNo').lean()
      : null;
    const sourceDocNo = challan.sourceDocNo || source?.packetNo || '';
    const items = (Array.isArray(challan.items) ? challan.items : []).map((item) => ({
      ...item,
      docNo: item.docNo || item.documentNo || sourceDocNo,
      barcode: item.barcode || item.barcodeNo || '',
      rspRate: Number(item.rspRate ?? item.rsp ?? item.netRate ?? 0),
      amount: Number(item.amount ?? item.netAmount ?? 0),
    }));

    /* Fetch location labels */
    const locations = await CompanyLocation.find({
      _id: { $in: [challan.fromLocationId, challan.toLocationId] },
    }).select('_id locationName').lean();

    const labels = {};
    locations.forEach((loc) => {
      labels[String(loc._id)] = loc.locationName;
    });

    return json({ challan: { ...challan, sourceDocNo, items }, labels });
  } catch (error) {
    console.error('Error fetching delivery challan:', error);
    return json({ error: 'Failed to fetch delivery challan' }, 500);
  }
}
