/* Form fields for Doc Setups.
   Lives beside the pages that use it - not in a global registry. */

import { DOCUMENT_TYPES, VALIDITIES } from '@/lib/docSetup';

export const FIELDS = [
    { k: "documentName", label: "Document Name", type: "text", req: true },
    /* Built from lib/docSetup so the form can never offer a type the
       numbering service does not know, nor omit one it uses. */
    { k: "documentType", label: "Document Type", type: "select", req: true,
      placeholder: "--Select--",
      opts: DOCUMENT_TYPES.map((t) => ({ v: t, l: t })) },
        { k: "description", label: "Description", type: "text" },
    { k: "prefix", label: "Prefix", type: "text", req: true },
    { k: "suffix", label: "Suffix", type: "text" },
    { k: "autoNumberLength", label: "Auto Number Length", type: "number", req: true },
    { k: "startFrom", label: "Start From", type: "number", req: true },
    /* Read-only: the server computes it from prefix + startFrom + suffix on
       every save. It used to be a required free-text box, so the preview was
       whatever someone typed and did not have to match the numbers the
       system would issue. */
    { k: "sample", label: "Sample", type: "text", readOnly: true,
      hint: "Generated from the prefix, length and start number" },
        { k: "validity", label: "Validity", type: "select", req: true, placeholder: "--Select--",
      opts: VALIDITIES.map((v) => ({ v, l: v })),
      hint: "How often the running number restarts at Start From" },
    { k: "finYear", label: "Financial Year", type: "text" },
    { k: "status", label: "Active", type: "checkbox", def: true,
      hint: "An inactive setup is ignored by document numbering" },
  ];

export const NOTE = ["* Prefix Short Code: [MMM]=Short Month, [YY]=Short Year, [YYYY]= Year, [FYY]=Short Year-Year, [FYYYY]=Year-Year","* Ex. [MMM]=Feb, [YY]=21, [YYYY]=2021, [FYY]=21-22, [FYYYY]=2021-2022","* Sample: Maximum 16 characters are allowed"];
