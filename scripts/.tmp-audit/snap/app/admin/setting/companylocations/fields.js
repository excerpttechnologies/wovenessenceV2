/* Form fields for Company Locations.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true },
    { k: "businessPrintName", label: "Business Print Name", type: "text" },
    { k: "landmark", label: "Landmark", type: "text" },
    { k: "city", label: "City", type: "city", req: true },
    { k: "state", label: "State", type: "text" },
    { k: "country", label: "Country", type: "text" },
    { k: "zipCode", label: "Zip Code", type: "text", req: true },
    { k: "addressLine1", label: "Address line 1", type: "text" },
    { k: "addressLine2", label: "Address line 2", type: "text" },
    { k: "mobile", label: "Mobile", type: "text" },
    { k: "alternateContactNumber", label: "Alternate Contact Number", type: "text" },
    { k: "email", label: "Email", type: "text" },
    { k: "websiteUrl", label: "Website URL", type: "text" },
    { k: "gstin", label: "GSTIN (ex: 27ABCDE1234F1Z5)", type: "text" },
    { k: "termsAndConditions", label: "Terms & Conditions", type: "textarea", span: "all" },
  ];
