import io
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)

patch('lib/supplierGst.js', [
 ("   Server-only: it queries the contact collection.", "   Server-only: it queries the supplier collection (lib/contacts.js)."),
 ("   is how POST /api/supplier has always scoped it (each business keeps its own\n   supplier master). Customers and agents share the collection but not the\n   rule. The unique index in models/Contact.js enforces the same thing in the\n   database, so two saves racing each other cannot both win. */",
  "   is how POST /api/supplier has always scoped it (each business keeps its own\n   supplier master). Customers and agents are not bound by it. The unique index\n   in models/Supplier.js enforces the same thing in the database, so two saves\n   racing each other cannot both win. */"),
 ("import Contact, { SUPPLIER_GST_INDEX } from '@/models/Contact';", "import { Supplier } from '@/lib/contacts';\nimport { SUPPLIER_GST_INDEX } from '@/models/Supplier';"),
 ("  return Contact.findOne(filter, { businessName: 1, shortName: 1, contactId: 1 })", "  return Supplier.findOne(filter, { businessName: 1, shortName: 1, contactId: 1 })"),
])
