'use client';

import { useEffect, useState, useMemo } from 'react';
import Icon from './Icon';

/**
 * Convert base64 Data URL to a native Blob so that it can be safely previewed
 * in iframes or opened in new tabs without getting blocked by browser navigation policies.
 */
function dataUrlToBlob(dataUrl) {
  try {
    const parts = dataUrl.split(';base64,');
    if (parts.length < 2) return null;
    const contentType = parts[0].split(':')[1] || 'application/octet-stream';
    const raw = atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  } catch (err) {
    console.warn('Failed to convert dataUrl to blob:', err);
    return null;
  }
}

export default function DocumentPreviewModal({ open, url, title = 'Document Preview', onClose }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Determine document type
  const isPdf = useMemo(() => {
    if (!url) return false;
    const str = String(url).toLowerCase();
    return str.startsWith('data:application/pdf') || str.includes('.pdf');
  }, [url]);

  const isImage = useMemo(() => {
    if (!url) return false;
    const str = String(url).toLowerCase();
    return (
      str.startsWith('data:image/') ||
      str.includes('.jpg') ||
      str.includes('.jpeg') ||
      str.includes('.png') ||
      str.includes('.webp') ||
      str.includes('.gif')
    );
  }, [url]);

  // Convert data: URL to blob: URL for safe in-browser embedding
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    if (!open || !url) {
      setBlobUrl('');
      return;
    }

    if (String(url).startsWith('data:')) {
      const blob = dataUrlToBlob(url);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        return () => {
          URL.revokeObjectURL(objectUrl);
        };
      }
    }
    setBlobUrl('');
  }, [open, url]);

  // Reset controls on open
  useEffect(() => {
    if (open) {
      setZoom(1);
      setRotation(0);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  const activeUrl = blobUrl || url;

  const handleOpenNewTab = () => {
    if (!activeUrl) return;
    window.open(activeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3 bg-[#f8fafc] rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-bold text-slate-800 truncate">{title}</span>
            <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 uppercase">
              {isPdf ? 'PDF Document' : isImage ? 'Image' : 'File'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Image zoom & rotate toolbar */}
            {isImage && (
              <div className="mr-2 hidden sm:flex items-center gap-1 border-r border-line pr-3">
                <button
                  type="button"
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-200"
                  title="Zoom Out"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))))}
                >
                  <Icon name="minus" size={14} />
                </button>
                <span className="text-[12px] font-mono text-slate-600 min-w-[42px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-200"
                  title="Zoom In"
                  onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.2).toFixed(1))))}
                >
                  <Icon name="plus" size={14} />
                </button>
                <button
                  type="button"
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-200 ml-1"
                  title="Rotate 90°"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                >
                  <Icon name="refresh" size={14} />
                </button>
                <button
                  type="button"
                  className="text-[11px] text-slate-600 hover:text-brand underline ml-1"
                  onClick={() => { setZoom(1); setRotation(0); }}
                >
                  Reset
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn btn-sm text-[12px] flex items-center gap-1.5 border border-line"
              onClick={handleOpenNewTab}
              title="Open document in a new browser tab"
            >
              <Icon name="eye" size={14} />
              <span>New Tab</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-red-600 hover:text-white transition-colors"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="relative flex-1 overflow-auto bg-[#525659] p-2 sm:p-4 min-h-[60vh] max-h-[82vh] flex items-center justify-center">
          {isPdf ? (
            <iframe
              src={activeUrl}
              title={title}
              className="h-[75vh] w-full rounded bg-white shadow"
            />
          ) : isImage ? (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeUrl}
                alt={title}
                className="max-h-[75vh] max-w-full rounded shadow object-contain transition-transform duration-150"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          ) : (
            <div className="rounded-lg bg-white p-8 text-center shadow-lg max-w-md">
              <div className="mb-3 flex justify-center text-slate-400">
                <Icon name="file" size={48} />
              </div>
              <h4 className="text-[15px] font-bold text-slate-800">Preview Not Available</h4>
              <p className="mt-2 text-[13px] text-slate-600">
                This document format cannot be previewed directly inside the window. You can open or view it in a new tab.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-4"
                onClick={handleOpenNewTab}
              >
                Open in New Tab
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

