import mongoose from 'mongoose';

/* Login Security
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const LoginSecuritySchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    authentication: { type: String, default: "Enable" },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.loginSecurity ||
  mongoose.model('loginSecurity', LoginSecuritySchema, 'loginsecurity');
