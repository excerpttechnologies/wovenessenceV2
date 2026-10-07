/* Form fields for Logistics. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "supplierId", label: "Supplier", type: "ref", ref: "supplier", placeholder: "Select Supplier" },
    { k: "logisticNo", label: "Logistic No", type: "text", req: true },
    { k: "logisticDate", label: "Logistic Date", type: "date", req: true },
    { k: "ewayBillDate", label: "Eway Bill Date", type: "date", req: true },
    { k: "vehicleNo", label: "Vehicle No", type: "text", req: true },
    { k: "ewayBillNo", label: "Eway Bill No", type: "text", req: true },
    { k: "shippingType", label: "Shipping Type", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Road","l":"Road"},{"v":"Rail","l":"Rail"},{"v":"Air","l":"Air"},{"v":"Ship","l":"Ship"}] },
    { k: "freightAmount", label: "Freight Amount", type: "number", req: true },
    { k: "paymentStatus", label: "Payment Status", type: "select", req: true, def: "To be Paid", opts: [{"v":"To be Paid","l":"To be Paid"},{"v":"Paid","l":"Paid"},{"v":"Not Opened","l":"Not Opened"}] },
    { k: "noOfParcels", label: "No Of Parcels", type: "number", req: true },
  ];
