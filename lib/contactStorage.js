import { COLLECTION_BY_KIND, CONTACT_KINDS, LEGACY_CONTACT_COLLECTION } from '../models/contactSchema.js';

/* WHERE SUPPLIERS, CUSTOMERS AND AGENTS ARE READ AND WRITTEN - one switch,
   for the application and the scripts alike.

     CONTACT_STORAGE=split    supplier / customer / agent - their own
                              collections (the target architecture)
     anything else, or unset  contact - the shared collection, as before

   WHY A SWITCH AND NOT A STRAIGHT CUT-OVER
   The database behind .env is shared: the dev server, deployed copies of the
   ERP, other sessions' import and QA scripts and the e-commerce storefront all
   use it at the same time. Code that starts writing suppliers to `supplier`
   while anything else still writes them to `contact` splits one supplier
   master into two that silently disagree. So the separated collections are
   filled and verified first (scripts/migrateContactsToSeparateCollections.mjs),
   every reader and writer goes through this one function, and the change of
   storage is a single deliberate step taken when everything that writes
   contacts can move together:

     1. npm run contacts:split:apply     final catch-up copy, verified
     2. CONTACT_STORAGE=split in .env    for the app AND the scripts
     3. restart the app

   and undone the same way (npm run contacts:rollback:apply, then unset it).

   Every query that filtered on contactKind still does, so the same code is
   correct in both modes: in `contact` the filter picks the kind out of the
   mix, in a kind's own collection it matches every record.

   Pure - no model is loaded here - so a plain Node script can import it. */

export function contactStorage() {
  return process.env.CONTACT_STORAGE === 'split' ? 'split' : 'legacy';
}

export const isSplitContactStorage = () => contactStorage() === 'split';

/* The collection a kind is read from and written to, right now. */
export function contactCollection(kind) {
  if (!CONTACT_KINDS.includes(kind)) throw new Error('Unknown contact kind: ' + kind);
  return isSplitContactStorage() ? COLLECTION_BY_KIND[kind] : LEGACY_CONTACT_COLLECTION;
}

/* Every distinct collection that currently holds contacts - one in legacy
   mode, three once split. For a question that spans kinds, such as the next
   free contact code. */
export function contactCollections() {
  return [...new Set(CONTACT_KINDS.map(contactCollection))];
}

export { CONTACT_KINDS, COLLECTION_BY_KIND, LEGACY_CONTACT_COLLECTION };
