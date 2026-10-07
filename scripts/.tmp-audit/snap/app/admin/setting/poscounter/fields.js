/* Form fields for Pos Counters.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "counterName", label: "Counter Name", type: "text", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "invoiceLayout", label: "Invoice Layout", type: "select", def: "Thermal printer 4 inch", opts: [{"v":"Thermal printer 4 inch","l":"Thermal printer 4 inch"},{"v":"Pos A4","l":"Pos A4"},{"v":"Pos A4 Template 2","l":"Pos A4 Template 2"},{"v":"Slim 4","l":"Slim 4"},{"v":"BS Thermal Print V2","l":"BS Thermal Print V2"},{"v":"Pos A4 Sim","l":"Pos A4 Sim"},{"v":"Thermal printer 3 inch BGS V1","l":"Thermal printer 3 inch BGS V1"},{"v":"SAS A5 POS","l":"SAS A5 POS"},{"v":"KVC POS A5","l":"KVC POS A5"},{"v":"BS Thermal Print V3","l":"BS Thermal Print V3"}] },
    { k: "repeatInvoice", label: "No of times to Repeat Invoice", type: "number", req: true, def: 1 },
  ];
