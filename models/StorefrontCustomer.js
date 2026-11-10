import mongoose from 'mongoose';

/* ==========================================================================
   Storefront Customer Model
   
   Customers collection for e-commerce storefront authentication.
   - Phone-based login with WhatsApp OTP
   - Optional email and name (collected post-login)
   - Tracks registration and login activity
   
   This is SEPARATE from ERP's `customer` collection (billing parties).
   Collection name: 'customers' (already exists, extending schema)
   ========================================================================== */

const StorefrontCustomerSchema = new mongoose.Schema(
  {
    // Phone number in E.164 format (+919876543210)
    // Primary identifier for WhatsApp OTP login
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // Customer name (optional, collected after first login)
    name: {
      type: String,
      default: '',
      trim: true,
    },

    // Email (optional, for order notifications)
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },

    // Email verification status
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // Account status: 'active', 'suspended', 'deleted'
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'suspended', 'deleted'],
    },

    // Soft delete flag (for data retention)
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Soft delete timestamp
    deletedAt: {
      type: Date,
      default: null,
    },

    // Most recent login timestamp
    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Profile metadata (addresses, preferences, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Index for active customer lookups
StorefrontCustomerSchema.index({ isDeleted: 1, status: 1 });

// Index for login tracking queries
StorefrontCustomerSchema.index({ lastLoginAt: 1 });

export default mongoose.models.customers ||
  mongoose.model('customers', StorefrontCustomerSchema, 'customers');
