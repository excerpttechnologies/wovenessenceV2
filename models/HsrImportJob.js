import mongoose from 'mongoose';

/* ==========================================================================
   HSR IMPORT JOB HISTORY

   Tracks all HSR import operations for audit trail and rollback capability.
   ========================================================================== */

const HsrImportJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, default: '', index: true, unique: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    sourceLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },
    
    /* HSR opening-stock operations plus the three Barcode + Master Data
       import types, which share this audit trail. `source` below separates
       the two families when the history is read. */
    operation: {
      type: String,
      enum: [
        'UPDATE_DETAILS', 'ADD_BARCODES', 'REPLACE_STOCK', 'ADD_STOCK', 'TRANSFER_STOCK',
        'BARCODE_MASTER_IMPORT', 'BARCODE_STOCK_UPDATE', 'MASTER_DATA_IMPORT',
      ],
      index: true,
    },

    source: { type: String, default: 'HSR' },
    scope: { type: String, default: '' },
    strategy: { type: String, default: '' },
    replaceStock: { type: Boolean, default: false },

    fileName: { type: String, default: '' },
    fileHash: { type: String, default: '' },
    
    rowCount: { type: Number, default: 0 },
    
    status: { 
      type: String, 
      enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL'], 
      default: 'PENDING',
      index: true 
    },
    
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    
    finYear: { type: String, default: '' },
    
    result: {
      total: { type: Number, default: 0 },
      inserted: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      replaced: { type: Number, default: 0 },
      added: { type: Number, default: 0 },
      transferred: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      mastersCreated: { type: Number, default: 0 },
      mastersFailed: { type: Number, default: 0 },
      recovered: { type: Number, default: 0 },
    },
    
    reconciliation: {
      totalExcelQty: { type: Number, default: 0 },
      totalExistingTargetQty: { type: Number, default: 0 },
      totalProposedTargetQty: { type: Number, default: 0 },
      itemsWithExistingStock: { type: Number, default: 0 },
      itemsWithoutExistingStock: { type: Number, default: 0 },
      itemsWithPriceDifferences: { type: Number, default: 0 },
    },
    
    errors: [{ type: mongoose.Schema.Types.Mixed, default: undefined }],
    warnings: [{ type: mongoose.Schema.Types.Mixed, default: undefined }],
    
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', default: null },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    
    // Dry-run flag
    dryRun: { type: Boolean, default: false },
  },
  { timestamps: true }
);

HsrImportJobSchema.index({ businessId: 1, status: 1, createdAt: -1 });
HsrImportJobSchema.index({ locationId: 1, status: 1, createdAt: -1 });
HsrImportJobSchema.index({ operation: 1, status: 1, createdAt: -1 });

export default mongoose.models.hsrImportJob ||
  mongoose.model('hsrImportJob', HsrImportJobSchema, 'hsrimportjob');
