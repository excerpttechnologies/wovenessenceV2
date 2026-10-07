import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Delivery from '@/models/Delivery';
import Grt from '@/models/Grt';
import { requireSession } from '@/lib/session';
import {
  saveBuffer,
  isAllowedMime,
  resolveUploadMime,
  kindForMime,
  extForMime,
  ALLOWED_MIME,
  MAX_UPLOAD_BYTES,
} from '@/lib/uploads';

/* ==========================================================================
   /api/attachments  -  documents and photos attached to one record.

   ONE ROUTE, NOT ONE PER DOCUMENT TYPE. The only thing that differs between
   attaching a file to a Delivery and attaching one to a GRT is which
   collection the array lives in, so that is the only thing this route takes
   as a parameter. A new document type is one line in ATTACHABLE below.

   IT REUSES THE STORE, IT DOES NOT BUILD ONE. The bytes go through
   lib/uploads.js saveBuffer - the same content-addressed store behind
   /api/upload that already holds product photos and vendor invoice scans -
   and come back out through /api/files/..., behind a session, as they always
   have. Nothing new is written to disk by this file.

   WHY IT DOES NOT SIMPLY CALL /api/upload FIRST
   Two requests would leave a window where a file is stored but attached to
   nothing, and a failed second call would leak it silently. Storing and
   linking in ONE request means a file is either on the record or nowhere.

   THE RECORD ID IS NEVER TRUSTED FROM THE FILE. It is a form field checked
   against the collection here; a request naming a record that does not exist
   is refused before anything is stored.
   ========================================================================== */

/* The record types that may carry attachments, and the model each lives in.
   A `kind` outside this map is refused - it is never used to look up a model
   dynamically, so no request can reach a collection not named here. */
const ATTACHABLE = {
  delivery: { model: Delivery, label: 'Delivery' },
  grt: { model: Grt, label: 'Goods Return Note' },
};

const json = (d, s = 200) => Response.json(d, { status: s });

/* The shape the browser gets back. _id is what the delete button names. */
const toClient = (a) => ({
  _id: String(a._id),
  url: a.url || '',
  name: a.name || '',
  mime: a.mime || '',
  size: Number(a.size) || 0,
  kind: a.kind || 'document',
  uploadedAt: a.uploadedAt || null,
  uploadedBy: a.uploadedBy || '',
});

/* kind + id, checked once for every verb below. Returns either { error } with
   a status, or the model and the id to work with. */
function target(kindRaw, idRaw) {
  const kind = String(kindRaw || '').trim().toLowerCase();
  /* OWN property only. A plain object literal inherits from Object.prototype,
     so `ATTACHABLE[kind]` answers a truthy value for 'constructor' and
     '__proto__' - both of which survive trim().toLowerCase(). Those slipped
     past `if (!entry)` and left model undefined, and every verb then threw on
     the dereference and answered an unhandled 500 instead of this 400. */
  const entry = Object.prototype.hasOwnProperty.call(ATTACHABLE, kind)
    ? ATTACHABLE[kind]
    : null;
  if (!entry || !entry.model) return { error: 'Unknown record type.', status: 400 };
  const id = String(idRaw || '').trim();
  if (!id || !isValidObjectId(id)) return { error: 'A valid record id is required.', status: 400 };
  return { model: entry.model, label: entry.label, id, kind };
}

/* ---- list what is already attached ------------------------------------ */
export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const t = target(sp.get('kind'), sp.get('id'));
  if (t.error) return json({ error: t.error }, t.status);

  await dbConnect();
  const doc = await t.model.findById(t.id).select('attachments').lean();
  if (!doc) return json({ error: t.label + ' not found.' }, 404);

  return json({ attachments: (doc.attachments || []).map(toClient) });
}

/* ---- attach one file -------------------------------------------------- */
export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected a multipart form upload.' }, 400);
  }

  const t = target(form.get('kind'), form.get('id'));
  if (t.error) return json({ error: t.error }, t.status);

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file received.' }, 400);
  }
  if (!file.size) {
    return json({ error: 'That file is empty.' }, 400);
  }

  /* THE TYPE IS CHECKED HERE, ON THE SERVER, against the same allowlist the
     rest of the application uses - never from the name's extension, and
     never only in the browser. */
  const mime = resolveUploadMime(file.type, file.name);
  if (!isAllowedMime(mime)) {
    return json({
      error: 'That file type is not allowed. Accepted: '
        + ALLOWED_MIME.map(extForMime).join(', ') + '.',
    }, 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({
      error: 'File is too large. The limit is '
        + Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB.',
    }, 413);
  }

  await dbConnect();
  /* the record has to exist before a byte is written, so a bad id cannot
     leave an orphan in the store */
  const exists = await t.model.exists({ _id: t.id });
  if (!exists) return json({ error: t.label + ' not found.' }, 404);

  let saved;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    /* re-checked against what actually ARRIVED rather than trusting the size
       declared on the part header */
    if (!buffer.length) return json({ error: 'That file is empty.' }, 400);
    if (buffer.length > MAX_UPLOAD_BYTES) return json({ error: 'File is too large.' }, 413);
    saved = await saveBuffer(buffer, mime);
  } catch {
    return json({ error: 'Could not store that file.' }, 500);
  }

  const attachment = {
    url: saved.url,
    name: String(file.name || '').slice(0, 200),
    mime,
    size: saved.bytes,
    kind: kindForMime(mime),
    uploadedAt: new Date(),
    uploadedBy: String(session.name || session.email || ''),
  };

  /* $push, never $set: a second upload joins the first rather than replacing
     it, which is the whole point of an attachments ARRAY.

     Guarded, because this is the one step that runs AFTER the bytes are on
     disk: a dropped connection here would otherwise escape the handler and
     answer a bare, bodyless 500 that the dialog cannot read a message out of.
     The order above still holds the real guarantee - the record is checked to
     exist before anything is written - so a record can never point at a file
     that is not stored. */
  let updated;
  try {
    updated = await t.model.findByIdAndUpdate(
      t.id,
      { $push: { attachments: attachment } },
      { new: true, runValidators: true }
    ).select('attachments').lean();
  } catch {
    return json({ error: 'The file was stored but could not be attached. Please try again.' }, 500);
  }
  if (!updated) return json({ error: t.label + ' not found.' }, 404);

  const list = (updated.attachments || []).map(toClient);
  return json({ ok: true, attachment: list[list.length - 1], attachments: list });
}

/* ---- detach one file --------------------------------------------------
   The stored bytes are deliberately LEFT ON DISK. The store is
   content-addressed and shared: the same file attached to two records is one
   file, so deleting it here would empty the other record's attachment too.
   Reclaiming unreferenced blobs is a sweep over every referring collection,
   which is a separate job from a user detaching one file. */
export async function DELETE(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const t = target(sp.get('kind'), sp.get('id'));
  if (t.error) return json({ error: t.error }, t.status);

  const attachmentId = String(sp.get('attachmentId') || '').trim();
  if (!attachmentId || !isValidObjectId(attachmentId)) {
    return json({ error: 'A valid attachment id is required.' }, 400);
  }

  await dbConnect();
  const updated = await t.model.findByIdAndUpdate(
    t.id,
    { $pull: { attachments: { _id: attachmentId } } },
    { new: true }
  ).select('attachments').lean();
  if (!updated) return json({ error: t.label + ' not found.' }, 404);

  return json({ ok: true, attachments: (updated.attachments || []).map(toClient) });
}
