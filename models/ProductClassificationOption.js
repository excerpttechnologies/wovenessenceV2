import mongoose from 'mongoose';
import {
  LABEL_FIELD,
  CLASSIFICATION_TYPES,
  PRODUCT_TYPE_CLASSIFICATIONS,
} from '@/lib/productClassificationConstants';

/* Product Classification Options
   
   Dynamic taxonomy for product categorization based on product type:
   - SAREES: byWeave, byFabric, byCraft, byOccasion
   - FABRICS/PLAIN FABRICS/DUPATTA: byFabric, byColour
   
   Each option is user-manageable (add/delete from UI)
   Collection name pinned lowercase for case-sensitivity */

// Re-export for backward compatibility
export { LABEL_FIELD, CLASSIFICATION_TYPES, PRODUCT_TYPE_CLASSIFICATIONS };

const ProductClassificationOptionSchema = new mongoose.Schema(
  {
    businessId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'business', 
      required: true,
      index: true 
    },
    type: { 
      type: String, 
      required: true,
      enum: Object.values(CLASSIFICATION_TYPES),
      index: true
    },
    name: { 
      type: String, 
      required: true,
      trim: true
    },
    displayOrder: { 
      type: Number, 
      default: 0 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
  },
  { timestamps: true }
);

// Compound index for unique constraint and queries
ProductClassificationOptionSchema.index({ businessId: 1, type: 1, name: 1 }, { unique: true });
ProductClassificationOptionSchema.index({ businessId: 1, type: 1, isActive: 1 });

export default mongoose.models.productClassificationOption ||
  mongoose.model('productClassificationOption', ProductClassificationOptionSchema, 'productclassificationoption');
