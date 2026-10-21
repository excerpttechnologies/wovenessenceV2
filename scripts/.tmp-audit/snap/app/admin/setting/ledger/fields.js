/* Form fields for Ledgers.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true },
    { k: "ledgerGroupId", label: "Ledger Group", type: "ref", ref: "ledgergroups", req: true },
    { k: "isActive", label: "Is Active", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "isDefault", label: "Default", type: "radio", req: true, opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}], def: "No" },
    { k: "openingBalance", label: "Opening Balance", type: "number", req: true, def: 0 },
    { k: "gstNo", label: "GST No. (ex: 27ABCDE1234F1Z5)", type: "text" },
    { k: "addressLine1", label: "Address line 1", type: "text" },
    { k: "addressLine2", label: "Address line 2", type: "text" },
    { k: "addressLine3", label: "Address line 3", type: "text" },
    { k: "zipCode", label: "Zip Code", type: "text" },
    { k: "mobile", label: "Mobile", type: "text" },
    { k: "alternateContactNumber", label: "Alternate Contact Number", type: "text" },
    { k: "landline", label: "Landline", type: "text" },
    { k: "fax", label: "Fax", type: "text" },
    { k: "email", label: "Email", type: "text" },
    { k: "email2", label: "Email 2", type: "text" },
    { k: "websiteUrl", label: "Website URL", type: "text" },
    { k: "city", label: "City", type: "city" },
    { k: "state", label: "State", type: "text" },
    { k: "country", label: "Country", type: "text" },
    { k: "contactPerson", label: "Contact Person", type: "text" },
    { k: "contactPersonMobile", label: "Contact Person Mobile", type: "text" },
  ];
