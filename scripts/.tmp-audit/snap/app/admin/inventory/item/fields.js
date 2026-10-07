// /* Form fields for Items. Lives beside its pages, not in a registry. */

// export const FIELDS = [
//     { k: "name", label: "Name", type: "text", req: true },
//     { k: "subGroupId", label: "Sub Group", type: "ref", ref: "product/group", req: true },
//     { k: "uomId", label: "UOM", type: "ref", ref: "uom", req: true },
//     { k: "hsnId", label: "HSN", type: "ref", ref: "hsn", req: true },
//     { k: "uniqueBarcode", label: "Unique Barcode", type: "select", req: true, def: "No", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
//     { k: "offerPriceNetPrice", label: "Offer Price/Net Price", type: "select", req: true, def: "No", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
//     { k: "filterId", label: "Filter", type: "ref", ref: "product/filter" },
//     { k: "prefix", label: "Prefix", type: "text" },
//     { k: "itemCode", label: "Item Code", type: "text" },
//     { k: "rspOfferPercent", label: "RSP Offer %", type: "number" },
//     { k: "image", label: "Image", type: "file" },
//     { k: "description", label: "Description", type: "text" },
//     { k: "attributeAddonIds", label: "Attribute Addons", type: "multiref", ref: "attribute-addon" },
//     { k: "itemType", label: "Item Type", type: "select", req: true, def: "Simple", opts: [{"v":"Simple","l":"Simple"},{"v":"Variant","l":"Variant"}] },
//   ];


/* Form fields for Items. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "itemCode", label: "Item Code", type: "text", req: true },
    { k: "ecommItemCode", label: "Ecomm Item Code", type: "text", req: true },
    { k: "subGroupId", label: "Group", type: "ref", ref: "product/group", req: true },
    { k: "uomId", label: "UOM", type: "ref", ref: "uom", req: true },
    { k: "hsnId", label: "HSN", type: "ref", ref: "hsn", req: true },
    { k: "uniqueBarcode", label: "Unique Barcode", type: "select", req: true, def: "No", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
    { k: "rspOfferPercent", label: "RSP Offer %", type: "number" },
    { k: "wsp", label: "WSP Offer %", type: "number" },
    { k: "offerPriceNetPrice", label: "Ecomm Offer %", type: "number" },

    /* accept marks this as an image field: it is downscaled to maxDim and
       compressed under maxKb in the browser, uploaded to /api/upload, and
       Item.image stores the returned /api/files/... URL. */
    // { k: "image", label: "Image", type: "file", accept: "image/*", maxDim: 1600, maxKb: 600 },
    // { k: "description", label: "Description", type: "text" },

    /* checkref renders options from /api/options?ref=attribute-addon as
       checkboxes — tick any number, value saved as array of ObjectId strings */
    { k: "attributeAddonIds", label: "Attribute Addons", type: "checkref", ref: "attribute-addon" },
   //  { k: "itemType", label: "Item Type", type: "select", req: true, def: "Simple", opts: [{"v":"Simple","l":"Simple"},{"v":"Variant","l":"Variant"}] },
  ];
