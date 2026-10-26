/* Form fields for POS Footer Templates (26-10-2026).
   Lives beside the pages that use it - not in a global registry.

   ONE FORM, ALL FIELDS (user, 26-10-2026): no Template 1 / Template 2
   choice - the client fills only the links each template needs, and the
   invoice footer shows every link that is filled, in this order. */

export const FIELDS = [
    { k: "templateName", label: "Template Name", type: "text", req: true },
    { k: "reviewText", label: "Google Review Text", type: "text", def: "Loved shopping with us? Review us on Google" },
    { k: "reviewUrl", label: "Google Review Link", type: "text" },
    { k: "ecommerceName", label: "E-commerce Name", type: "text" },
    { k: "ecommerceUrl", label: "E-commerce Link", type: "text" },
    { k: "instagramText", label: "Instagram Text", type: "text", def: "Follow us on Instagram" },
    { k: "instagramUrl", label: "Instagram Link", type: "text" },
    { k: "communityText", label: "Community Text", type: "text", def: "Join our Community" },
    { k: "communityUrl", label: "Community Link", type: "text" },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
  ];

const LINK_KEYS = ['reviewUrl', 'ecommerceUrl', 'instagramUrl', 'communityUrl'];

/* the fields added after the first version of the model - written straight
   to the collection by the API so a dev server holding the older model
   cannot drop them */
export function extraFields(doc) {
  const pick = (k) => String(doc?.[k] ?? '');
  return {
    ecommerceName: pick('ecommerceName'),
    ecommerceUrl: pick('ecommerceUrl'),
    instagramText: pick('instagramText'),
    instagramUrl: pick('instagramUrl'),
    communityText: pick('communityText'),
    communityUrl: pick('communityUrl'),
  };
}

/* every link is optional, but at least one is needed (a footer with no link
   shows nothing), and each one given must be a web address that opens */
export function reviewUrlError(data) {
  const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);
  const given = LINK_KEYS.filter((k) => String(data?.[k] || '').trim());
  if (!given.length) return { reviewUrl: 'Fill at least one link (Google Review, E-commerce, Instagram or Community).' };
  for (const k of given) {
    if (!isUrl(String(data[k]).trim())) return { [k]: 'Enter the full link, starting with https://' };
  }
  return null;
}
