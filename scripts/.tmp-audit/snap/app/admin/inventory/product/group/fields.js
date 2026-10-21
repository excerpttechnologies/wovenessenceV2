/* Form fields for Product Groups. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true, span: "all" },
    { k: "prefix", label: "Prefix", type: "text", span: "all" },
    { k: "parentId", label: "Parent", type: "ref", ref: "product/group", span: "all" },
  ];
