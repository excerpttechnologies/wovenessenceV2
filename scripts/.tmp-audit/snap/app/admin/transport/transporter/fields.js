/* Transporter Master fields.

   Freight terms and payment modes are fixed lists, several of which can be
   ticked at once - hence type 'checkgroup' rather than 'select'. */

export const FREIGHT_OPTS = [
  { v: 'TO PAY', l: 'TO PAY' },
  { v: 'POST PAID', l: 'POST PAID' },
  { v: 'PAID', l: 'PAID' },
  { v: 'UPI/BANK TRF', l: 'UPI/BANK TRF' },
];

export const PAYMENT_MODE_OPTS = [
  { v: 'PETTY CASH', l: 'PETTY CASH' },
  { v: 'BANK', l: 'BANK' },
  { v: 'UPI', l: 'UPI' },
];

export const FIELDS = [
  { k: 'transporterName', label: 'Transporter Name', type: 'text', span: 'all' },
  { k: 'transporterCode', label: 'Transporter Code', type: 'text', req: true, span: 'all' },
  { k: 'freight', label: 'Freight', type: 'checkgroup', opts: FREIGHT_OPTS, span: 'all' },
  {
    k: 'gstApplicable', label: 'GST Applicable', type: 'radio', req: true, def: 'No',
    opts: [{ v: 'Yes', l: 'Yes' }, { v: 'No', l: 'No' }], name: 'transporter-gstApplicable', span: 'all',
  },
  { k: 'autoChargesMode', label: 'Auto Charges Mode', type: 'checkgroup', opts: PAYMENT_MODE_OPTS, span: 'all' },
  { k: 'tipsMode', label: 'Tips Mode', type: 'checkgroup', opts: PAYMENT_MODE_OPTS, span: 'all' },
];
