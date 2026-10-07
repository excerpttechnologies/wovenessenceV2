import mongoose from 'mongoose';

/* ==========================================================================
   ONE FILE ATTACHED TO ONE RECORD.

   Shared by every document type that can carry attachments (Delivery and GRT
   today), the same way models/contactSchema.js is shared by the three contact
   kinds - so a file attached to a delivery and a file attached to a GRT are
   the same shape, and /api/attachments can serve both from one code path.

   WHAT IS STORED, AND WHAT IS NOT
   The bytes are NOT here. They go through lib/uploads.js exactly as a product
   photo or a vendor invoice scan already did: written once under their own
   sha256, outside public/, and read back through /api/files/... behind a
   session. What a record keeps is the short URL that names them, plus enough
   about the file to list it without opening it.

   `name` is the operator's own file name, kept for display and download only.
   It never reaches the filesystem - the stored name is the content hash - so
   a name like "../../etc/passwd" is just an odd caption.

   `kind` is 'document' or 'photo', decided from the MIME by
   lib/uploads.js kindForMime, so the list can show a thumbnail for one and a
   file row for the other without re-sniffing the file.
   ========================================================================== */
export const ATTACHMENT_KINDS = ['document', 'photo'];

export const AttachmentSchema = new mongoose.Schema(
  {
    /* "/api/files/<aa>/<sha256>.<ext>" - what lib/uploads.js saveBuffer returned */
    url: { type: String, default: '' },
    /* the name the file had on the operator's machine, for display only */
    name: { type: String, default: '' },
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 },
    kind: { type: String, enum: ATTACHMENT_KINDS, default: 'document' },
    uploadedAt: { type: Date, default: Date.now },
    /* who attached it, as the session knows them - a string, not a ref, so a
       deleted user never breaks the list on a document they touched */
    uploadedBy: { type: String, default: '' },
  },
  /* each attachment keeps its own _id: that is what the delete button names,
     rather than a URL, so two records pointing at the SAME stored file (the
     store is content-addressed, so identical uploads share one file) can be
     detached independently */
  { _id: true }
);

export default AttachmentSchema;
