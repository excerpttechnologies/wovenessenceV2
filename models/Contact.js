// import mongoose from 'mongoose';
// import { buildContactSchema, LABEL_FIELD, LEGACY_CONTACT_COLLECTION } from './contactSchema.js';

// /* LEGACY - the shared `contact` collection, where suppliers, customers and
//    agents lived together told apart by `contactKind`.

//    Nothing in the application imports this model directly any more. Every
//    reader and writer goes through lib/contacts.js, which hands back this model
//    only while CONTACT_STORAGE is not `split` (lib/contactStorage.js), and the
//    kind's own model - models/Supplier.js, Customer.js, Agent.js - once it is.

//    It is kept, unchanged in what it reads and writes, because `contact` is the
//    source and the rollback target of
//    scripts/migrateContactsToSeparateCollections.mjs, and it stays the backup
//    until the split has been verified and the business retires it. Do not drop
//    the collection and do not delete this file before then.

//    The fields are the shared set in ./contactSchema.js - the same set the
//    three kind models use - so a record copied either way keeps every field. */

// export { LABEL_FIELD };

// const ContactSchema = buildContactSchema();

// /* One supplier per GST NO within a business - the rule as this collection has
//    always enforced it: only records marked Supplier, and only those with a GST
//    number, since customers and agents share the collection. The kind-specific
//    form of the same rule is on models/Supplier.js. */
// export const SUPPLIER_GST_INDEX = {
//   key: { businessId: 1, gstNo: 1 },
//   options: {
//     name: 'supplier_gstNo_unique',
//     unique: true,
//     partialFilterExpression: { contactKind: 'Supplier', gstNo: { $gt: '' } },
//     collation: { locale: 'en', strength: 2 },
//   },
// };
// ContactSchema.index(SUPPLIER_GST_INDEX.key, SUPPLIER_GST_INDEX.options);

// export default mongoose.models.contact ||
//   mongoose.model('contact', ContactSchema, LEGACY_CONTACT_COLLECTION);


//SAGAR



import mongoose from 'mongoose';

