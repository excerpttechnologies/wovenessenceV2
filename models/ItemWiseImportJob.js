import mongoose from 'mongoose';

/* One row per Item Wise Summary import attempt.

   The job is written BEFORE any barcode/movement write and updated after, so
   a failed or interrupted import is visible - and a repeated submission can be
   recognised by its file hash instead of creating the same stock twice. The
   row-level errors are the same ones the downloadable error report uses. */

const ItemWiseImportJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    businessId: { type: String, default: '', index: true },
    finYear: { type: String, default: '' },
    strategy: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileHash: { type: String, default: '', index: true },
    sheetName: { type: String, default: '' },
    status: { type: String, enum: ['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'], default: 'RUNNING', index: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    mastersCreated: { type: [mongoose.Schema.Types.Mixed], default: [] },
    masterFailures: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errorCount: { type: Number, default: 0 },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ItemWiseImportJobSchema.index({ businessId: 1, status: 1, createdAt: -1 });
ItemWiseImportJobSchema.index({ businessId: 1, fileHash: 1, status: 1 });

export default mongoose.models.itemWiseImportJob
  || mongoose.model('itemWiseImportJob', ItemWiseImportJobSchema, 'itemwiseimportjob');
