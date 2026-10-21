import mongoose from 'mongoose';

/* Location-pair transaction lock.

   While a transfer between location A and location B is being committed, no
   other transfer between A and B may commit. Transfers between C and D are
   unaffected - the lock is on the PAIR, never on inventory as a whole, so a
   busy warehouse does not stop every other branch from trading.

   Held by a unique index on `pair` rather than by an in-process mutex: the
   app runs as several Next.js server instances behind one database, so a
   JavaScript-level lock would only ever guard one of them. Inserting the
   document is the acquire; it either succeeds or fails with E11000, and there
   is no window between checking and taking.

   `expiresAt` has a TTL index so a lock whose request died - a crashed
   instance, a dropped connection - clears itself instead of wedging that pair
   permanently. lib/locks.js sets the lease well above the time any single
   transfer needs.

   Collection name pinned lowercase, same reasoning as every other model. */

const TransferLockSchema = new mongoose.Schema(
  {
    /* the two locations, sorted and joined, so A->B and B->A collide.
       A transfer and its return move between the same two places and must
       not interleave. */
    pair: { type: String, required: true, unique: true, index: true },

    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, default: null },

    /* what is holding it, for the message shown to whoever is blocked */
    operation: { type: String, default: '' },
    refNo: { type: String, default: '' },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },

    /* a random token; only the holder may release its own lock, so a slow
       request cannot release the lock a later one has taken over */
    token: { type: String, default: '' },

    acquiredAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

/* MongoDB removes the document once expiresAt passes. The TTL monitor runs
   about once a minute, so a stale lock clears within roughly a minute of its
   lease ending - acceptable, because the lease is already generous. */
TransferLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.transferLock ||
  mongoose.model('transferLock', TransferLockSchema, 'transferlock');
