import crypto from 'crypto';
import TransferLock from '@/models/TransferLock';

/* ==========================================================================
   Location-pair locking.

   withLocationPairLock(pair, fn) runs fn while holding an exclusive lock on
   exactly those two locations. Anything trying to move stock between the SAME
   two locations waits its turn (or is told to retry); every other pair
   proceeds untouched.

   Why a lock at all, when the movement itself is transactional: a transfer is
   not one write. It reads which barcodes are available, decides what to
   despatch, and then commits. Two overlapping transfers between the same pair
   can each read the same barcode as available. The guarded status update in
   lib/inventory.js stops the second one corrupting anything - it simply
   commits nothing for that unit - but the operator is then left with a
   half-empty document and no explanation. The lock turns that race into a
   clear "this pair is busy, try again".

   Deliberately NOT a global lock: requirement is that C <-> D keeps working
   while A <-> B is held.
   ========================================================================== */

/* Sorted, so A->B and B->A are the same lock. A transfer and the return that
   comes back along it move between the same two places and must not overlap. */
export function pairKey(businessId, a, b) {
  const ends = [String(a || '-'), String(b || '-')].sort();
  return String(businessId || '-') + ':' + ends[0] + ':' + ends[1];
}

const DEFAULT_LEASE_MS = 30_000;   // far longer than a transfer commit needs
const DEFAULT_WAIT_MS = 5_000;     // how long a blocked caller waits before giving up
const POLL_MS = 120;

export class LockBusyError extends Error {
  constructor(holder) {
    const who = holder?.userName || holder?.userEmail || 'another user';
    const what = holder?.refNo ? ' (' + holder.refNo + ')' : '';
    super(
      'These two locations are already processing a stock movement' + what +
      ', started by ' + who + '. Wait for it to finish and try again.'
    );
    this.name = 'LockBusyError';
    this.code = 'LOCK_BUSY';
    this.status = 409;
    this.holder = holder || null;
  }
}

/* Takes the lock, runs fn, and always releases - including when fn throws, so
   a failed transfer never leaves its pair wedged. */
export async function withLocationPairLock(
  { businessId, fromLocationId, toLocationId, operation = '', refNo = '', user = null,
    leaseMs = DEFAULT_LEASE_MS, waitMs = DEFAULT_WAIT_MS },
  fn
) {
  /* A movement with only one end - a POS sale, a stock adjustment - has no
     pair to contend over and is guarded by the per-barcode status check
     alone. Taking a lock for it would serialise the whole till. */
  if (!fromLocationId || !toLocationId || String(fromLocationId) === String(toLocationId)) {
    return fn();
  }

  const pair = pairKey(businessId, fromLocationId, toLocationId);
  const token = crypto.randomBytes(16).toString('hex');
  const holder = await acquire({ pair, token, businessId, fromLocationId, toLocationId, operation, refNo, user, leaseMs, waitMs });

  try {
    return await fn();
  } finally {
    /* deleteOne on pair + token: only this holder can release, so a caller
       that overran its lease cannot release the lock someone else now owns */
    await TransferLock.deleteOne({ pair, token }).catch(() => {});
    void holder;
  }
}

/* Reports who holds a pair, or null. Used by the UI to show a live "busy"
   badge rather than only failing at submit time. */
export async function lockHolder(businessId, a, b) {
  const row = await TransferLock.findOne({ pair: pairKey(businessId, a, b) }).lean();
  if (!row) return null;
  /* the TTL monitor is lazy; treat an expired row as absent */
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
  return row;
}

/* ------------------------------------------------------------- internals -- */

async function acquire({ pair, token, businessId, fromLocationId, toLocationId, operation, refNo, user, leaseMs, waitMs }) {
  const deadline = Date.now() + Math.max(0, waitMs);

  for (;;) {
    const now = new Date();
    try {
      /* upsert with an expiry guard, expressed as a filter rather than a read:
         it matches when no lock exists OR the existing one has already
         lapsed, so a stale lease is taken over in the same atomic step the
         TTL monitor has not got to yet. */
      const taken = await TransferLock.findOneAndUpdate(
        { pair, expiresAt: { $lte: now } },
        {
          $set: {
            pair, token, businessId, fromLocationId, toLocationId,
            operation, refNo,
            userName: user?.name || '', userEmail: user?.email || '',
            acquiredAt: now, expiresAt: new Date(now.getTime() + leaseMs),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      if (taken && taken.token === token) return taken;
    } catch (err) {
      /* E11000 means a live lock exists - the upsert's filter did not match it
         because it has not expired. That is contention, not a failure. */
      if (err?.code !== 11000) throw err;
    }

    if (Date.now() >= deadline) {
      throw new LockBusyError(await TransferLock.findOne({ pair }).lean());
    }
    await sleep(POLL_MS);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
