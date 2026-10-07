/* ==========================================================================
   Downscale an image in the browser before it is uploaded.

   Not a storage decision - files are stored on the server (lib/uploads.js).
   This is purely about not sending a 12 MP phone photo over the wire and
   keeping it on disk forever when the screen shows a 80px thumbnail.

   Returns a Blob ready to POST as multipart. Anything that will not fit
   under the ceiling is refused with a message rather than uploaded anyway.
   ========================================================================== */

export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const DEFAULT_MAX_DIM = 1600;
export const DEFAULT_MAX_BYTES = 600 * 1024;

export function prettyBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function loadBitmap(file) {
  /* createImageBitmap decodes off the main thread where it exists; the
     <img> path is the fallback for older Safari */
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImg(file));
  }
  return loadViaImg(file);
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image. HEIC photos are not supported - save as JPG or PNG.'));
    };
    img.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode that image.'))),
      type,
      quality
    );
  });
}

export async function compressImage(file, opts = {}) {
  const maxDim = opts.maxDim || DEFAULT_MAX_DIM;
  const maxBytes = opts.maxBytes || DEFAULT_MAX_BYTES;

  if (!file) throw new Error('No file selected.');
  if (!String(file.type).startsWith('image/')) {
    throw new Error('Pick an image file (JPG, PNG, WebP or GIF).');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is ' + prettyBytes(file.size) + '. The limit is ' + prettyBytes(MAX_SOURCE_BYTES) + '.');
  }

  const bmp = await loadBitmap(file);
  const w = bmp.width;
  const h = bmp.height;
  if (!w || !h) throw new Error('That image appears to be empty.');

  const scale = Math.min(1, maxDim / Math.max(w, h));

  /* Already small enough and in a format the server accepts - upload the
     original rather than re-encoding it, which would only lose quality. */
  if (scale === 1 && file.size <= maxBytes && file.type === 'image/jpeg') {
    if (typeof bmp.close === 'function') bmp.close();
    return { blob: file, bytes: file.size, width: w, height: h, type: file.type };
  }

  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  /* JPEG has no alpha, so a transparent PNG would come out on black
     unless the canvas is painted first */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(bmp, 0, 0, cw, ch);
  if (typeof bmp.close === 'function') bmp.close();

  let quality = 0.85;
  let blob = await toBlob(canvas, 'image/jpeg', quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality = Math.round((quality - 0.1) * 100) / 100;
    blob = await toBlob(canvas, 'image/jpeg', quality);
  }

  if (blob.size > maxBytes) {
    throw new Error('This image will not compress under ' + prettyBytes(maxBytes) + '. Crop it or use a smaller one.');
  }

  return { blob, bytes: blob.size, width: cw, height: ch, type: 'image/jpeg' };
}
