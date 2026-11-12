import mongoose from 'mongoose';

/* UOM Conversion - the approved PCS <-> MTR factor the split/merge modules
   must use.

   There is deliberately NO built-in PCS-per-metre default anywhere: a metre
   of one fabric is not a metre of another, so an assumed factor would put the
   wrong stock on a label. A conversion applies to one item when itemId is
   set, or to the whole business when it is not.

   factor is directional: 1 <fromUom> = factor <toUom>.
   Example: 1 MTR = 4 PCS  ->  from MTR, to PCS, factor 4.
   The reverse direction is derived from the same row (factor 1/4). */

export const LABEL_FIELD = 'name';

const UomConversionSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null, index: true },
    itemCode: { type: String, default: '' },

    fromUom: { type: String, default: '' },
    toUom: { type: String, default: '' },
    factor: { type: Number, default: 0 },

    status: { type: String, default: 'Active' },
    notes: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

UomConversionSchema.index({ businessId: 1, itemId: 1, fromUom: 1, toUom: 1 });
UomConversionSchema.index({ businessId: 1, status: 1 });

export default mongoose.models.uomConversion ||
  mongoose.model('uomConversion', UomConversionSchema, 'uomconversion');
