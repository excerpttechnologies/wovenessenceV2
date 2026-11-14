'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';

/* Gallery manager for the existing product-eccom Add/Edit form.
   Uploads real JPEG/PNG/WebP photos, previews them, reorders them, sets the
   primary image and saves the result into ecommerceproduct.additionalImages
   (plus the existing `image` primary field). No separate product record is
   created and another product's gallery is never touched. */

const MAX_IMAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function isAllowedUrl(value) {
  const url = String(value || '').trim();
  if (!url) return false;
  if (url.startsWith('/')) return !url.startsWith('//');
  return /^https?:\/\//i.test(url);
}

export default function ProductGalleryManager({
  sku,
  primary,
  images,
  onPrimaryChange,
  onImagesChange,
}) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const extras = asArray(images);
  const primaryUrl = String(primary || '').trim();
  const total = (primaryUrl ? 1 : 0) + extras.length;
  const remaining = Math.max(0, MAX_IMAGES - total);

  const removeImage = (url) => {
    const next = extras.filter((item) => item !== url);
    onImagesChange(next);
    /* removing the primary promotes the next remaining photo, if any */
    if (primaryUrl === url) onPrimaryChange(next[0] || '');
  };

  const moveImage = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= extras.length) return;
    const next = [...extras];
    [next[index], next[target]] = [next[target], next[index]];
    onImagesChange(next);
  };

  const uploadOne = (file, index, totalFiles) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/product-eccom/gallery');
    request.withCredentials = true;
    request.timeout = 120000;
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      setProgress({
        index,
        total: totalFiles,
        name: file.name,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100)),
      });
    };
    request.onerror = () => reject(new Error('Network error while uploading. Please try again.'));
    request.ontimeout = () => reject(new Error('The upload timed out. Please try again.'));
    request.onload = () => {
      let body = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // The HTTP status still explains the failure.
      }
      if (request.status < 200 || request.status >= 300 || body.error) {
        reject(new Error(body.error || `The image could not be uploaded (HTTP ${request.status})`));
        return;
      }
      const url = body.url;
      if (typeof url !== 'string' || !url) {
        reject(new Error('The upload did not return an image URL.'));
        return;
      }
      resolve(url);
    };
    const form = new FormData();
    form.append('file', file);
    form.append('sku', sku);
    request.send(form);
  });

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || !sku || uploading) return;

    const valid = files.filter((file) => {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 8 MB.`);
        return false;
      }
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        setError(`${file.name} is not a JPEG, PNG or WebP image.`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    setUploading(true);
    setError('');
    setNotice('');
    let uploaded = 0;
    let workingExtras = [...extras];
    let workingPrimary = primaryUrl;

    for (let index = 0; index < valid.length; index += 1) {
      const file = valid[index];
      setProgress({ index, total: valid.length, name: file.name, percent: 0 });
      try {
        const url = await uploadOne(file, index, valid.length);
        if (!isAllowedUrl(url) || workingExtras.includes(url)) {
          setNotice(`${file.name} is already in this gallery.`);
          continue;
        }
        const room = Math.max(0, MAX_IMAGES - (workingPrimary ? 1 : 0) - workingExtras.length);
        if (room <= 0) {
          setNotice(`Only ${MAX_IMAGES} images are allowed. ${file.name} was not added.`);
          continue;
        }
        if (!workingPrimary) {
          /* first usable photo becomes the primary; later ones are extras */
          workingPrimary = url;
          onPrimaryChange(url);
        } else {
          workingExtras = [...workingExtras, url];
        }
        uploaded += 1;
      } catch (uploadError) {
        setError(uploadError.message || 'The image could not be uploaded.');
      }
    }

    if (uploaded > 0) {
      onImagesChange(workingExtras);
      setNotice(`${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded. Save the product to publish the gallery.`);
    }
    setProgress(null);
    setUploading(false);
  };

  return (
    <section className="mt-4 rounded border border-line bg-slate-50 p-3" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink">Product gallery</h2>
          <p className="mt-0.5 text-[12px] text-inkmuted">
            Up to {MAX_IMAGES} real photos for this product. Upload several at once, reorder them, or set one as the main image.
          </p>
        </div>
        <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">
          {total} / {MAX_IMAGES}
        </span>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!sku || uploading || remaining === 0}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="upload" size={14} />
          {uploading ? 'Uploading...' : 'Upload photos'}
        </button>
        <span className="text-[12px] text-inkmuted">
          JPEG, PNG or WebP · up to 8 MB each
        </span>
        {primaryUrl && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={uploading}
            onClick={() => onPrimaryChange('')}
          >
            <Icon name="refresh" size={14} />
            Use barcode image
          </button>
        )}
      </div>

      {progress && (
        <div className="mt-2 rounded border border-line bg-white p-2">
          <div className="flex items-center justify-between gap-3 text-[12px] text-ink">
            <span className="truncate">
              Uploading {progress.index + 1} of {progress.total}: {progress.name}
            </span>
            <span className="shrink-0 font-semibold">{progress.percent}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div className="h-full bg-blue-600 transition-[width] duration-150" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {error && <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700" role="alert">{error}</div>}
      {notice && <div className="mt-2 rounded border border-line bg-white px-2.5 py-2 text-[12px] text-ink">{notice}</div>}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <div className="f-label">Primary image</div>
          <div className="relative h-36 overflow-hidden rounded border border-line bg-white">
            {primaryUrl ? (
              <img src={primaryUrl} alt="Primary product" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-[12px] text-inkmuted">
                No primary image set
              </div>
            )}
            {primaryUrl && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white">
                Primary
              </span>
            )}
          </div>
        </div>

        <div className="col-span-2">
          <div className="f-label">Gallery images ({extras.length})</div>
          {extras.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {extras.map((url, index) => (
                <li key={`${url}-${index}`} className="relative h-36 overflow-hidden rounded border border-line bg-white">
                  <img src={url} alt={`Gallery image ${index + 1}`} className="h-full w-full object-cover" />
                  {primaryUrl === url && (
                    <span className="absolute inset-x-0 bottom-0 bg-blue-600/80 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white">
                      Primary
                    </span>
                  )}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/45 to-transparent p-1">
                    <button
                      type="button"
                      className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-ink hover:bg-white"
                      onClick={() => onPrimaryChange(url)}
                    >
                      Set primary
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded bg-white/90 p-1 text-ink hover:bg-white disabled:opacity-40"
                        disabled={index === 0}
                        aria-label="Move image up"
                        onClick={() => moveImage(index, -1)}
                      >
                        <Icon name="chevL" size={12} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        className="rounded bg-white/90 p-1 text-ink hover:bg-white disabled:opacity-40"
                        disabled={index === extras.length - 1}
                        aria-label="Move image down"
                        onClick={() => moveImage(index, 1)}
                      >
                        <Icon name="chevL" size={12} className="-rotate-90" />
                      </button>
                      <button
                        type="button"
                        className="rounded bg-white/90 p-1 text-red-600 hover:bg-white"
                        aria-label="Remove image"
                        onClick={() => removeImage(url)}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex h-36 items-center justify-center rounded border border-dashed border-line bg-white px-3 text-center text-[12px] text-inkmuted">
              No gallery images yet. Upload photos to show more views of this product.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
