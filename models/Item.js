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
    
    /* ============================================ E-COMMERCE FIELDS ============================================ */
    
    /* Product Type - determines which classification fields are visible */
    productType: { 
      type: String, 
      default: '',
      enum: ['', 'SAREES', 'FABRICS', 'PLAIN FABRICS', 'DUPATTA', 'OTHER']
    },
    
    /* Product Classifications - References to ProductClassificationOption */
    byWeave: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byFabric: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byCraft: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byOccasion: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byColour: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    
    /* Descriptive Fields - Rich text descriptions for each classification */
    weaveDescription: { type: String, default: '' },
    fabricDescription: { type: String, default: '' },
    craftDescription: { type: String, default: '' },
    occasionDescription: { type: String, default: '' },
    colourDescription: { type: String, default: '' },
    printDescriptionOverride: { type: String, default: '' },
    
    /* SEO Fields */
    slug: { type: String, default: '', index: true, sparse: true },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    
    /* E-commerce Stock & Pricing Overrides */
    ecommOffPercent: { type: Number, default: null }, // E-commerce discount percentage
    barcodePriceOverride: { type: Number, default: null }, // Override price for e-commerce
    barcodeQtyOverride: { type: Number, default: null }, // Override quantity for e-commerce
    barcodeStatusOverride: { 
      type: String, 
      default: '',
      enum: ['', 'IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER', 'DISCONTINUED']
    },
    
    /* Storefront Settings */
    isFeatured: { type: Boolean, default: false, index: true },
    salesCount: { type: Number, default: 0 }, // Total units sold (for popularity sorting)
    displayName: { type: String, default: '' }, // Override for storefront display
    
    /* Additional Images */
    additionalImages: { type: [String], default: [] }, // Array of image URLs
  },
  { timestamps: true }
);

export default mongoose.models.item ||
  mongoose.model('item', ItemSchema, 'item');