/* Suppliers
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'businessName';

const ContactSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: 'contactType', default: null },
    businessType: { type: String, default: '' },
    gstNo: { type: String, default: '' },
    contactType2: { type: String, default: "Individual" },
    businessName: { type: String, default: '' },
    shortName: { type: String, default: '' },
    /* Read off the GST portal's taxpayer result and kept as the portal
       printed it - Active / Cancelled, Regular / Composition, Yes / No. They
       are stored so the registration a supplier was accepted on can still be
       seen later; nothing computes from them. The two jurisdiction offices
       have no field on the form at all and are held only as a record of what
       the search returned. */
    additionalTradeName: { type: String, default: '' },
    gstStatus: { type: String, default: '' },
    gstTaxpayerType: { type: String, default: '' },
    gstAadhaarAuthenticated: { type: String, default: '' },
    gstEkycVerified: { type: String, default: '' },
    gstAdministrativeOffice: { type: String, default: '' },
    gstOtherOffice: { type: String, default: '' },
    prefix: { type: String, default: "Mr." },
    firstName: { type: String, default: '' },
    middleName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    dob: { type: Date, default: null },
    gender: { type: String, default: '' },
    allowLogin: { type: Boolean, default: false },
    userName: { type: String, default: '' },
    password: { type: String, default: '' },
    billingAddressLine1: { type: String, default: '' },
    billingAddressLine2: { type: String, default: '' },
    billingCity: { type: String, default: '' },
    billingState: { type: String, default: '' },
    billingCountry: { type: String, default: '' },
    billingDistrict: { type: String, default: '' },
   billingTaluk: { type: String, default: '' },
    billingZipCode: { type: String, default: '' },
    billingMobile: { type: String, default: '' },
    billingAlternateContactNumber: { type: String, default: '' },
    billingLandline: { type: String, default: '' },
    billingFax: { type: String, default: '' },
    billingEmail: { type: String, default: '' },
    billingEmail2: { type: String, default: '' },
    billingWebsiteUrl: { type: String, default: '' },
    shippingAddressLine1: { type: String, default: '' },
    shippingAddressLine2: { type: String, default: '' },
    shippingCity: { type: String, default: '' },
    shippingState: { type: String, default: '' },
    shippingCountry: { type: String, default: '' },
    shippingDistrict: { type: String, default: '' },
    shippingZipCode: { type: String, default: '' },
    shippingMobile: { type: String, default: '' },
    shippingAlternateContactNumber: { type: String, default: '' },
    shippingLandline: { type: String, default: '' },
    shippingFax: { type: String, default: '' },
    shippingEmail: { type: String, default: '' },
    shippingEmail2: { type: String, default: '' },
    shippingWebsiteUrl: { type: String, default: '' },
    sameAsBilling: { type: Boolean, default: false },
    markupPriceCalculation: { type: String, default: "Purchase Rate" },
    discountType: { type: String, default: '' },
    discount: { type: Number, default: null },
    markUpOnCostRsp: { type: Number, default: null },
    rspRoundOff: { type: Number, default: null },
    markUpOnCostWsp: { type: Number, default: null },
    wspRoundOff: { type: Number, default: null },
    markUpOnCostDp: { type: Number, default: null },
    dpRoundOff: { type: Number, default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    commissionPercent: { type: Number, default: null },
    paymentLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    orderDeliveryEstimatedDays: { type: Number, default: null },
    orderAcceptedDelaysDays: { type: Number, default: null },
    orderAdvanceLimit: { type: Number, default: null },
    paymentWithinDays: { type: Number, default: null },
    paymentDateType: { type: String, default: '' },
    /* Payment Setup on the Agent form asks for these two as dates rather than
       for a "Payment Date Type" choice, matching the deployed screen. Supplier
       and Customer still use paymentDateType, so all three keys coexist. */
    entryDate: { type: Date, default: null },
    documentDate: { type: Date, default: null },
    discountAllowWithinPercent: { type: Number, default: null },
    discountAllowInDays: { type: Number, default: null },
    purchaseTermsId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
    logisticsTerms: { type: String, default: '' },
    supplierType: { type: String, default: '' },
    openingBalance: { type: Number, default: 0 },
    purchasesLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    purchasesReturnLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    consignmentPurchases: { type: String, default: '' },
    pan: { type: String, default: '' },
    cin: { type: String, default: '' },
    gstType: { type: String, default: '' },
    gstRegDate: { type: Date, default: null },
    ssiNo: { type: String, default: '' },
    ssiRegDate: { type: Date, default: null },
    msmeNo: { type: String, default: '' },
    msmeRegDate: { type: Date, default: null },
    tdsLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    tdsPercent: { type: Number, default: null },
    tdsName: { type: String, default: '' },
    tdsSection: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountNo: { type: String, default: '' },
    ifsc: { type: String, default: '' },
    swiftCode: { type: String, default: '' },
    allowProduction: { type: String, default: '' },
    allowToStockPoint: { type: String, default: '' },
    maximumOverDueDays: { type: Number, default: null },

    /* Customer form only - the deployed Sales Details / Financial Details tabs.
       Supplier and Agent have no equivalent, so these stay empty on those two.
       See app/admin/contact/customer/README-CUSTOMER-FORM.md */
    priceList: { type: String, default: 'ON RSP' },
    saleDueDate: { type: Number, default: null },
    interestChargedIfDelay: { type: Number, default: null },
    graceDays: { type: Number, default: null },
    invoiceCreditLimit: { type: Number, default: null },
    overdues: { type: Number, default: null },
    overduesDaysLock: { type: Number, default: null },
    logisticsApplicable: { type: String, default: '' },
    salesTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'salesTerm', default: null },
    transporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'transporter', default: null },
    remarks: { type: String, default: '' },
    customerType: { type: String, default: '' },
    additionalDetails: { type: String, default: '' },
    salesLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    salesReturnLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    /* supplier / agent / customer share this collection; stamped server-side */
    contactKind: { type: String, enum: ['Supplier', 'Agent', 'Customer'], index: true },
    contactId: { type: String, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.contact ||
  mongoose.model('contact', ContactSchema, 'contact');
