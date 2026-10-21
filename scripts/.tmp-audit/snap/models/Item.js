// import mongoose from 'mongoose';

// /* Items
//    Collection name pinned lowercase - Mongoose would pluralise it otherwise
//    and MongoDB collection names are case-sensitive. */

// export const LABEL_FIELD = 'name';

// const ItemSchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
//     name: { type: String, default: '' },
//     subGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'productGroup', default: null },
//     uomId: { type: mongoose.Schema.Types.ObjectId, ref: 'uom', default: null },
//     hsnId: { type: mongoose.Schema.Types.ObjectId, ref: 'hsn', default: null },
//     uniqueBarcode: { type: String, default: "No" },
//     offerPriceNetPrice: { type: String, default: "No" },
//     filterId: { type: mongoose.Schema.Types.ObjectId, ref: 'productFilter', default: null },
//     prefix: { type: String, default: '' },
//     itemCode: { type: String, default: '' },
//     rspOfferPercent: { type: Number, default: null },
//     image: { type: String, default: '' },
//     description: { type: String, default: '' },
//     attributeAddonIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
//     itemType: { type: String, default: "Simple" },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.item ||
//   mongoose.model('item', ItemSchema, 'item');








import mongoose from 'mongoose';

/* Items
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const ItemSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    subGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'productGroup', default: null },
    uomId: { type: mongoose.Schema.Types.ObjectId, ref: 'uom', default: null },
    hsnId: { type: mongoose.Schema.Types.ObjectId, ref: 'hsn', default: null },
    uniqueBarcode: { type: String, default: "No" },
    offerPriceNetPrice: { type: String, default: "No" },
    filterId: { type: mongoose.Schema.Types.ObjectId, ref: 'productFilter', default: null },
    prefix: { type: String, default: '' },
    itemCode: { type: String, default: '' },
    ecommItemCode: { type: String, default: '' },
    /* retail and wholesale selling price, shown on the Barcode Print Label
       screen; rspOfferPercent below is a discount %, not a price */
    rsp: { type: Number, default: null },
    wsp: { type: Number, default: null },
    rspOfferPercent: { type: Number, default: null },
    image: { type: String, default: '' },
    description: { type: String, default: '' },
    attributeAddonIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    itemType: { type: String, default: "Simple" },
  },
  { timestamps: true }
);

export default mongoose.models.item ||
  mongoose.model('item', ItemSchema, 'item');