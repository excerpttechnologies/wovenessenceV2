import mongoose, { isValidObjectId } from 'mongoose';

/* ==========================================================================
   Read-only access to the storefront collections that share this database.

   The storefront is not modelled in Mongoose here: its order and branch
   documents are written by the website application. Reading them straight
   from the driver keeps this dashboard additive - no schema is registered
   that could later be saved back over a storefront document.

   Website orders are stored in `orders`, keyed to `branches._id`. A branch
   carries the ERP business id in `erpBusinessId`, which is what links an
   online order back to the branch that fulfils it.
   ========================================================================== */

export const WEBSITE_ELIGIBLE_STATUSES = [
  'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered',
];

export const WEBSITE_EXCLUDED_STATUSES = ['cancelled', 'pending_payment'];

const OID = (value) => (isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);

function validOid(value) {
  return isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

export async function loadWebsiteOrders(db, {
  startDate,
  endExclusive,
  branchIds,
  cap = 20000,
}) {
  const filter = {
    createdAt: { $gte: startDate, $lt: endExclusive },
  };
  if (Array.isArray(branchIds)) {
    filter.branch = { $in: branchIds.map(validOid).filter(Boolean) };
  }

  return db.collection('orders')
    .find(filter)
    .project({
      orderNumber: 1,
      status: 1,
      invoiceNumber: 1,
      invoicedAt: 1,
      createdAt: 1,
      branch: 1,
      branchName: 1,
      branchCity: 1,
      customer: 1,
      customerName: 1,
      customerPhone: 1,
      'amounts.grandTotal': 1,
      'amounts.subtotal': 1,
      'payment.method': 1,
      'payment.status': 1,
      lines: 1,
    })
    .sort({ createdAt: 1 })
    .limit(cap)
    .toArray();
}

export function websiteStatusOf(order) {
  const status = String(order?.status || '').toLowerCase();
  if (WEBSITE_ELIGIBLE_STATUSES.includes(status)) return 'eligible';
  if (WEBSITE_EXCLUDED_STATUSES.includes(status)) return 'excluded';
  return 'other';
}

/* Loads product identity from the website catalog and its order-line snapshots.
   Older orders may still point to the legacy `items` collection. */
export async function loadOnlineProductMap(db, orders) {
  const lines = (orders || []).flatMap((o) => (Array.isArray(o.lines) ? o.lines : []));
  const ids = [...new Set(
    lines.map((l) => String(l.item || ''))
      .filter((id) => isValidObjectId(id))
  )];
  const codes = [...new Set(lines.flatMap((line) => (
    [line.barcode, line.barcodeNo, line.itemCode, line.sku]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )))];
  if (!ids.length && !codes.length) return new Map();

  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const catalogClauses = [];
  if (oids.length) {
    catalogClauses.push({ _id: { $in: oids } });
    catalogClauses.push({ itemId: { $in: oids } });
  }
  if (codes.length) {
    catalogClauses.push({ barcode: { $in: codes } });
    catalogClauses.push({ ecommItemCode: { $in: codes } });
  }
  const [catalogProducts, legacyItems] = await Promise.all([
    db.collection('ecommerceproduct').find({ $or: catalogClauses }).project({
      businessId: 1, itemId: 1, displayName: 1, ecommItemCode: 1, barcode: 1,
      productType: 1, erpRef: 1, identity: 1, erpSnapshot: 1, content: 1,
    }).toArray(),
    oids.length
      ? db.collection('items').find({ _id: { $in: oids } }).project({
        identity: 1, group: 1, subgroup: 1, displayName: 1,
      }).toArray()
      : [],
  ]);

  const groupIds = [...new Set(legacyItems.map((i) => String(i.group || '')).filter(Boolean))];
  const subgroupIds = [...new Set(legacyItems.map((i) => String(i.subgroup || '')).filter(Boolean))];
  const [groups, subgroups] = await Promise.all([
    groupIds.length
      ? db.collection('groups').find({ _id: { $in: groupIds.map(validOid).filter(Boolean) } })
        .project({ groupName: 1 }).toArray()
      : [],
    subgroupIds.length
      ? db.collection('subgroups').find({ _id: { $in: subgroupIds.map(validOid).filter(Boolean) } })
        .project({ subgroupName: 1, group: 1 }).toArray()
      : [],
  ]);

  const groupName = new Map(groups.map((g) => [String(g._id), String(g.groupName || '')]));
  const subgroupById = new Map(subgroups.map((s) => [String(s._id), s]));

  const map = new Map();
  catalogProducts.forEach((d) => {
    const product = {
      source: 'ecommerceproduct',
      name: String(d.displayName || d.content?.productName || d.erpSnapshot?.itemName || ''),
      itemCode: String(d.ecommItemCode || d.erpRef?.itemCode || d.identity?.itemCode || d.identity?.erpItemCode || ''),
      barcode: String(d.barcode || ''),
      erpItemCode: String(d.identity?.erpItemCode || d.erpRef?.itemCode || ''),
      erpGroupId: String(d.erpRef?.groupId || ''),
      storeGroupName: String(d.productType || d.erpSnapshot?.groupName || d.identity?.category || ''),
      businessId: String(d.businessId || d.erpRef?.businessId || ''),
    };
    map.set(String(d._id), product);
    if (product.barcode) map.set(`barcode:${product.barcode.trim().toUpperCase()}`, product);
    if (product.itemCode) map.set(`code:${product.itemCode.trim().toUpperCase()}`, product);
  });

  legacyItems.forEach((d) => {
    if (map.has(String(d._id))) return;
    const subgroup = subgroupById.get(String(d.subgroup || ''));
    map.set(String(d._id), {
      source: 'items',
      name: String(d.identity?.productName || d.displayName || ''),
      itemCode: String(d.identity?.itemCode || d.identity?.erpItemCode || ''),
      erpItemCode: String(d.identity?.erpItemCode || ''),
      erpGroupId: String(d.identity?.erpGroupId || ''),
      storeGroupName: String(
        groupName.get(String(subgroup?.group || d.group || ''))
        || d.identity?.category
        || subgroup?.subgroupName
        || ''
      ),
      businessId: String(d.identity?.businessId || ''),
    });
  });

  return map;
}

export function onlineLineValue(line) {
  const direct = Number(line?.lineSubtotal);
  if (Number.isFinite(direct)) return direct;
  const qty = Number(line?.quantity);
  const price = Number(line?.unitPrice);
  return Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
}

export function onlineLineQty(line) {
  const qty = Number(line?.quantity);
  return Number.isFinite(qty) ? qty : 0;
}

export { OID };
