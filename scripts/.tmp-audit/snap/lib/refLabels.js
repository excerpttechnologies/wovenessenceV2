
// import mongoose from 'mongoose';

// /* Resolves every ObjectId field on a page of rows to its display label, so a
//    list can show "VINAYAGA Textiles, SALEM [G1067]" where the document only
//    stores a supplierId.

//    The generated list routes were returning `labels: {}`, which left every
//    `f: 'ref'` column blank - on the GRC list that was 5 of 13 columns.

//    Keyed on the field name rather than on a per-route spec, so one map serves
//    all of them and a new list needs no wiring. */

// const REF_BY_KEY = {
//   businessId:       () => import('@/models/Business'),
//   locationId:       () => import('@/models/CompanyLocation'),
//   ledgerGroupId:    () => import('@/models/LedgerGroup'),
//   parentGroupId:    () => import('@/models/LedgerGroup'),
//   ledgerId:         () => import('@/models/Ledger'),
//   stockPointId:     () => import('@/models/StockPoint'),
//   posCounterId:     () => import('@/models/PosCounter'),
//   taxId:            () => import('@/models/Tax'),
//   hsnId:            () => import('@/models/Hsn'),
//   cityGroupId:      () => import('@/models/CityGroup'),
//   purchaseGroupId:  () => import('@/models/PurchaseGroup'),
//   purchaseTermId:   () => import('@/models/PurchaseTerm'),
//   purchaseChargeId: () => import('@/models/PurchaseCharge'),
//   salesTermId:      () => import('@/models/SalesTerm'),
//   barcodeSettingId: () => import('@/models/BarcodeSetting'),
//   docSetupId:       () => import('@/models/DocSetup'),

//   typeId:           () => import('@/models/ContactType'),
//   supplierId:       () => import('@/models/Contact'),
//   agentId:          () => import('@/models/Contact'),
//   customerId:       () => import('@/models/Contact'),

//   logisticId:       () => import('@/models/Logistic'),
//   transporterId:    () => import('@/models/Transporter'),
//   vehicleId:        () => import('@/models/Vehicle'),
//   driverId:         () => import('@/models/Driver'),
//   routeId:          () => import('@/models/TransportRoute'),
//   dispatchId:       () => import('@/models/Dispatch'),
//   deliveryIds:      () => import('@/models/Delivery'),
//   itemId:           () => import('@/models/Item'),
//   uomId:            () => import('@/models/Uom'),
//   groupId:          () => import('@/models/ProductGroup'),
//   subGroupId:       () => import('@/models/ProductGroup'),
//   filterId:         () => import('@/models/ProductFilter'),
// };

// /* Contacts display as "<business name> [<contact id>]" on the deployed lists */
// const CONTACT_KEYS = new Set(['supplierId', 'agentId', 'customerId']);

// export async function resolveRefLabels(rows) {
//   const labels = {};
//   if (!rows || !rows.length) return labels;

//   /* group the ids we need by which model they live in */
//   const wanted = {};
//   for (const key of Object.keys(REF_BY_KEY)) {
//     const ids = [];
//     for (const r of rows) {
//       const v = r[key];
//       if (Array.isArray(v)) v.forEach((x) => x && ids.push(String(x)));
//       else if (v) ids.push(String(v));
//     }
//     const valid = [...new Set(ids)].filter((id) => mongoose.isValidObjectId(id));
//     if (valid.length) wanted[key] = valid;
//   }

//   await Promise.all(Object.entries(wanted).map(async ([key, ids]) => {
//     try {
//       const mod = await REF_BY_KEY[key]();
//       const Model = mod.default;
//       const labelField = mod.LABEL_FIELD || 'name';

//       const found = await Model.find({ _id: { $in: ids } }).lean();
//       found.forEach((d) => {
//         let text = String(d[labelField] ?? '');
//         if (!text && d.firstName) text = [d.firstName, d.lastName].filter(Boolean).join(' ');
//         if (CONTACT_KEYS.has(key) && d.contactId) text = (text + ' [' + d.contactId + ']').trim();
//         labels[String(d._id)] = text;
//       });
//     } catch {
//       /* a model that isn't part of this install just yields no label */
//     }
//   }));

//   return labels;
// }














 
 
import mongoose from 'mongoose';
 
/* Resolves every ObjectId field on a page of rows to its display label, so a
   list can show "VINAYAGA Textiles, SALEM [G1067]" where the document only
   stores a supplierId.
 
   The generated list routes were returning `labels: {}`, which left every
   `f: 'ref'` column blank - on the GRC list that was 5 of 13 columns.
 
   Keyed on the field name rather than on a per-route spec, so one map serves
   all of them and a new list needs no wiring. */
 
