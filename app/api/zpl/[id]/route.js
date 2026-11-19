import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import BarcodeLabel from '@/models/BarcodeLabel';
import { generateBatchZpl90x68, generateTestPrn, DEFAULT_ZPL_CONFIG } from '@/lib/zpl90x68';

export async function GET(req, { params }) {
  const { id } = await params;

  if (id === 'test') {
    const { searchParams } = new URL(req.url);
    const count = Math.max(1, Number(searchParams.get('count')) || 1);
    const prn = generateTestPrn(count);
    return new NextResponse(prn, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="test_${count}_labels_90x68.prn"`,
      },
    });
  }

  try {
    await dbConnect();
    const grc = await Grc.findById(id).lean();
    if (!grc) {
      return NextResponse.json({ error: 'GRC not found' }, { status: 404 });
    }

    const rows = await BarcodeLabel.find({ grcId: id }).lean();
    const printableRows = rows.filter((r) => r.barcodeNo || r.barcodeGenerated);

    if (!printableRows.length) {
      return NextResponse.json({ error: 'No barcode labels found for this GRC' }, { status: 400 });
    }

    const prn = generateBatchZpl90x68(printableRows, DEFAULT_ZPL_CONFIG);

    return new NextResponse(prn, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="grc_${grc.grcNumber || id}_90x68.prn"`,
      },
    });
  } catch (err) {
    console.error('Error generating ZPL for GRC:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate ZPL' }, { status: 500 });
  }
}
