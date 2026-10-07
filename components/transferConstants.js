/* Constants shared between the stock-transfer screens and the API.

   models/StockTransfer.js is the authority for both lists, but a client
   component cannot import it - the model pulls in mongoose, which does not
   belong in a browser bundle. Rather than let the two drift, the values live
   here and the model imports THEM, so there is still one definition and the
   dependency points the safe way. */

export const RETURN_REASONS = ['Damaged', 'Incorrect Item', 'Excess Quantity', 'Other'];

export const TRANSFER_STATUS = {
  DRAFT: 'DRAFT',
  IN_TRANSIT: 'IN_TRANSIT',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  RETURN_IN_TRANSIT: 'RETURN_IN_TRANSIT',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

/* Human wording for a status, used on badges and in messages. */
export const STATUS_LABEL = {
  DRAFT: 'Draft',
  IN_TRANSIT: 'In Transit',
  PARTIALLY_RECEIVED: 'Partially Received',
  RECEIVED: 'Received',
  RETURN_IN_TRANSIT: 'Return In Transit',
  PARTIALLY_RETURNED: 'Partially Returned',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
