import crypto from 'crypto';

/* ==========================================================================
   Cryptographically Secure OTP Management
   
   - Generates 6-digit OTPs using crypto.randomInt() 
   - Stores only HMAC-SHA256 keyed hashes
   - Never logs or exposes OTPs in URLs
   - Single-use with expiry and attempt limits
   ========================================================================== */

const SECRET = process.env.AUTH_SECRET || 'orbit-dev-secret-change-me';
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = Number(process.env.WHATSAPP_OTP_EXPIRY_MINUTES) || 10;
const MAX_ATTEMPTS = Number(process.env.WHATSAPP_OTP_MAX_ATTEMPTS) || 3;
const MAX_RESENDS_PER_DAY = Number(process.env.WHATSAPP_OTP_MAX_RESENDS_PER_DAY) || 3;

/**
 * Generate a cryptographically secure 6-digit OTP
 * @returns {string} 6-digit OTP
 */
export function generateOtp() {
  // crypto.randomInt is cryptographically secure
  const otp = crypto.randomInt(0, 1000000).toString().padStart(OTP_LENGTH, '0');
  return otp;
}

/**
 * Create HMAC-SHA256 hash of OTP (keyed with AUTH_SECRET)
 * @param {string} otp - The OTP to hash
 * @returns {string} Hex-encoded HMAC hash
 */
export function hashOtp(otp) {
  return crypto.createHmac('sha256', SECRET)
    .update(String(otp))
    .digest('hex');
}

/**
 * Verify OTP against stored hash using constant-time comparison
 * @param {string} otp - The OTP to verify
 * @param {string} storedHash - The stored HMAC hash
 * @returns {boolean} True if OTP matches
 */
export function verifyOtp(otp, storedHash) {
  if (!otp || !storedHash) return false;
  const inputHash = hashOtp(otp);
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(inputHash, 'hex');
  // Constant-time comparison to prevent timing attacks
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Create SHA256 hash of phone number for lookup
 * @param {string} phone - Phone number in E.164 format
 * @returns {string} Hex-encoded SHA256 hash
 */
export function hashPhone(phone) {
  return crypto.createHash('sha256')
    .update(String(phone))
    .digest('hex');
}

/**
 * Normalize phone number to E.164 format
 * @param {string} raw - Raw phone input
 * @param {string} defaultCountryCode - Default country code (default: 91 for India)
 * @returns {string} E.164 formatted phone (+919876543210) or empty string if invalid
 */
export function normalizePhone(raw, defaultCountryCode = '91') {
  let digits = String(raw || '').replace(/\D/g, '');
  
  // Remove leading 00 (international prefix)
  if (digits.startsWith('00')) digits = digits.slice(2);
  
  // Remove leading 0 from 11-digit number
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  
  // Add country code to 10-digit numbers
  if (digits.length === 10) {
    digits = String(defaultCountryCode) + digits;
  }
  
  // Valid phone: 11-15 digits (E.164 standard)
  if (digits.length >= 11 && digits.length <= 15) {
    return '+' + digits;
  }
  
  return '';
}

/**
 * Calculate OTP expiry timestamp
 * @returns {Date} Expiry date (current time + OTP_EXPIRY_MINUTES)
 */
export function getOtpExpiry() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

/**
 * Check if OTP has expired
 * @param {Date} expiresAt - Expiry timestamp
 * @returns {boolean} True if expired
 */
export function isExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}

/**
 * Check if max verification attempts reached
 * @param {number} attempts - Current attempt count
 * @returns {boolean} True if max attempts exceeded
 */
export function maxAttemptsReached(attempts) {
  return attempts >= MAX_ATTEMPTS;
}

/**
 * Check if max resends reached in 24-hour window
 * @param {number} resendCount - Current resend count
 * @param {Date} lastResendAt - Last resend timestamp
 * @returns {boolean} True if max resends exceeded in 24h
 */
export function maxResendsReached(resendCount, lastResendAt) {
  if (resendCount >= MAX_RESENDS_PER_DAY) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // If last resend was within 24h, limit reached
    return new Date(lastResendAt) > dayAgo;
  }
  return false;
}

/**
 * Get resend cooldown in seconds (60 seconds between resends)
 * @param {Date} lastResendAt - Last resend timestamp
 * @returns {number} Seconds remaining before next resend allowed (0 if allowed now)
 */
export function getResendCooldown(lastResendAt) {
  const COOLDOWN_SECONDS = 60;
  if (!lastResendAt) return 0;
  
  const elapsed = Math.floor((Date.now() - new Date(lastResendAt).getTime()) / 1000);
  const remaining = COOLDOWN_SECONDS - elapsed;
  
  return remaining > 0 ? remaining : 0;
}

/**
 * Verify confirmation code for new registrations
 * @param {string} code - User-provided confirmation code
 * @returns {boolean} True if code matches
 */
export function verifyConfirmationCode(code) {
  const validCode = process.env.CUSTOMER_REGISTRATION_CODE || 'ETPL@2026';
  return String(code || '').trim() === validCode;
}

export const OTP_CONFIG = {
  OTP_LENGTH,
  OTP_EXPIRY_MINUTES,
  MAX_ATTEMPTS,
  MAX_RESENDS_PER_DAY,
};
