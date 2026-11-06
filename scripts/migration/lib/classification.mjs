/**
 * Migration classification rules, shared by the audit, the migration runner and
 * the verification report. Keeping this in one place means the report and the
 * runner can never disagree about which collection was migrated.
 *
 * Only two exclusion categories are allowed:
 *   - POS module and its dedicated supporting collections
 *   - the BarcodeLabel schema/collection (see the decision note below)
 *
 * Everything else in the source ERP database is INCLUDED, including shared
 * collections used by POS and non-POS modules and legacy collections.
 */

export const BARCODE_LABEL_COLLECTION = 'barcodeLabel';

/* POS-owned collections, discovered from models/Pos*.js, CashRegister.js,
   PaymentMethod.js, LoyaltyPoint.js, LoyaltyLedger.js, the POS routes and the
   direct driver access in app/api/pos-archive, app/api/invoice-share and
   app/invoice/[token]. */
export const POS_COLLECTIONS = new Map([
  ['posinvoice', 'POS bill/transaction collection (models/PosInvoice.js, app/api/sell-pos).'],
  ['posreturn', 'POS return/credit collection (models/PosReturn.js).'],
  ['poshold', 'Held POS carts (models/PosHold.js).'],
  ['possetting', 'POS till configuration (models/PosSetting.js).'],
  ['poscounter', 'POS counter master (models/PosCounter.js).'],
  ['posfootertemplate', 'POS invoice footer templates (models/PosFooterTemplate.js).'],
  ['posinvoicearchive', 'Deleted POS bills archive (app/api/sell-pos/[id]/archive, app/api/pos-archive).'],
  ['cashregister', 'POS cash-register sessions and counts (models/CashRegister.js).'],
  ['paymentmethod', 'POS payment-method master; every record is scoped to a posCounter (models/PaymentMethod.js).'],
  ['loyaltypoint', 'POS loyalty scheme settings (models/LoyaltyPoint.js).'],
  ['loyaltyledger', 'POS loyalty point movements written by app/api/sell-pos (models/LoyaltyLedger.js).'],
  ['loyaltytransaction', 'Legacy POS loyalty movement collection (same data shape as loyaltyledger).'],
  ['invoiceshare', 'Shared POS invoice PDF links; created only from app/api/invoice-share for posinvoice rows.'],
]);

/* Directly-referenced shared/system collections that must NOT be excluded just
   because POS also uses them. Listed explicitly so a future reader can see the
   decision was deliberate. */
export const SHARED_COLLECTIONS = new Map([
  ['counter', 'Atomic sequence generator shared by POS and every other document series; contains no POS transaction.'],
  ['docsetup', 'Document-number setup shared by all modules.'],
  ['role', 'Role master shared by the whole application.'],
  ['rolepermission', 'Permission matrix shared by the whole application (includes POS screens).'],
  ['user', 'User accounts shared by the whole application (cashier counterId is one field).'],
  ['loginsecurity', 'Login/security records shared by all users.'],
  ['invoicelayoutsetting', 'Invoice layout configuration; a setting, not a POS transaction.'],
  ['salesperson', 'Staff master used by sales screens and POS; not a POS transaction.'],
  ['auditlogs', 'Shared audit log; may contain POS actions but is not POS-owned.'],
  ['auditLogs', 'Legacy shared audit log.'],
  ['schemamigration', 'Migration bookkeeping, shared.'],
]);

/**
 * @param {string} name collection name
 * @param {{ includeBarcodeLabel?: boolean|null }} options
 * @returns {{status:'INCLUDE'|'EXCLUDE'|'DECISION', category:string, reason:string}}
 */
export function classifyCollection(name, { includeBarcodeLabel = null } = {}) {
  if (POS_COLLECTIONS.has(name)) {
    return { status: 'EXCLUDE', category: 'POS', reason: POS_COLLECTIONS.get(name) };
  }
  if (name === BARCODE_LABEL_COLLECTION) {
    if (includeBarcodeLabel === true) {
      return {
        status: 'INCLUDE',
        category: 'BARCODE_LABEL_INCLUDED',
        reason:
          'DECISION: this repository has no separate label-only BarcodeLabel model. lib/barcodeLabel.js is the ' +
          'barcode master / one-row-per-unit stock collection (barcodeNo, itemId, status, currentLocationId, ' +
          'transferId, billingId, soldAt), referenced by GRC, stock movement, transfer, delivery challan and sales. ' +
          'Included because the task requires barcode master, stock, identifiers and history to be migrated.',
      };
    }
    if (includeBarcodeLabel === false) {
      return {
        status: 'EXCLUDE',
        category: 'BARCODE_LABEL',
        reason:
          'STRICT EXCLUSION: caller chose to drop the barcodeLabel collection. This removes every barcode unit ' +
          'row and leaves barcodeId references in stockmovement/GRC/transfer/sales documents dangling.',
      };
    }
    return {
      status: 'DECISION',
      category: 'BARCODE_LABEL',
      reason:
        'DECISION REQUIRED: the named BarcodeLabel collection is also the ERP barcode master/stock collection. ' +
        'Excluding it would drop every barcode unit and break references; including it conflicts with the literal ' +
        'exclusion instruction. Confirm before applying.',
    };
  }
  if (SHARED_COLLECTIONS.has(name)) {
    return { status: 'INCLUDE', category: 'SHARED', reason: SHARED_COLLECTIONS.get(name) };
  }
  return {
    status: 'INCLUDE',
    category: 'ERP',
    reason: 'Not POS-owned and not BarcodeLabel; included to preserve all remaining ERP data.',
  };
}

export function isExcludedByRule(name) {
  return POS_COLLECTIONS.has(name);
}
