/* Channel attribution for sales documents.

   The ERP has no channel column on a sale, so a sale is attributed only when
   the operator records it at billing. The only recorded value is
   "instagram"; everything else (including the absence of the field on older
   documents) is an offline store sale. Nothing is inferred from a customer
   name, a note or a shared Instagram link.

   The same rule is used by the till, the payment edit screen, the returns
   route and the dashboard, so a document cannot be Instagram on one screen
   and offline on another. */

export const SALES_CHANNEL_INSTAGRAM = 'instagram';

/* Stored value for a document: "instagram" or "" (offline). An empty string
   keeps older documents untouched and leaves the field absent from payloads
   that never set it. */
export function normaliseSalesChannel(value) {
  return String(value || '').trim().toLowerCase() === SALES_CHANNEL_INSTAGRAM
    ? SALES_CHANNEL_INSTAGRAM
    : '';
}

export function channelValueOf(doc) {
  return normaliseSalesChannel(doc?.salesChannel);
}

/* The label a document shows. */
export function channelLabelOf(doc) {
  return channelValueOf(doc) === SALES_CHANNEL_INSTAGRAM ? 'Instagram' : 'Offline Store';
}
