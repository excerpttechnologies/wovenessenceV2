'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

/* Product thumbnail with a real fallback.

   The till was rendering <img src={row.image}> directly. A staff photo that
   has been deleted, or a path that never resolved, then renders as the
   browser's broken-image placeholder - which is a different SIZE from the
   image it replaces, so one missing photo pushes the whole row out of
   alignment and the operator loses their place in the list.

   This keeps the box the same size whatever happens: no image, a broken
   image and a loading image all occupy exactly the declared square. The
   fallback shows the item's initials, which is more use at a counter than a
   generic icon - it tells the operator which line they are looking at.

   `onOpen` makes the thumbnail a button; without it the image is inert, so
   a decorative thumbnail is not a dead control. */

export default function ProductImage({ src, alt = '', size = 40, onOpen, className = '' }) {
  const [failed, setFailed] = useState(false);

  /* a new src gets a fresh chance - without this, one failure would
     permanently blank the slot as the operator scrolls through items */
  useEffect(() => { setFailed(false); }, [src]);

  const box = { width: size, height: size, minWidth: size };
  const initials = String(alt || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  const inner = src && !failed ? (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full rounded object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="flex h-full w-full items-center justify-center rounded bg-[#eef1f7] font-semibold text-inkmuted"
      style={{ fontSize: Math.max(10, Math.round(size / 3.2)) }}
      title={src ? 'Image could not be loaded' : 'No image'}
    >
      {size >= 34 ? initials : <Icon name="eye" size={Math.round(size / 2.4)} />}
    </span>
  );

  if (!onOpen) {
    return <span className={'block shrink-0 overflow-hidden rounded ' + className} style={box}>{inner}</span>;
  }

  return (
    <button
      type="button"
      title={src && !failed ? 'Tap to enlarge' : 'No image'}
      aria-label={src && !failed ? 'Enlarge image of ' + alt : 'No image for ' + alt}
      disabled={!src || failed}
      className={'block shrink-0 overflow-hidden rounded ' + (src && !failed ? 'cursor-zoom-in ring-offset-1 hover:ring-2 hover:ring-brand ' : 'cursor-default ') + className}
      style={box}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
    >
      {inner}
    </button>
  );
}
