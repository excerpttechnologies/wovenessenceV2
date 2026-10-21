import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import StockTransferLocation from '@/models/StockTransferLocation';
import StockTransferReceived from '@/models/StockTransferReceived';
import DeliveryChallan from '@/models/DeliveryChallan';
import { nextDocNumber } from '@/lib/docnumber';

const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await dbConnect();

  const { stockTransferLocationId } = await req.json();
  if (!stockTransferLocationId) return json({ error: 'Missing transfer location ID' }, 400);

  try {
    const stl = await StockTransferLocation.findById(stockTransferLocationId).lean();
    if (!stl) return json({ error: 'Stock transfer location not found' }, 404);

    const received = await StockTransferReceived.findOne({
      stockTransferLocationId: stl._id,
    }).select('_id').lean();

    /* Check if challan already exists for this transfer */
    const existing = await DeliveryChallan.findOne({
      stockTransferLocationId,
    }).lean();

    if (existing) {
      return json({ challan: existing });
    }

    /* Generate challan number */
    const challanNo = await nextDocNumber(
      DeliveryChallan,
      'deliveryChallanNo',
      'CHALLAN',
      { businessId: stl.businessId, finYear: stl.finYear }
    );

    /* Create delivery challan with items from transfer */
    const items = (Array.isArray(stl.items) ? stl.items : []).map((item) => ({
      ...item,
      docNo: item.docNo || item.documentNo || stl.packetNo || '',
      barcode: item.barcode || item.barcodeNo || '',
      rspRate: Number(item.rspRate ?? item.rsp ?? item.netRate ?? 0),
      amount: Number(item.amount ?? item.netAmount ?? 0),
    }));

    const challan = new DeliveryChallan({
      businessId: stl.businessId,
      locationId: stl.toLocationId,
      stockTransferLocationId: stl._id,
      stockTransferReceivedId: received?._id || null,
      sourceDocNo: stl.packetNo || '',
      fromLocationId: stl.fromLocationId,
      toLocationId: stl.toLocationId,
      deliveryChallanNo: challanNo,
      dcDate: new Date(),
      items,
      totalQty: stl.totalQty || 0,
      totalAmount: stl.totalAmount || 0,
      status: 'generated',
    });

    await challan.save();

    return json({ challan });
  } catch (error) {
    console.error('Error creating delivery challan:', error);
    return json({ error: 'Failed to create delivery challan' }, 500);
  }
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const stockTransferLocationId = sp.get('stockTransferLocationId');

  if (!stockTransferLocationId) {
    return json({ error: 'Missing transfer location ID' }, 400);
  }

  try {
    const challan = await DeliveryChallan.findOne({
      stockTransferLocationId,
    }).lean();

    if (!challan) {
      return json({ challan: null });
    }

    return json({ challan });
  } catch (error) {
    console.error('Error fetching delivery challan:', error);
    return json({ error: 'Failed to fetch delivery challan' }, 500);
  }
}
