import mongoose from 'mongoose';

/* Staff-uploaded product photos, written by the mobile app backend when a
   scanned item's photo is submitted (POST /api/barcode/image on the mobile
   backend). Same MongoDB database, same collection ("productImage") - this
   model exists on the web side purely to READ those images for display in
   the Barcode Items list; nothing here writes to this collection. */

const ProductImageSchema = new mongoose.Schema(
  {
    barcodeGenerated: { type: String, required: true, index: true },
    itemCode: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    filePath: { type: String, default: '' },
    mimeType: { type: String, default: 'image/jpeg' },
    originalName: { type: String, default: 'product-image.jpg' },
  },
  { timestamps: true }
);

export default mongoose.models.ProductImage ||
  mongoose.model('ProductImage', ProductImageSchema, 'productImage');