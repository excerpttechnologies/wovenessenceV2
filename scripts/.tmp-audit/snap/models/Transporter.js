import mongoose from 'mongoose';

/* Transporter Master (Transport Master)

   Freight, autoChargesMode and tipsMode are multi-select: a transporter can
   accept several freight terms and several payment modes, which is why the
   list shows more than one badge per row.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise. */

export const LABEL_FIELD = 'transporterName';

const TransporterSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    transporterName: { type: String, default: '' },
    transporterCode: { type: String, default: '', index: true },

    freight: { type: [String], default: [] },
    gstApplicable: { type: String, default: 'No' },
    autoChargesMode: { type: [String], default: [] },
    tipsMode: { type: [String], default: [] },

    isActive: { type: String, default: 'Active' },
  },
  { timestamps: true }
);

export default mongoose.models.transporter ||
  mongoose.model('transporter', TransporterSchema, 'transporter');
