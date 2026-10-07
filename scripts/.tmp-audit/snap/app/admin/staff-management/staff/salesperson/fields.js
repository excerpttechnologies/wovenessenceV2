/* Form fields for Sales Persons.
   Lives beside the pages that use it - not in a global registry.

   app/api/sales-person/route.js imports this same array, so it is the one
   definition of what the form offers AND what the server will accept.
   Anything not listed here is dropped on save. */

export const FIELDS = [
  { k: "name", label: "Name", type: "text", req: true },
  { k: "email", label: "Email", type: "text" },
  { k: "spCode", label: "SP Code", type: "text", req: true },
  { k: "isDefault", label: "Default", type: "radio", def: "No", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
  { k: "status", label: "Status", type: "radio", req: true, def: "Active", opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}] },
];
