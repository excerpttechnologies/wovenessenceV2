'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Icon from './Icon';

/* ─── helpers ─────────────────────────────────────────────────────────── */

function defaultCrop(w, h) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, undefined, w, h),
    w,
    h,
  );
}

function exportDataUrl(img, crop, mimeType) {
  /* crop is in % units */
  const scaleX = img.naturalWidth  / img.width;
  const scaleY = img.naturalHeight / img.height;

  const x = Math.round((crop.x      / 100) * img.width  * scaleX);
  const y = Math.round((crop.y      / 100) * img.height * scaleY);
  const w = Math.round((crop.width  / 100) * img.width  * scaleX);
  const h = Math.round((crop.height / 100) * img.height * scaleY);

  if (w < 1 || h < 1) return null;

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);

  const type = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const url  = canvas.toDataURL(type, 0.92);
  return url === 'data:,' ? null : url;
}

/* ─── component ───────────────────────────────────────────────────────── */

export default function ImageCropModal({ imageFile, onCrop, onCancel }) {
  const [crop, setCrop]             = useState(null);
  const [completedCrop, setCompleted] = useState(null);
  const [processing, setProcessing]  = useState(false);
  const [error, setError]            = useState('');
  const imgRef = useRef(null);

  /* Stable object URL — created once, cleaned up on unmount */
  const [imageSrc] = useState(() =>
    imageFile ? URL.createObjectURL(imageFile) : null,
  );
  useEffect(() => () => { if (imageSrc) URL.revokeObjectURL(imageSrc); }, [imageSrc]);

  /* Lock body scroll while modal is open (important on mobile) */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onImageLoad = useCallback((e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    const c = defaultCrop(w, h);
    setCrop(c);
    setCompleted(c);
  }, []);

  const handleSave = useCallback(() => {
    const img = imgRef.current;
    if (!img || !completedCrop) return;
    setProcessing(true);
    setError('');
    try {
      const dataUrl = exportDataUrl(img, completedCrop, imageFile?.type);
      if (!dataUrl) throw new Error('Could not export the cropped area — please adjust the selection.');
      onCrop(dataUrl);
    } catch (err) {
      setError(err.message || 'Crop failed.');
      setProcessing(false);
    }
  }, [completedCrop, imageFile, onCrop]);

  return (
    /*
      Full-screen overlay.
      On mobile this fills the whole viewport so the user gets maximum
      space to drag the crop handles.
    */
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/70"
      style={{ touchAction: 'none' }}   /* prevent page scroll during drag */
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="mr-3 rounded p-1 text-inkmuted hover:bg-slate-100 hover:text-ink active:bg-slate-200"
          aria-label="Close"
        >
          <Icon name="x" size={20} />
        </button>
        <span className="text-[15px] font-bold text-ink">Crop Image</span>
      </div>

      {/* ── Crop area — fills all remaining space ───────────────────── */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3"
        style={{ background: '#1e1e1e' }}
      >
        {imageSrc && (
          <ReactCrop
            crop={crop}
            onChange={(_px, pct) => setCrop(pct)}
            onComplete={(_px, pct) => setCompleted(pct)}
            ruleOfThirds
            /* Minimum crop selection: 20px so a stray tap doesn't create
               a 1×1px crop */
            minWidth={20}
            minHeight={20}
            style={{ maxWidth: '100%', touchAction: 'none' }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              draggable={false}
              style={{
                /* On mobile use most of the screen height */
                maxHeight: 'calc(100dvh - 140px)',
                maxWidth: '100%',
                display: 'block',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            />
          </ReactCrop>
        )}
      </div>

      {/* ── Hint ───────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-black/60 px-4 py-1.5 text-center text-[11px] text-white/70">
        Drag corners&nbsp;/&nbsp;edges to resize · Drag inside to move
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white px-4 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.08)]">
        {error && (
          <p className="mb-2 rounded bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            className="btn flex-1"
            onClick={onCancel}
            disabled={processing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={handleSave}
            disabled={processing || !completedCrop}
          >
            {processing
              ? <span className="spin mr-1" />
              : <Icon name="check" size={15} />}
            Crop &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}
