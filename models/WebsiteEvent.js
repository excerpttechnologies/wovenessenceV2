import mongoose from 'mongoose';

/* ==========================================================================
   First-party website events.

   Written only by the tracking endpoint in
   app/api/website-analytics/collect/route.js and read only by
   lib/website-analytics/service.js. This collection is additive: no existing
   ERP or storefront document is read back into it, and nothing here is ever
   written to an order, cart, customer or stock record.

   Privacy: there is no name, email, phone, IP address or full URL stored.
   visitorId is a random first-party identifier generated in the visitor's
   browser; path is the pathname with the query string removed, so reset
   tokens and email parameters never reach the database.
   ========================================================================== */

const eventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, trim: true, maxlength: 40 },
    ts: { type: Date, required: true },

    visitorId: { type: String, required: true, trim: true, maxlength: 64 },
    sessionId: { type: String, default: '', trim: true, maxlength: 64 },

    path: { type: String, default: '', trim: true, maxlength: 512 },
    pageType: { type: String, default: 'other', maxlength: 24 },

    source: { type: String, default: 'unknown', maxlength: 24 },
    referrer: { type: String, default: '', maxlength: 300 },
    campaign: {
      source: { type: String, default: '', maxlength: 80 },
      medium: { type: String, default: '', maxlength: 80 },
      name: { type: String, default: '', maxlength: 120 },
    },

    device: { type: String, default: 'unknown', maxlength: 16 },
    /* Coarse geography supplied by the site's own edge/CDN headers. Never a
       precise location, never derived from a customer address. */
    country: { type: String, default: '', maxlength: 64 },
    state: { type: String, default: '', maxlength: 64 },
    city: { type: String, default: '', maxlength: 64 },

    product: {
      id: { type: String, default: '', maxlength: 64 },
      itemCode: { type: String, default: '', maxlength: 64 },
      name: { type: String, default: '', maxlength: 200 },
    },

    orderId: { type: String, default: '', maxlength: 80 },
    /* true only when the order reference was found in the ERP/storefront
       orders collection at ingestion time. Browser-reported purchases that
       cannot be matched stay false and are never counted as conversions. */
    verified: { type: Boolean, default: false },
    value: { type: Number, default: null },

    customerId: { type: String, default: '', maxlength: 64 },
    consent: { type: String, default: 'unknown', maxlength: 16 },
    schemaVersion: { type: Number, default: 1 },

    dedupeKey: { type: String, required: true, unique: true },
  },
  { collection: 'websiteevents', timestamps: true, minimize: false }
);

eventSchema.index({ ts: -1 });
eventSchema.index({ visitorId: 1, ts: -1 });
eventSchema.index({ event: 1, ts: -1 });
eventSchema.index({ sessionId: 1 });

export default mongoose.models.WebsiteEvent
  || mongoose.model('WebsiteEvent', eventSchema);
