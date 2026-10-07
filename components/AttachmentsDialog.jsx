'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

/* ==========================================================================
   ATTACHMENTS - "Upload Document / Photo" for one record.

   Opened from the Upload button in a list's Action column. It is a DOCUMENT
   AND PHOTO uploader and nothing else: there is no camera stream, no barcode
   or QR reading anywhere in here. Where a device offers its camera it is the
   browser's own file input doing it - an ordinary accept list, with no
   `capture`, so a phone shows Camera and Photo Library side by side and
   neither is forced.

   IT IS ALWAYS ABOUT ONE RECORD. `kind` and `id` are handed in by the row the
   button was pressed on and are sent with every request, so a file can only
   ever land on that record. Nothing here knows a record id of its own and
   none is written down.

   Storage is the application's existing one: POST /api/attachments puts the
   bytes through lib/uploads.js - the same content-addressed store behind
   /api/upload - and pushes the resulting /api/files URL onto the record's
   `attachments` array. Uploading a second file appends; it never replaces.
   ========================================================================== */

/* The accept lists, kept in step with the server allowlist in lib/uploads.js.
   They are a CONVENIENCE - they steer the file picker - and are not trusted:
   /api/attachments checks the MIME against its own allowlist regardless. */
const DOC_ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
].join(',');
/* NOT the bare image/* wildcard: that offers HEIC, AVIF, BMP and SVG, which
   the server allowlist refuses - so a phone photo saved as HEIC would upload
   in full and only then be rejected. These are the four the store accepts,
   named by both extension and type so every picker understands them. */
const PHOTO_ACCEPT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
].join(',');

const MAX_BYTES = 10 * 1024 * 1024;          // mirrors MAX_UPLOAD_BYTES

const prettySize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
};
/* the extension, for the "PDF" / "XLSX" caption beside a document's name */
const prettyType = (file) => {
  const name = String(file?.name || '');
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toUpperCase();
  return String(file?.type || '').split('/').pop().toUpperCase() || 'FILE';
};

