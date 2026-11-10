import dbConnect from '@/lib/db';
import OtpSession from '@/models/OtpSession';
import {
  generateOtp,
  hashOtp,
  hashPhone,
  normalizePhone,
  getOtpExpiry,
  maxResendsReached,
  getResendCooldown,
  OTP_CONFIG,
} from '@/lib/otp';
import { sendWhatsAppOtp, validateWhatsAppConfig } from '@/lib/whatsappOtp';

/* ==========================================================================
   POST /api/auth/customer/request-otp
   
   Request WhatsApp OTP for customer authentication
   - Validates phone number
   - Enforces resend limits (3 per 24h, 60s cooldown)
   - Generates cryptographically secure OTP
   - Stores HMAC hash only (never plaintext)
   - Sends via WhatsApp Cloud API with approved template
   
   Public endpoint (no authentication required)
   ========================================================================== */

const json = (data, status = 200) => Response.json(data, { status });

export async function POST(req) {
  try {
    // Parse request
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').trim();

    // Validate phone number
    if (!rawPhone) {
      return json({ error: 'Phone number is required' }, 422);
    }

    const phone = normalizePhone(rawPhone, countryCode);
    if (!phone) {
      return json(
        { error: 'Invalid phone number. Enter 10 digits or full number with country code.' },
        422
      );
    }

    // Validate WhatsApp configuration
    const configCheck = validateWhatsAppConfig();
    if (!configCheck.ok) {
      return json(
        { error: 'OTP service is not available. Please contact support.' },
        503
      );
    }

    await dbConnect();

    const phoneHash = hashPhone(phone);
    const now = new Date();

    // Check existing sessions for rate limiting
    const existingSession = await OtpSession.findOne({
      phoneHash,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existingSession) {
      // Check resend cooldown (60 seconds)
      const cooldown = getResendCooldown(existingSession.lastResendAt || existingSession.createdAt);
      if (cooldown > 0) {
        return json(
          {
            error: `Please wait ${cooldown} seconds before requesting another OTP`,
            cooldownSeconds: cooldown,
          },
          429
        );
      }

      // Check 24-hour resend limit
      if (maxResendsReached(existingSession.resendCount, existingSession.lastResendAt)) {
        return json(
          {
            error: 'Maximum OTP requests reached for today. Please try again after 24 hours.',
            retryAfter: 24 * 60 * 60, // 24 hours in seconds
          },
          429
        );
      }
    }

    // Generate new OTP
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = getOtpExpiry();

    // Send OTP via WhatsApp
    const sendResult = await sendWhatsAppOtp(phone, otp, OTP_CONFIG.OTP_EXPIRY_MINUTES);
    
    if (!sendResult.ok) {
      // Log error server-side (but never log the OTP)
      console.error('[OTP] WhatsApp send failed:', sendResult.error);
      return json(
        { error: sendResult.error || 'Failed to send OTP. Please try again.' },
        502
      );
    }

    // Delete any existing sessions for this phone
    await OtpSession.deleteMany({ phoneHash });

    // Create new OTP session
    const resendCount = existingSession ? existingSession.resendCount + 1 : 0;
    await OtpSession.create({
      phoneHash,
      otpHash,
      expiresAt,
      attempts: 0,
      resendCount,
      lastResendAt: resendCount > 0 ? now : null,
      metadata: {
        phone: phone.slice(0, -4) + '****', // Partially masked for audit
        messageId: sendResult.messageId,
      },
    });

    // Success response (never include OTP)
    return json({
      ok: true,
      expiresIn: OTP_CONFIG.OTP_EXPIRY_MINUTES * 60, // seconds
      message: `OTP sent to ${phone.slice(0, -6)}******`,
    });

  } catch (error) {
    console.error('[OTP Request Error]:', error);
    return json(
      { error: 'An error occurred while processing your request. Please try again.' },
      500
    );
  }
}

// Only POST allowed
export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function PUT() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function DELETE() {
  return json({ error: 'Method not allowed' }, 405);
}
