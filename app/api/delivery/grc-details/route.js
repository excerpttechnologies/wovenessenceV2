import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Grc from '@/models/Grc';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

/**
 * GET /api/delivery/grc-details
 * 
 * Fetch GRC details for automatic population in GRT Delivery form
 * 
 * Query params:
 * - supplierId: Filter by supplier
 * - lrTransactionId: Filter by LR transaction (unique match)
 * - grcId: Get specific GRC details
 * - businessId, locationId, finYear: Scope filtering
 */
export async function GET(req) {
  try {
    const session = await requireSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectDB();

    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get('supplierId');
    const lrTransactionId = searchParams.get('lrTransactionId');
    const grcId = searchParams.get('grcId');
    const businessId = searchParams.get('businessId') || searchParams.get('business');
    const locationId = searchParams.get('locationId') || searchParams.get('location');
    const finYear = searchParams.get('finYear');

    const scope = await resolveAuthorizedScope(session, { businessId, locationId });
    if (!scope.ok) return scopeErrorResponse(scope);

    // Build query
    const query = {};

    if (scope.businessFilter) query.businessId = scope.businessFilter;
    if (scope.locationFilter) query.locationId = scope.locationFilter;
    if (finYear) query.finYear = finYear;

    // Specific GRC lookup
    if (grcId) {
      query._id = grcId;
    } else if (lrTransactionId) {
      // Unique match by LR transaction
      query.lrTransactionId = lrTransactionId;
    } else if (supplierId) {
      // Multiple GRCs possible
      query.supplierId = supplierId;
    } else {
      return NextResponse.json(
        { error: 'Missing required parameter: supplierId, lrTransactionId, or grcId' },
        { status: 400 }
      );
    }

    // Fetch GRC records with supplier population
    const grcs = await Grc.find(query)
      .populate('supplierId', 'companyName contactId gstNo')
      .sort({ grcDate: -1 })
      .lean();

    if (!grcs || grcs.length === 0) {
      return NextResponse.json({ grcs: [], count: 0 });
    }

    // Format response with all necessary information
    const formattedGrcs = grcs.map((grc) => ({
      _id: grc._id,
      grcNumber: grc.grcNumber || '',
      grcDate: grc.grcDate,
      lrTransactionId: grc.lrTransactionId,
      lrTransactionNo: grc.lrTransactionNo || '',
      
      // Supplier information
      supplierId: grc.supplierId?._id || grc.supplierId,
      supplierName: grc.supplierId?.companyName || '',
      supplierCode: grc.supplierId?.contactId || '',
      vendorGstNo: grc.vendorGstNo || grc.supplierId?.gstNo || '',
      
      // Invoice information
      vendorDocNo: grc.vendorDocNo || '',
      vendorInvoiceDate: grc.grcDate, // Use GRC date as invoice date if not separate
      
      // Documents
      vendorInvoiceCopy: grc.vendorInvoiceCopy || '',
      vendorWaybill: grc.vendorWaybill || '',
      
      // Additional fields
      purchaseTermId: grc.purchaseTermId,
      agentId: grc.agentId,
      taxableValue: grc.taxableValue,
      totalAmount: grc.totalAmount,
    }));

    return NextResponse.json({
      grcs: formattedGrcs,
      count: formattedGrcs.length,
      // If single match (by LR transaction), return it directly
      grc: formattedGrcs.length === 1 ? formattedGrcs[0] : null,
    });

  } catch (error) {
    console.error('[GRC Details API Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch GRC details', details: error.message },
      { status: 500 }
    );
  }
}
