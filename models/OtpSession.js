import mongoose from 'mongoose';

/* ==========================================================================
   OTP Session Model
   
   Stores OTP verification sessions with:
   - HMAC-SHA256 hashed OTP (never plaintext)
   - SHA256 hashed phone for lookup
   - Expiry timestamp
   - Attempt tracking
   - Resend tracking
   
   TTL index automatically deletes expired sessions after 24 hours
   ========================================================================== */

const OtpSessionSchema = new mongoose.Schema(
  {
    // SHA256 hash of phone number for lookup (privacy)
    phoneHash: {
      type: String,
      required: true,
      index: true,
    },

    // HMAC-SHA256 hash of OTP (keyed with AUTH_SECRET)
    otpHash: {
      type: String,
      required: true,
    },

    // When this OTP expires (typically 10 minutes from creation)
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    // Number of verification attempts (max 3)
    attempts: {
      type: Number,
      default: 0,
      required: true,
    },

    // Number of times OTP was resent in 24h window (max 3)
    resendCount: {
      type: Number,
      default: 0,
      required: true,
    },

    // Last time OTP was resent (for cooldown)
    lastResendAt: {
      type: Date,
      default: null,
    },

    // Device/IP info for security audit (optional)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Compound index for phone + expiry lookups
OtpSessionSchema.index({ phoneHash: 1, expiresAt: 1 });

// TTL index: automatically delete expired sessions after 24 hours
// This gives 24h window to track resend limits, then cleans up
OtpSessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60 } // 24 hours
);

export default mongoose.models.otpSession ||
  mongoose.model('otpSession', OtpSessionSchema, 'otp_sessions');
