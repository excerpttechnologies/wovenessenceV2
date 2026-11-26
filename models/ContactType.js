import mongoose from 'mongoose';

/* Contact Types
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const ContactTypeSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    contactType: { type: String, default: '' },
    prefix: { type: String, default: '' },
    status: { type: String, default: "Active" },
    colorLebel: { type: String, default: '' },
    description: { type: String, default: '' },
    /* Selected Loyalty Point scheme assigned to this Contact Type (null = Not Applicable). */
    loyaltySchemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'loyaltyPoint', default: null },
    /* Derived flag kept in sync with loyaltySchemeId for compatibility. */
    loyaltyPointsApplicable: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.contactType ||
  mongoose.model('contactType', ContactTypeSchema, 'contacttype');
