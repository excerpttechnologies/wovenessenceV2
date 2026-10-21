import mongoose from 'mongoose';

/* Atomic sequence generator.

   Document numbers were previously derived by counting rows
   (lib/docnumber.js nextDocNumber) or by scanning for the highest issued
   number (nextSeriesNumber). Both re-read the collection, so two requests
   that overlap read the same value and issue the same number - and counting
   additionally reissues the number of any document that was deleted.

   A counter document per (scope, key) removes both problems: findOneAndUpdate
   with $inc is a single atomic operation on one document, so concurrent
   callers are serialised by the server and each gets a distinct value.

   Collection name pinned lowercase, same reasoning as every other model. */

const CounterSchema = new mongoose.Schema(
  {
    /* one counter per series: "<key>|<businessId>|<locationId>|<finYear>" */
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Counter = mongoose.models.counter ||
  mongoose.model('counter', CounterSchema, 'counter');

export default Counter;

/* Builds the composite key. Empty scope parts collapse to '-' so that a
   series scoped to a business only, and one scoped to business+location,
   never share a counter by accident. */
export function counterKey(name, { businessId, locationId, finYear } = {}) {
  return [
    String(name || ''),
    String(businessId || '-'),
    String(locationId || '-'),
    String(finYear || '-'),
  ].join('|');
}

/* Reserves `count` consecutive numbers and returns the FIRST one.
   Reserving a block in one call keeps a 500-barcode generation to a single
   round trip while still guaranteeing no other caller can interleave. */
export async function reserveSequence(name, scope = {}, count = 1, session = null) {
  const n = Math.max(1, Number(count) || 1);
  const key = counterKey(name, scope);

  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: n } },
    { new: true, upsert: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  );

  /* seq is the value AFTER the increment, so the block we just claimed is
     [seq - n + 1 .. seq] */
  return doc.seq - n + 1;
}

/* Seeds a counter so it never issues a number below `floor`.
   Used once per series when migrating from the old count-based numbering:
   the highest number already on disk becomes the floor. */
export async function ensureFloor(name, scope = {}, floor = 0, session = null) {
  const key = counterKey(name, scope);
  await Counter.updateOne(
    { key },
    { $max: { seq: Math.max(0, Number(floor) || 0) } },
    { upsert: true, ...(session ? { session } : {}) }
  );
}

/* Reads a counter WITHOUT touching it: the last value issued, or 0 when the
   series has never been used.

   This exists so a screen can show the number a document WOULD get before
   anyone commits to creating it. reserveSequence cannot be used for that -
   it is a write, so a "preview" built on it burns a number every time a
   dialog is opened and closed again. A read must never move the sequence. */
export async function peekSequence(name, scope = {}) {
  const doc = await Counter.findOne({ key: counterKey(name, scope) }).select('seq').lean();
  return Number(doc?.seq) || 0;
}
