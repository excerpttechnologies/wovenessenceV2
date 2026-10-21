/* Form fields for City Groups.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "groupName", label: "Group Name", type: "text", req: true },
    { k: "cities", label: "Cities", type: "multicity", req: true, span: "all", placeholder: "Search city" },
  ];
