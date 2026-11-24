import { NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory LRU cache for rendered ZPL label images
const previewCache = new Map();
const MAX_CACHE_SIZE = 150;

function getZplHash(zpl, dpmm, width, height) {
  return crypto
    .createHash('sha256')
    .update(`${zpl}|${dpmm}|${width}|${height}`)
    .digest('hex');
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawZpl = String(body.zpl || '').trim();

    if (!rawZpl) {
      return NextResponse.json({ error: 'ZPL content is required' }, { status: 400 });
    }

    // Default dimensions: 90×68 mm (3.54 × 2.68 inches) at 300 DPI (12 dpmm)
    const dpmm = Number(body.dpmm) || 12;
    const width = Number(body.width) || 3.54;
    const height = Number(body.height) || 2.68;
    const index = Number(body.index) || 0;

    const cacheKey = getZplHash(rawZpl, dpmm, width, height);
    if (previewCache.has(cacheKey)) {
      return NextResponse.json({
        success: true,
        cached: true,
        image: previewCache.get(cacheKey),
      });
    }

    // Call Labelary API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const labelaryUrl = `http://api.labelary.com/v1/printers/${dpmm}dpmm/labels/${width}x${height}/${index}/`;
    const res = await fetch(labelaryUrl, {
      method: 'POST',
      headers: {
        Accept: 'image/png',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: rawZpl,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Labelary error');
      return NextResponse.json(
        { success: false, error: `Renderer returned ${res.status}: ${errText}` },
        { status: 502 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    // Manage cache size
    if (previewCache.size >= MAX_CACHE_SIZE) {
      const firstKey = previewCache.keys().next().value;
      previewCache.delete(firstKey);
    }
    previewCache.set(cacheKey, dataUrl);

    return NextResponse.json({
      success: true,
      cached: false,
      image: dataUrl,
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Rendering service timed out' : err.message || 'Render failed',
      },
      { status: 500 }
    );
  }
}
