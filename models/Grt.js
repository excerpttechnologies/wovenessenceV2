import mongoose from 'mongoose';
import AttachmentSchema from './attachmentSchema.js';

/* Goods Return Notes
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'grtNo';

const GrtSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'supplier', default: null },
    oldStock: { type: String, default: "No" },
    vendorGstNo: { type: String, default: '' },
    grcNumber: { type: String, default: '' },
    vendorDocNo: { type: String, default: '' },
    grcDate: { type: Date, default: null },
    vendorDocDate: { type: Date, default: null },
    purchaseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
    occasion: { type: String, default: '' },
    purchaseTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'agent', default: null },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    grtNo: { type: String, default: '' },
    grtDate: { type: Date, default: null },
    qty: { type: Number, default: 0 },
    itemCount: { type: Number, default: 0 },
    taxable: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    /* set when this document is converted downstream; null = still available */
    debitNoteId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    /* Documents and photos attached to this record from the Action column's
       Upload button (components/AttachmentsDialog.jsx via /api/attachments).
       An ARRAY, appended to - a second upload never replaces the first. The
       bytes live in the shared store (lib/uploads.js); what is kept here is
       the /api/files URL and the file's own details. */
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.grt ||
  mongoose.model('grt', GrtSchema, 'grt');
