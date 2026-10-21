import mongoose from 'mongoose';

/* Inter Company Sales Invoice.

   Raised against one or more unconverted Inter Company Delivery Challans for
   the same destination. Claiming a challan stamps its icSalesInvoiceId, which
   removes it from the picker - the same claim/release pattern the Dispatch
   module uses for consignments.

   The e-invoice block (irn / ackNo / ackDate) is what the Print E-Invoice
   view renders. Nothing here calls the IRP: these fields are stored when a
   real integration writes them, and the print view simply omits the lines
   when they are empty.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'invoiceNo';

const IcSalesInvoiceSchema = new mongoose.Schema(
  {
    /* source scope - the branch raising the invoice */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* destination */
    toBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    customerName: { type: String, default: '' },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },

    invoiceNo: { type: String, default: '', index: true },
    invoiceDate: { type: Date, default: null },

    /* the challans this invoice consumed */
    icDeliveryChallanIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'icDeliveryChallan', default: [] },

    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    /* e-invoice - populated by an IRP integration, blank otherwise */
    irn: { type: String, default: '' },
    ackNo: { type: String, default: '' },
    ackDate: { type: Date, default: null },
    qrCode: { type: String, default: '' },

    /* set when the receiving branch accepts it into stock (Auto Purchases
       Received); null = still pending on their side */
    receivedId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.icSalesInvoice ||
  mongoose.model('icSalesInvoice', IcSalesInvoiceSchema, 'icsalesinvoice');
