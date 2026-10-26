import mongoose from 'mongoose';

/* POS Footer Templates (26-10-2026)
   Footers that can be added at the bottom of the POS invoice, picked on the
   invoice print page. One business can keep several.

   templateType decides what the footer shows:
     GOOGLE_REVIEW - Template 1: a "Review us on Google" line that opens
                     reviewUrl when clicked (screen and shared PDF).
     SOCIAL_LINKS  - Template 2: Instagram, Community, Google Review and
                     E-commerce links, each shown when its link is filled.
   More types will be added later.

   Collection name is pinned lowercase, like the other masters. */

export const LABEL_FIELD = 'templateName';

const PosFooterTemplateSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    templateName: { type: String, default: '' },
    templateType: { type: String, default: 'GOOGLE_REVIEW' },
    reviewText: { type: String, default: 'Loved shopping with us? Review us on Google' },
    reviewUrl: { type: String, default: '' },
    /* the shop's online store - optional second link (26-10-2026) */
    ecommerceName: { type: String, default: '' },
    ecommerceUrl: { type: String, default: '' },
    /* Template 2 - SOCIAL_LINKS (26-10-2026) */
    instagramText: { type: String, default: 'Follow us on Instagram' },
    instagramUrl: { type: String, default: '' },
    communityText: { type: String, default: 'Join our Community' },
    communityUrl: { type: String, default: '' },
    status: { type: String, default: 'Active' },
  },
  { timestamps: true }
);

export default mongoose.models.posFooterTemplate ||
  mongoose.model('posFooterTemplate', PosFooterTemplateSchema, 'posfootertemplate');
