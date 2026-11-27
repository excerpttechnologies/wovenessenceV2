import Contact from '@/models/Contact';
import SupplierModel from '@/models/Supplier';
import CustomerModel from '@/models/Customer';
import AgentModel from '@/models/Agent';
import { isSplitContactStorage, CONTACT_KINDS } from '@/lib/contactStorage';
import { LABEL_FIELD } from '@/models/contactSchema';

/* The model each kind of contact is read and written through.

   Every route that touches a supplier, a customer or an agent imports its
   model from HERE, never from models/Contact.js - so which collection that
   is (see lib/contactStorage.js) is decided in one place, and a supplier
   route cannot reach customers once the kinds live apart:

     Supplier   supplierId on GRC, GRT, delivery, purchase invoice, debit
                note, logistic, barcode rows, stock transfer lines
     Customer   customerId on POS bills, POS returns, POS holds, sales
                invoices and returns, delivery challans
     Agent      agentId on GRC, GRT, purchase invoice, supplier; and
                salesPersonId, which the sales screens pick from the agent
                list */

const split = isSplitContactStorage();

export const Supplier = split ? SupplierModel : Contact;
export const Customer = split ? CustomerModel : Contact;
export const Agent = split ? AgentModel : Contact;

export const CONTACT_MODEL_BY_KIND = { Supplier, Customer, Agent };

/* The distinct models behind the three kinds: [Contact] until the split,
   [Supplier, Customer, Agent] after it. */
export const CONTACT_MODELS = [...new Set(CONTACT_KINDS.map((k) => CONTACT_MODEL_BY_KIND[k]))];

export { LABEL_FIELD };

/* Records of a KNOWN kind by id - `ids` may mix ObjectIds and strings. */
export function findContactsOfKind(kind, ids, projection) {
  const Model = CONTACT_MODEL_BY_KIND[kind];
  if (!Model) throw new Error('Unknown contact kind: ' + kind);
  const query = Model.find({ _id: { $in: ids } });
  return (projection ? query.select(projection) : query).lean();
}
