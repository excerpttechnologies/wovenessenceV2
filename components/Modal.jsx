'use client';

import { useEffect, useRef } from 'react';
import Icon from './Icon';

/* ==========================================================================
   Dialog shell.

   The chrome only - backdrop, panel, title bar, close button, Escape and
   backdrop-click to dismiss. What goes inside is the caller's business, so
   one shell serves the delete confirmation, the record preview, and anything
   added later.

   Dismissal is on mousedown rather than click, and only when the press
   STARTED on the backdrop: a click that begins inside the panel and ends on
   the backdrop - selecting text and releasing past the edge - would otherwise
   close the dialog mid-gesture.
   ========================================================================== */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Move focus in, so Escape reaches the handler and the reader announces
     the dialog rather than leaving the caller's button focused behind it. */
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const width =
    size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';

  return (
    <div
      className="mdl-backdrop no-print"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={'mdl-panel ' + width}
      >
        {title && (
          <div className="mdl-head">
            <span className="mdl-title">{title}</span>
            <button type="button" className="mdl-x" aria-label="Close" onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          </div>
        )}

        <div className="mdl-body">{children}</div>

        {footer && <div className="mdl-foot">{footer}</div>}
      </div>
    </div>
  );
}
