import mongoose from 'mongoose';

/* Website Events

   One row per accepted storefront event: a page view, a product view, an
   add-to-cart, a checkout start, a purchase, a search, or a named custom
   event.

   WHAT IS DELIBERATELY NOT STORED
     - the raw IP address: only a salted hash, used for abuse limiting
     - the raw User-Agent: only the parsed browser / OS / device class
     - a full referrer URL: only its hostname
     - page query strings: only the path
     - arbitrary metadata keys that look like names, emails, phones, tokens

   DEDUPLICATION
     `eventId` is the tracker's id for this event. A sendBeacon retry carries
     the same id, so the unique sparse index makes the retry a no-op instead
     of a second page view. Purchases additionally use orderId as a
     dedupeKey, so two tabs on the order confirmation page cannot count the
     same sale twice.

   RETENTION
     occurredAt has a TTL index of 400 days. A purged row disappears on
     Mongo's next TTL sweep; nothing in the application reads past that
     window. */

export const WEBSITE_EVENT_TYPES = [
  'pageview',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'purchase',
  'search',
  'custom',
];

const WebsiteEventSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    eventId: { type: String, default: undefined },
    dedupeKey: { type: String, default: undefined },

    type: { type: String, enum: WEBSITE_EVENT_TYPES, required: true, index: true },
    name: { type: String, default: '' },

    path: { type: String, default: '' },
    title: { type: String, default: '' },

    referrerHost: { type: String, default: '' },
    source: { type: String, default: '' },
    medium: { type: String, default: '' },
    channel: { type: String, default: '' },
    campaign: { type: String, default: '' },

    sessionId: { type: String, default: '', index: true },
    visitorId: { type: String, default: '', index: true },

    deviceType: { type: String, default: 'unknown' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    country: { type: String, default: '' },

    productId: { type: String, default: '' },
    productName: { type: String, default: '' },
    orderId: { type: String, default: '' },
    value: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    quantity: { type: Number, default: 0, min: 0 },
    searchQuery: { type: String, default: '' },

    consent: { type: Boolean, default: true },
    dnt: { type: Boolean, default: false },
    isBot: { type: Boolean, default: false, index: true },
    isInternal: { type: Boolean, default: false },

    ipHash: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    occurredAt: { type: Date, default: Date.now },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'websiteevent' }
);

WebsiteEventSchema.index({ businessId: 1, occurredAt: -1 });
WebsiteEventSchema.index({ businessId: 1, type: 1, occurredAt: -1 });
WebsiteEventSchema.index({ sessionId: 1, occurredAt: 1 });
WebsiteEventSchema.index({ visitorId: 1, occurredAt: 1 });
WebsiteEventSchema.index({ eventId: 1 }, { unique: true, sparse: true });
WebsiteEventSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
WebsiteEventSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export default mongoose.models.websiteEvent ||
  mongoose.model('websiteEvent', WebsiteEventSchema, 'websiteevent');
