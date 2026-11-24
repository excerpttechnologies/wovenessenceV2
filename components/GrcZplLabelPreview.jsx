'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import Icon from './Icon';
import { getSingleLabelZplWithHeader, DEFAULT_ZPL_CONFIG } from '@/lib/zpl90x68';

// Client-side cache to make label switching instantaneous (< 1ms)
const clientPreviewCache = new Map();

/**
 * High-Fidelity Local ZPL Canvas Parser (Offline Engine).
 * Parses the reference ZPL commands and paints them on a 1033 × 803 Canvas.
 */
function renderZplToCanvas(canvas, zplStr) {
  if (!canvas || !zplStr) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = 1033;
  const height = 803;
  canvas.width = width;
  canvas.height = height;

  // Clear white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 1. Draw Barcode: ^FO333,177^BY4^BCR,105,N,N^FD...^FS
  const bcMatch = /\^FO(\d+),(\d+)[\s\S]*?\^BY(\d+)\^BCR,(\d+)[\s\S]*?\^FD([^^]+)\^FS/.exec(zplStr);
  if (bcMatch) {
    const originX = parseInt(bcMatch[1], 10);
    const originY = parseInt(bcMatch[2], 10);
    const bcHeight = parseInt(bcMatch[4], 10) || 105;
    let rawData = bcMatch[5].trim();

    // Strip ZPL Code 128 subset shift markers like >: or >5 or >6
    const cleanBarcode = rawData.replace(/>[0-9:;<=]/g, '').trim();

    try {
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(tempSvg, cleanBarcode, {
        format: 'CODE128',
        width: 4,
        height: bcHeight,
        displayValue: false,
        margin: 0,
      });

      const xml = new XMLSerializer().serializeToString(tempSvg);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(Math.PI / 2); // 90° clockwise (^BCR)
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      };
      img.src = 'data:image/svg+xml;base64,' + svg64;
    } catch (e) {
      console.warn('Canvas barcode render failed:', e);
    }
  }

  // 2. Draw Text Fields: ^FT(x),(y)...^A0R,(h),(w)^FD(text)^FS
  const textRegex = /\^FT(\d+),(\d+)[\s\S]*?\^A0R,(\d+),(\d+)\^FD([^^]*?)\^FS/g;
  let match;
  while ((match = textRegex.exec(zplStr)) !== null) {
    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    const fontH = parseInt(match[3], 10);
    const fontW = parseInt(match[4], 10);
    const text = match[5];

    if (!text) continue;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2); // 90° clockwise (^A0R)
    ctx.fillStyle = '#000000';
    // Use bold sans-serif with fontH to match Zebra Smooth Font 0
    ctx.font = `900 ${fontH}px "Arial Black", Arial, Helvetica, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

/**
 * Universal ZPL Label Preview Component.
 *
 * Architecture:
 *   Product data → ZPL generator → PRN string → Preview Renderer
 *
 * Renders the EXACT physical ZPL label as generated for the printer:
 *   1. Queries /api/zpl/preview (Labelary Zebra Official Engine) with caching.
 *   2. Falls back instantly to High-Precision HTML5 Canvas if offline or loading.
 *   3. Supports Printhead View (Landscape 90×68mm) & Reading View (Portrait 68×90mm).
 */
export default function GrcZplLabelPreview({
  row,
  zpl: directZpl = null,
  config = DEFAULT_ZPL_CONFIG,
  isPrint = false,
  showControls = true,
}) {
  const [readingView, setReadingView] = useState(true);
  const [showZpl, setShowZpl] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [renderSource, setRenderSource] = useState('canvas'); // 'labelary' | 'canvas'

  const canvasRef = useRef(null);

  // Compute the single source of truth ZPL
  const activeZpl = useMemo(() => {
    if (directZpl) return directZpl.trim();
    if (!row) return '';
    return getSingleLabelZplWithHeader(row, config).trim();
  }, [directZpl, row, config]);

  useEffect(() => {
    if (!activeZpl) return;

    // Check client-side memory cache first for 0ms render
    if (clientPreviewCache.has(activeZpl)) {
      setPreviewImg(clientPreviewCache.get(activeZpl));
      setRenderSource('labelary');
      setLoading(false);
      return;
    }

    // Immediately render local canvas as instant preview / offline fallback
    if (canvasRef.current) {
      renderZplToCanvas(canvasRef.current, activeZpl);
      setRenderSource('canvas');
    }

    let cancelled = false;
    setLoading(true);

    fetch('/api/zpl/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zpl: activeZpl, width: 3.54, height: 2.68, dpmm: 12 }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.image) {
          clientPreviewCache.set(activeZpl, data.image);
          setPreviewImg(data.image);
          setRenderSource('labelary');
        }
      })
      .catch((err) => {
        console.warn('ZPL preview API error, keeping canvas preview:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeZpl]);

  if (!activeZpl) {
    return <div className="p-4 text-center text-xs text-slate-500">No label data available</div>;
  }

  // When used inside the browser print layout (window.print()):
  if (isPrint) {
    return (
      <div
        className="zpl-print-label"
        style={{
          width: '90mm',
          height: '68mm',
          maxWidth: '90mm',
          maxHeight: '68mm',
          boxSizing: 'border-box',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
        }}
      >
        {previewImg ? (
          <img
            src={previewImg}
            alt="ZPL Label"
            style={{ width: '90mm', height: '68mm', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <canvas
            ref={canvasRef}
            style={{ width: '90mm', height: '68mm', objectFit: 'contain', display: 'block' }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="zpl-preview-card flex flex-col items-center select-none">
      {/* Header Controls */}
      {showControls && (
        <div className="mb-3 flex w-full max-w-[500px] flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-white">
              90 × 68 MM ZPL
            </span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {renderSource === 'labelary' ? 'Zebra Engine Match' : 'Local ZPL Preview'}
            </span>
            {loading && <span className="spin text-slate-400" />}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReadingView((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              title="Toggle between Reading Orientation (Portrait) and Printhead Roll Orientation (Landscape)"
            >
              <Icon name="refresh" size={12} />
              {readingView ? 'View: Reading (Portrait)' : 'View: Printhead (90×68)'}
            </button>

            <button
              type="button"
              onClick={() => setShowZpl((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11.5px] font-medium shadow-sm ${
                showZpl
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon name="file" size={12} />
              {showZpl ? 'Hide ZPL' : 'View ZPL'}
            </button>
          </div>
        </div>
      )}

      {/* Visual Label Frame */}
      <div className="relative flex items-center justify-center p-3">
        <div
          className="relative rounded-lg bg-white shadow-xl transition-all duration-300 ease-in-out border border-slate-300 overflow-hidden"
          style={
            readingView
              ? {
                  width: '68mm',
                  height: '90mm',
                  minWidth: '256px',
                  minHeight: '340px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
              : {
                  width: '90mm',
                  height: '68mm',
                  minWidth: '340px',
                  minHeight: '256px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }
          }
        >
          {/* Label Image or Canvas */}
          <div
            style={{
              width: '90mm',
              height: '68mm',
              transform: readingView ? 'rotate(270deg)' : 'none',
              transformOrigin: 'center center',
              transition: 'transform 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {previewImg ? (
              <img
                src={previewImg}
                alt="Exact ZPL Preview"
                className="pointer-events-none"
                style={{
                  width: '90mm',
                  height: '68mm',
                  objectFit: 'contain',
                  imageRendering: 'crisp-edges',
                }}
              />
            ) : (
              <canvas
                ref={canvasRef}
                style={{
                  width: '90mm',
                  height: '68mm',
                  objectFit: 'contain',
                  imageRendering: 'crisp-edges',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Orientation Helper Subtitle */}
      {showControls && (
        <div className="mt-1 text-[11px] text-slate-500 text-center">
          {readingView
            ? 'Displayed in upright reading orientation (portrait). Click "View: Reading" above to switch to roll feed orientation.'
            : 'Displayed in physical printhead feed orientation (90mm width × 68mm feed).'}
        </div>
      )}

      {/* Raw ZPL Inspector Drawer */}
      {showZpl && (
        <div className="mt-3 w-full max-w-[500px] rounded-lg border border-slate-300 bg-slate-900 p-3 text-left shadow-inner">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-mono font-bold text-slate-300">Generated ZPL (Source of Truth)</span>
            <button
              type="button"
              className="text-xs text-brand hover:underline"
              onClick={() => navigator.clipboard?.writeText(activeZpl)}
            >
              Copy ZPL
            </button>
          </div>
          <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-emerald-400 select-all">
            {activeZpl}
          </pre>
        </div>
      )}
    </div>
  );
}
