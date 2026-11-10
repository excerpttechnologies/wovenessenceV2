import mongoose from 'mongoose';

/* ==========================================================================
   Release notes.

   One document per application release. The dashboard's announcement panel
   and the historical listing both read this collection, and the
   administrative screen at /admin/setting/releases is the only place that
   writes it.

   DESIGN NOTES

     status      A draft is visible to administrators on the management screen
                 only. The dashboard and the "All Releases" dialog read
                 published rows. Nothing is announced until somebody publishes
                 it deliberately.

     isLatest    The release the dashboard announces. At most one row should
                 carry it; the write routes clear the flag on every other row
                 before setting it here. GET falls back to the newest published
                 release when no row carries the flag, so a missing flag cannot
                 hide the panel.

     entries     Four arrays with the same shape. `module` is the part of the
                 ERP the change belongs to ("Dashboard", "Sidebar", "Sell"),
                 and `text` is the change itself. Counts on the dashboard are
                 derived from these arrays - they are never stored separately,
                 so a count cannot drift from the list it describes.

   Collection name is pinned lowercase, the same convention as every other
   model in this project. */

const ReleaseEntrySchema = new mongoose.Schema(
  {
    module: { type: String, default: 'General', trim: true, maxlength: 80 },
    text: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false }
);

const ReleaseSchema = new mongoose.Schema(
  {
    /* Stored without a leading "v" - the UI adds it. A version is the one
       human-readable identifier of a release, so it is unique. */
    version: { type: String, required: true, trim: true, unique: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 240 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },

    releaseDate: { type: Date, default: Date.now, index: true },

    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published',
      index: true,
    },

    isLatest: { type: Boolean, default: false, index: true },

    features: { type: [ReleaseEntrySchema], default: [] },
    fixes: { type: [ReleaseEntrySchema], default: [] },
    security: { type: [ReleaseEntrySchema], default: [] },
    improvements: { type: [ReleaseEntrySchema], default: [] },

    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

/* The dashboard reads published rows newest first; the management screen
   reads every row. One compound index covers both orderings. */
ReleaseSchema.index({ status: 1, isLatest: -1, releaseDate: -1 });

export default mongoose.models.release ||
  mongoose.model('release', ReleaseSchema, 'release');
