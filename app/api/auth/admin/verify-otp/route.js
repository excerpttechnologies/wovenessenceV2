import { cookies } from 'next/headers';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import OtpSession from '@/models/OtpSession';
import { verifyOtp, hashPhone, normalizePhone, isExpired, maxAttemptsReached } from '@/lib/otp';
import { signSession, COOKIE, cookieOptions } from '@/lib/auth';

/* ==========================================================================
   POST /api/auth/admin/verify-otp
   
   Verify WhatsApp OTP and create admin/user session
   - Validates OTP against HMAC hash
   - Enforces attempt limits (3 attempts per OTP)
   - Checks expiry (10 minutes default)
   - Single-use: deletes OTP after successful verification
   - Creates admin session (same as email/password login)
   
   Public endpoint (no authentication required)
   ========================================================================== */

const json = (data, status = 200) => Response.json(data, { status });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = String(body.phone || '').trim();
    const otp = String(body.otp || '').trim();
    const countryCode = String(body.countryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').trim();

    if (!rawPhone) {
      return json({ error: 'Phone number is required' }, 422);
    }

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return json({ error: 'Enter a valid 6-digit OTP' }, 422);
    }

    const phone = normalizePhone(rawPhone, countryCode);
    if (!phone) {
      return json({ error: 'Invalid phone number' }, 422);
    }

    await dbConnect();

    const phoneHash = hashPhone(phone);
    const now = new Date();

    // Find active OTP session
    const session = await OtpSession.findOne({
      phoneHash,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });

    if (!session) {
      return json(
        {
          error: 'OTP expired or not found. Please request a new OTP.',
          code: 'OTP_EXPIRED',
        },
        404
      );
    }

    // Check if OTP has expired
    if (isExpired(session.expiresAt)) {
      await OtpSession.deleteOne({ _id: session._id });
      return json(
        {
          error: 'OTP has expired. Please request a new one.',
          code: 'OTP_EXPIRED',
        },
        410
      );
    }

    // Check attempt limit
    if (maxAttemptsReached(session.attempts)) {
      await OtpSession.deleteOne({ _id: session._id });
      return json(
        {
          error: 'Maximum verification attempts exceeded. Please request a new OTP.',
          code: 'MAX_ATTEMPTS',
        },
        429
      );
    }

    // Verify OTP (constant-time comparison)
    const isValid = verifyOtp(otp, session.otpHash);

    // Increment attempts regardless of success/failure
    session.attempts += 1;
    await session.save();

    if (!isValid) {
      const attemptsLeft = 3 - session.attempts;
      if (attemptsLeft > 0) {
        return json(
          {
            error: `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining.`,
            code: 'INVALID_OTP',
            attemptsLeft,
          },
          401
        );
      } else {
        await OtpSession.deleteOne({ _id: session._id });
        return json(
          {
            error: 'Invalid OTP. Maximum attempts exceeded. Please request a new OTP.',
            code: 'MAX_ATTEMPTS',
          },
          429
        );
      }
    }

    // OTP is valid - delete the session (single-use)
    await OtpSession.deleteOne({ _id: session._id });

    // Find user with this phone
    const user = await User.findOne({
      phone,
      isActive: { $ne: false },
    }).lean();

    if (!user) {
      return json({ error: 'User account not found or inactive.' }, 404);
    }

    // Create admin session (same structure as email/password login)
    const jar = await cookies();
    jar.set(
      COOKIE,
      signSession({
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        locationIds: (user.locationIds || []).map(String),
        allow: user.allow || [],
        deny: user.deny || [],
      }),
      cookieOptions
    );

    return json({
      ok: true,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        locationIds: (user.locationIds || []).map(String),
      },
      message: 'Login successful',
    });

  } catch (error) {
    console.error('[Admin OTP Verify Error]:', error);
    return json({ error: 'An error occurred while verifying OTP. Please try again.' }, 500);
  }
}

export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function PUT() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function DELETE() {
  return json({ error: 'Method not allowed' }, 405);
}
