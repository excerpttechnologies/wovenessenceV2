import mongoose from 'mongoose';

/* ==========================================================================
   Per-user navigation activity.

   One row per (user, business, sidebar page). `count` is how many times the
   page has been opened and `lastVisitedAt` is the most recent visit. The
   sidebar's "Frequently Visited Pages" section ranks these rows.

   WHY THE BUSINESS IS IN THE KEY

     Screen permissions are stored per business (models/RolePermission.js), so
     the same account can legitimately have a different reach in two branches.
     Keeping one ranking per business means a page the user only visits while
     working in branch A does not leak into branch B's shortcut list, and a
     role change in one branch cannot leave stale shortcuts in the other.

   LOCATION AND FINANCIAL YEAR ARE DELIBERATELY NOT IN THE KEY

     They are report filters, not a different workflow. Including them would
     split "Barcode Report" into one row per location/year and bury the page
     the operator actually uses every day.

   The unique index is what makes the upsert in /api/user-activity safe under
   concurrent navigation. Collection name pinned lowercase, as elsewhere. */

const UserActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'business',
      required: true,
      index: true,
    },
    /* The canonical sidebar href, never a detail/add URL - lib/navRegistry.js
       maps those back to the page they belong to. */
    href: { type: String, required: true, trim: true },
    count: { type: Number, default: 0, min: 0 },
    lastVisitedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserActivitySchema.index(
  { userId: 1, businessId: 1, href: 1 },
  { unique: true }
);

/* The exact ordering the API asks for. */
UserActivitySchema.index({
  userId: 1,
  businessId: 1,
  count: -1,
  lastVisitedAt: -1,
});

export default mongoose.models.userActivity ||
  mongoose.model('userActivity', UserActivitySchema, 'useractivity');
