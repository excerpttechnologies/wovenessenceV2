import { BarcodeLabel } from '@/lib/barcodeLabel';
import StockTransfer from '@/models/StockTransfer';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import StoreDeliveryChallan from '@/models/StoreDeliveryChallan';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';

/**
 * Check if a GRC has any downstream stock transfers.
 * 
 * A GRC can only be deleted/cancelled if NONE of its stock has moved downstream.
 * This checks:
 * 1. Direct stock transfers (StockTransfer with grcNo)
 * 2. Inter-company transfers (IC Delivery Challans and Sales Invoices)
 * 3. Inter-store transfers (Store Delivery Challans and Sales Invoices)
 * 
 * @param {string} grcId - The GRC ObjectId to check
 * @param {string} grcNo - The GRC number to check
 * @returns {Promise<{hasTransfers: boolean, transfers: Array}>}
 */
export async function checkGrcDependencies(grcId, grcNo) {
  const transfers = [];
  
  // 1. Find all BarcodeLabel records created from this GRC
  const barcodeLabels = await BarcodeLabel.find({ grcId: String(grcId) })
    .select('_id barcodeNo barcodeGenerated')
    .lean();
  
  if (barcodeLabels.length === 0) {
    // No barcodes = no possible transfers
    return { hasTransfers: false, transfers: [] };
  }
  
  const barcodeIds = barcodeLabels.map(b => b._id);
  const barcodeNumbers = barcodeLabels.map(b => b.barcodeNo || b.barcodeGenerated).filter(Boolean);
  
  // 2. Check StockTransfer - lines array has grcNo field
  const stockTransfers = await StockTransfer.find({
    'lines.grcNo': String(grcNo).trim()
  })
    .select('transferNo transferDate fromStockPoint toStockPoint')
    .lean();
  
  if (stockTransfers.length > 0) {
    transfers.push(...stockTransfers.map(st => ({
      type: 'Stock Transfer',
      refNo: st.transferNo,
      date: st.transferDate,
      from: st.fromStockPoint,
      to: st.toStockPoint
    })));
  }
  
  // 3. Check Inter-Company Delivery Challan - items array has stockMoves with barcodeId
  const icDcs = await IcDeliveryChallan.find({
    'items.stockMoves.barcodeId': { $in: barcodeIds }
  })
    .select('dcNo dcDate toBusinessId toLocationId')
    .lean();
  
  if (icDcs.length > 0) {
    transfers.push(...icDcs.map(dc => ({
      type: 'Inter-Company Delivery Challan',
      refNo: dc.dcNo,
      date: dc.dcDate,
      toBusinessId: dc.toBusinessId,
      toLocationId: dc.toLocationId
    })));
  }
  
  // 4. Check Inter-Company Sales Invoice - items array has stockMoves with barcodeId
  const icInvoices = await IcSalesInvoice.find({
    'items.stockMoves.barcodeId': { $in: barcodeIds }
  })
    .select('invoiceNo invoiceDate toBusinessId toLocationId')
    .lean();
  
  if (icInvoices.length > 0) {
    transfers.push(...icInvoices.map(inv => ({
      type: 'Inter-Company Sales Invoice',
      refNo: inv.invoiceNo,
      date: inv.invoiceDate,
      toBusinessId: inv.toBusinessId,
      toLocationId: inv.toLocationId
    })));
  }
  
  // 5. Check Store Delivery Challan - items array has stockMoves with barcodeId
  const storeDcs = await StoreDeliveryChallan.find({
    'items.stockMoves.barcodeId': { $in: barcodeIds }
  })
    .select('dcNo dcDate toLocationId status')
    .lean();
  
  if (storeDcs.length > 0) {
    transfers.push(...storeDcs.map(dc => ({
      type: 'Store Delivery Challan',
      refNo: dc.dcNo,
      date: dc.dcDate,
      toLocationId: dc.toLocationId,
      status: dc.status
    })));
  }
  
  // 6. Check Store Sales Invoice - items array has stockMoves with barcodeId
  const storeInvoices = await StoreSalesInvoice.find({
    'items.stockMoves.barcodeId': { $in: barcodeIds }
  })
    .select('invoiceNo invoiceDate toLocationId status')
    .lean();
  
  if (storeInvoices.length > 0) {
    transfers.push(...storeInvoices.map(inv => ({
      type: 'Store Sales Invoice',
      refNo: inv.invoiceNo,
      date: inv.invoiceDate,
      toLocationId: inv.toLocationId,
      status: inv.status
    })));
  }
  
  return {
    hasTransfers: transfers.length > 0,
    transfers
  };
}

/**
 * Check if a GRC is the latest (most recent) in its scope.
 * 
 * @param {string} grcId - The GRC ObjectId to check
 * @param {Object} grc - The GRC document
 * @returns {Promise<boolean>}
 */
export async function isLatestGrc(grcId, grc) {
  const Grc = (await import('@/models/Grc')).default;
  
  // Find the most recent GRC in the same scope
  const latestGrc = await Grc.findOne({
    businessId: grc.businessId,
    locationId: grc.locationId,
    finYear: grc.finYear
  })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  
  return latestGrc && String(latestGrc._id) === String(grcId);
}
