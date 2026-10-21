/* Form fields for POS Setting.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "rspPriceEditable", label: "RSP Price Editable", type: "radio", def: "Disable", opts: [{"v":"Enable","l":"Enable"},{"v":"Disable","l":"Disable"}] },
    { k: "discountPriority", label: "Discount Priority", type: "radio", def: "Global", opts: [{"v":"Global","l":"Global"},{"v":"Customer","l":"Customer"}] },
    { k: "discountType", label: "Discount Type", type: "radio", def: "Percentage", opts: [{"v":"Fixed","l":"Fixed"},{"v":"Percentage","l":"Percentage"}] },
    { k: "discountValue", label: "Discount Value", type: "number", def: 0 },
    { k: "slNoOnPosScreen", label: "SL No. On POS Screen", type: "radio", def: "Hide", opts: [{"v":"Show","l":"Show"},{"v":"Hide","l":"Hide"}] },
    { k: "itemColumnOnPosScreen", label: "Item Column On POS Screen", type: "radio", def: "Both", opts: [{"v":"Item Name","l":"Item Name"},{"v":"Item Description","l":"Item Description"},{"v":"Both","l":"Both"}] },
  ];
