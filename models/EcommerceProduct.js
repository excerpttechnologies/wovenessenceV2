import mongoose from 'mongoose';

const EcommerceProductSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', required: true, index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', required: true, index: true },
    ecommItemCode: { type: String, default: '', index: true },
    productType: { type: String, default: '' },
    byWeave: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byFabric: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byCraft: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byOccasion: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    byColour: { type: [mongoose.Schema.Types.ObjectId], ref: 'productClassificationOption', default: [] },
    weaveDescription: { type: String, default: '' },
    fabricDescription: { type: String, default: '' },
    craftDescription: { type: String, default: '' },
    occasionDescription: { type: String, default: '' },
    colourDescription: { type: String, default: '' },
    printDescriptionOverride: { type: String, default: '' },
    displayName: { type: String, default: '' },
    slug: { type: String, default: '' },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    ecommOffPercent: { type: Number, default: null, min: 0, max: 100 },
    barcodePriceOverride: { type: Number, default: null, min: 0 },
    barcodeQtyOverride: { type: Number, default: null, min: 0 },
    barcodeStatusOverride: { type: String, default: '' },
    isFeatured: { type: Boolean, default: false },
    salesCount: { type: Number, default: 0, min: 0 },
    image: { type: String, default: '' },
    additionalImages: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: 'ecommerceproduct' }
);

EcommerceProductSchema.index({ businessId: 1, itemId: 1 }, { unique: true });
EcommerceProductSchema.index({ businessId: 1, slug: 1 });

export default mongoose.models.ecommerceProduct ||
  mongoose.model('ecommerceProduct', EcommerceProductSchema, 'ecommerceproduct');
