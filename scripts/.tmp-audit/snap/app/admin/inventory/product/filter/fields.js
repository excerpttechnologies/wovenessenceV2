/* Form fields for Product Filters. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true, span: "all" },
    { k: "description", label: "Description", type: "text", req: true, span: "all" },
    { k: "parentId", label: "Parent", type: "ref", ref: "product/filter", span: "all" },
  ];
