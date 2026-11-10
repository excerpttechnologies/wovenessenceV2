import { cookies } from 'next/headers';
import dbConnect from '@/lib/db';
import StorefrontCustomer from '@/models/StorefrontCustomer';
import { COOKIE, readSession } from '@/lib/auth';
import { isValidObjectId } from 'mongoose';

/* ==========================================================================
   GET /api/auth/customer/me
   
   Get current customer session information
   - Reads session cookie
   - Returns customer profile
   - Returns 401 if not authenticated or invalid session
   
   Protected endpoint (requires customer session)
   ========================================================================== */

const json = (data, status = 200) => Response.json(data, { status });

export async function GET() {
  try {
    const jar = await cookies();
    const session = readSession(jar.get(COOKIE)?.value);

    // Check if session exists and is customer session
    if (!session || session.type !== 'customer') {
      return json({ customer: null, authenticated: false }, 401);
    }

    // Validate customer ID
    if (!session.customerId || !isValidObjectId(session.customerId)) {
      return json({ customer: null, authenticated: false }, 401);
    }

    await dbConnect();

    // Fetch fresh customer data
    const customer = await StorefrontCustomer.findOne({
      _id: session.customerId,
      isDeleted: false,
      status: 'active',
    }).lean();

    if (!customer) {
      // Customer deleted or suspended - clear cookie
      jar.delete(COOKIE);
      return json(
        {
          customer: null,
          authenticated: false,
          error: 'Account not found or inactive',
        },
        401
      );
    }

    // Return customer profile
    return json({
      customer: {
        id: String(customer._id),
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        emailVerified: customer.emailVerified,
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
      },
      authenticated: true,
    });

  } catch (error) {
    console.error('[Customer Me Error]:', error);
    return json(
      { customer: null, authenticated: false, error: 'Session validation failed' },
      500
    );
  }
}

// Only GET allowed
export async function POST() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function PUT() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function DELETE() {
  return json({ error: 'Method not allowed' }, 405);
}