const REF_BY_KEY = {
  businessId:       () => import('@/models/Business'),
  locationId:       () => import('@/models/CompanyLocation'),
  ledgerGroupId:    () => import('@/models/LedgerGroup'),
  parentGroupId:    () => import('@/models/LedgerGroup'),
  ledgerId:         () => import('@/models/Ledger'),
  stockPointId:     () => import('@/models/StockPoint'),
  posCounterId:     () => import('@/models/PosCounter'),
  taxId:            () => import('@/models/Tax'),
  hsnId:            () => import('@/models/Hsn'),
  cityGroupId:      () => import('@/models/CityGroup'),
  purchaseGroupId:  () => import('@/models/PurchaseGroup'),
  purchaseTermId:   () => import('@/models/PurchaseTerm'),
  purchaseChargeId: () => import('@/models/PurchaseCharge'),
  salesTermId:      () => import('@/models/SalesTerm'),
  barcodeSettingId: () => import('@/models/BarcodeSetting'),
  docSetupId:       () => import('@/models/DocSetup'),
 
  typeId:           () => import('@/models/ContactType'),
  supplierId:       () => import('@/models/Contact'),
  agentId:          () => import('@/models/Contact'),
  customerId:       () => import('@/models/Contact'),
 
  logisticId:       () => import('@/models/Logistic'),
  transporterId:    () => import('@/models/Transporter'),
  vehicleId:        () => import('@/models/Vehicle'),
  driverId:         () => import('@/models/Driver'),
  routeId:          () => import('@/models/TransportRoute'),
  dispatchId:       () => import('@/models/Dispatch'),
  deliveryIds:      () => import('@/models/Delivery'),
  itemId:           () => import('@/models/Item'),
  uomId:            () => import('@/models/Uom'),
  groupId:          () => import('@/models/ProductGroup'),
  subGroupId:       () => import('@/models/ProductGroup'),
  filterId:         () => import('@/models/ProductFilter'),
 
  /* Inter Company Sell */
  toBusinessId:           () => import('@/models/Business'),
  toLocationId:           () => import('@/models/CompanyLocation'),
  fromBusinessId:         () => import('@/models/Business'),
  fromLocationId:         () => import('@/models/CompanyLocation'),
  salesPersonId:          () => import('@/models/Contact'),
  icSalesInvoiceId:       () => import('@/models/IcSalesInvoice'),
  icAutoPurchaseReturnId: () => import('@/models/IcAutoPurchaseReturn'),

  /* Stock Transfers - movement between two locations of one business */
  toStockPointId:            () => import('@/models/StockPoint'),
  packetId:                  () => import('@/models/StockTransferPacket'),
  stockTransferLocationId:   () => import('@/models/StockTransferLocation'),
};
 
/* Contacts display as "<business name> [<contact id>]" on the deployed lists */
const CONTACT_KEYS = new Set(['supplierId', 'agentId', 'customerId', 'salesPersonId']);
 
export async function resolveRefLabels(rows) {
  const labels = {};
  if (!rows || !rows.length) return labels;
 
  /* group the ids we need by which model they live in */
  const wanted = {};
  for (const key of Object.keys(REF_BY_KEY)) {
    const ids = [];
    for (const r of rows) {
      const v = r[key];
      if (Array.isArray(v)) v.forEach((x) => x && ids.push(String(x)));
      else if (v) ids.push(String(v));
    }
    const valid = [...new Set(ids)].filter((id) => mongoose.isValidObjectId(id));
    if (valid.length) wanted[key] = valid;
  }
 
  await Promise.all(Object.entries(wanted).map(async ([key, ids]) => {
    try {
      const mod = await REF_BY_KEY[key]();
      const Model = mod.default;
      const labelField = mod.LABEL_FIELD || 'name';
 
      const found = await Model.find({ _id: { $in: ids } }).lean();
      found.forEach((d) => {
        let text = String(d[labelField] ?? '');
        if (!text && d.firstName) text = [d.firstName, d.lastName].filter(Boolean).join(' ');
        if (CONTACT_KEYS.has(key) && d.contactId) text = (text + ' [' + d.contactId + ']').trim();
        labels[String(d._id)] = text;
      });
    } catch {
      /* a model that isn't part of this install just yields no label */
    }
  }));
 
  return labels;
}