export default function AttachmentsDialog({
  open,
  kind,                 // 'delivery' | 'grt' - which collection the record is in
  id,                   // THE ROW'S OWN _id. Never defaulted.
  title = '',           // e.g. the LR number or GRT No, for the heading
  onClose,
  onUploaded,           // optional: the list can refresh itself
}) {
  /* null = the two big choices; otherwise which picker was chosen */
  const [mode, setMode] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const docInput = useRef(null);
  /* Every way out of this dialog is gated on `busy`, so a request that never
     settles would lock it shut with no way back. The request is therefore
     abortable, and closing aborts it. */
  const abortRef = useRef(null);
  const photoInput = useRef(null);

  const canLoad = Boolean(open && kind && id);

  const refresh = useCallback(async () => {
    if (!canLoad) return;
    setListLoading(true);
    try {
      const r = await fetch('/api/attachments?kind=' + encodeURIComponent(kind)
        + '&id=' + encodeURIComponent(id));
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setList([]); setListError(d.error || 'Could not load the existing attachments.'); return; }
      setList(d.attachments || []);
      setListError('');
    } catch {
      /* an empty list and an unreachable server are different things, and
         "Nothing attached to this record yet." is a lie about the second */
      setList([]);
      setListError('Could not load the existing attachments.');
    } finally {
      setListLoading(false);
    }
  }, [canLoad, kind, id]);

  /* Reset on every open, and whenever the dialog is pointed at a DIFFERENT
     row - otherwise the previous row's chosen file and attachment list would
     still be on screen under the new row's heading. */
  useEffect(() => {
    if (!open) return;
    setMode(null);
    setFile(null);
    setPreview('');
    setError('');
    setNotice('');
    setBusy(false);
    refresh();
  }, [open, kind, id, refresh]);

  /* an object URL is a live handle on the file - released when the preview
     is replaced or the dialog closes, or the page leaks one per photo */
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  /* Closing ALWAYS works: an upload still in flight is abandoned rather than
     holding the dialog hostage. The server may still finish storing it - the
     attachment list will show it on the next open, which is the honest
     outcome - but the operator is never stuck. */
  const close = useCallback(() => {
    try { abortRef.current?.abort(); } catch { /* already settled */ }
    abortRef.current = null;
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    /* the page behind a modal must not scroll under it on a phone */
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  /* abandon anything still running if the dialog is unmounted outright */
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* settled */ } }, []);

  if (!open) return null;

  function choose(next) {
    setError('');
    setNotice('');
    setMode(next);
    /* the hidden input is opened directly, so the operator gets their own
       system picker rather than a styled drop zone that only looks like one */
    const input = next === 'photo' ? photoInput.current : docInput.current;
    if (input) { input.value = ''; input.click(); }
  }

  function pick(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError('');
    setNotice('');
    /* A rejected pick clears whatever was chosen before it. Leaving the old
       file on screen under a message about the new one reads as though the
       displayed file is the problem. */
    if (!chosen.size) { clearChoice(); setError('That file is empty.'); return; }
    if (chosen.size > MAX_BYTES) {
      clearChoice();
      setError('File size exceeds the allowed limit of '
        + Math.round(MAX_BYTES / (1024 * 1024)) + ' MB.'
        + ' "' + chosen.name + '" is ' + prettySize(chosen.size) + '.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(chosen);
    setPreview(chosen.type.startsWith('image/') ? URL.createObjectURL(chosen) : '');
  }

  function clearChoice() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    setError('');
  }

  async function upload() {
    if (!file || busy) return;                 // also guards the double-click
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('kind', kind);
      body.append('id', id);                   // THE ROW'S id, always sent
      body.append('file', file);
      const controller = new AbortController();
      abortRef.current = controller;
      const r = await fetch('/api/attachments', { method: 'POST', body, signal: controller.signal });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        /* the dialog STAYS OPEN and the chosen file stays chosen, so the
           operator can read what went wrong and press Upload again */
        setError(d.error || 'Upload failed. Please try again.');
        return;
      }
      setList(d.attachments || []);
      setNotice((d.attachment?.kind === 'photo' ? 'Photo' : 'Document') + ' uploaded successfully.');
      clearChoice();
      setMode(null);
      onUploaded?.(d.attachments || []);
    } catch (err) {
      /* an abort is the operator closing the dialog, not a failure to report */
      if (err?.name !== 'AbortError') setError('Upload failed. Please try again.');
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  async function detach(attachmentId, label) {
    if (busy) return;
    /* removing someone's uploaded document is not undoable from here - the
       button sits directly beside the link that opens it, so it is asked */
    if (!window.confirm('Remove ' + (label ? '"' + label + '"' : 'this attachment') + ' from this record?')) return;
    setBusy(true);
    setError('');
    try {
      const qs = new URLSearchParams({ kind, id, attachmentId });
      const r = await fetch('/api/attachments?' + qs, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not remove that file.'); return; }
      setList(d.attachments || []);
      setNotice('Attachment removed.');
      onUploaded?.(d.attachments || []);
    } catch {
      setError('Could not remove that file.');
    } finally {
      setBusy(false);
    }
  }

  const choosing = !file;

  return (
    <div
      className="no-print fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachments-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* full-width sheet on a phone, a centred card from sm up - no fixed
          desktop width anywhere, and every control is touch-sized */}
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:max-h-[88vh] sm:max-w-[520px] sm:rounded-lg">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <h3 id="attachments-title" className="text-base font-semibold sm:text-lg">
            Upload Document / Photo
          </h3>
          <button
            type="button"
            onClick={close}
            className="p-1 text-2xl leading-none text-gray-500"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="px-4 py-4">
          {title && (
            <p className="mb-3 truncate text-xs text-gray-500">
              Attaching to <span className="font-semibold text-gray-700">{title}</span>
            </p>
          )}

          {error && <div className="flash flash-err mb-3">{error}</div>}
          {notice && !error && <div className="flash flash-ok mb-3">{notice}</div>}

          {/* the two hidden pickers. capture on the photo one is what lets a
              phone offer its camera; a device without one simply ignores the
              attribute and shows the gallery, and a desktop shows the normal
              file dialog - so nothing is ever forced. */}
          <input
            ref={docInput}
            type="file"
            accept={DOC_ACCEPT}
            className="hidden"
            onChange={pick}
          />
          {/* NO capture attribute. On Chrome for Android and iOS Safari
              `capture` does not OFFER the camera - it opens it directly and
              suppresses the gallery, so an existing photo could not be
              attached at all. Left off, a phone shows its own chooser with
              Camera and Photo Library side by side, which is what "allow the
              camera to be used, without forcing it" actually means; a desktop
              shows the ordinary file dialog. */}
          <input
            ref={photoInput}
            type="file"
            accept={PHOTO_ACCEPT}
            className="hidden"
            onChange={pick}
          />

          {choosing && (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => choose('document')}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-300 px-4 py-4 text-left hover:border-brand hover:bg-[#f5f8fd]"
              >
                <Icon name="file" size={22} />
                <span>
                  <span className="block text-sm font-semibold">Document Upload</span>
                  <span className="block text-[11px] text-gray-500">PDF, DOC, DOCX, XLS, XLSX, CSV, TXT</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => choose('photo')}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-300 px-4 py-4 text-left hover:border-brand hover:bg-[#f5f8fd]"
              >
                <Icon name="image" size={22} />
                <span>
                  <span className="block text-sm font-semibold">Photo Upload</span>
                  <span className="block text-[11px] text-gray-500">
                    JPG, PNG, WEBP, GIF &middot; camera or gallery on a phone
                  </span>
                </span>
              </button>
            </div>
          )}

          {file && (
            <div className="rounded-lg border border-gray-300 p-3">
              {preview ? (
                <>
                  <p className="mb-2 text-[11px] font-semibold text-gray-700">PHOTO PREVIEW</p>
                  {/* a local object URL, not a remote image - next/image would
                      add nothing and cannot optimise a blob */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt={file.name}
                    className="mx-auto max-h-[220px] w-auto max-w-full rounded border border-gray-200 object-contain"
                  />
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Icon name="file" size={26} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{file.name}</span>
                    <span className="block text-[11px] text-gray-500">{prettyType(file)}</span>
                  </span>
                </div>
              )}
              <p className="mt-2 truncate text-xs text-gray-600">
                {preview ? file.name + ' · ' : ''}{prettySize(file.size)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary min-h-[38px] flex-1 justify-center"
                  disabled={busy}
                  onClick={upload}
                >
                  {busy ? <span className="spin" /> : <Icon name="upload" size={14} />}
                  {busy ? ' Uploading...' : ' Upload'}
                </button>
                <button
                  type="button"
                  className="btn min-h-[38px]"
                  disabled={busy}
                  onClick={() => choose(mode || (preview ? 'photo' : 'document'))}
                >
                  Choose Another
                </button>
                <button
                  type="button"
                  className="btn min-h-[38px]"
                  disabled={busy}
                  onClick={clearChoice}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {/* what is already on this record */}
          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="mb-2 text-[11px] font-semibold text-gray-700">
              EXISTING ATTACHMENTS{list.length ? ' (' + list.length + ')' : ''}
            </p>
            {listLoading && <p className="py-2 text-xs text-gray-500">Loading...</p>}
            {!listLoading && listError && (
              <p className="py-2 text-xs text-danger">{listError}</p>
            )}
            {!listLoading && !listError && !list.length && (
              <p className="py-2 text-xs text-gray-500">Nothing attached to this record yet.</p>
            )}
            {!listLoading && list.map((a) => (
              <div key={a._id} className="flex items-center gap-2 border-b border-gray-100 py-2 last:border-0">
                <Icon name={a.kind === 'photo' ? 'image' : 'file'} size={16} />
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-brand-link hover:underline"
                  title={a.name}
                >
                  {a.name || a.url}
                </a>
                <span className="shrink-0 text-[11px] text-gray-500">{prettySize(a.size)}</span>
                {/* a real touch target, not the 24x26 data-table act-btn:
                    this dialog is used on a phone and the control sits right
                    beside the link that opens the file */}
                <button
                  type="button"
                  className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded bg-danger text-white disabled:opacity-60"
                  title="Remove"
                  aria-label={'Remove ' + (a.name || 'attachment')}
                  disabled={busy}
                  onClick={() => detach(a._id, a.name)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end border-t border-gray-200 bg-white px-4 py-3">
          <button
            type="button"
            className="btn min-h-[38px]"
            onClick={close}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
