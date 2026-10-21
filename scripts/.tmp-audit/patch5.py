import io
p='models/SalesPerson.js'
s=io.open(p,encoding='utf-8').read()
old="""   Deliberately its own collection rather than another `contactKind` on
   models/Contact.js. A sales person is staff, not a party you trade with:"""
new="""   Deliberately its own collection rather than another contact kind
   (models/contactSchema.js). A sales person is staff, not a party you trade with:"""
old2="""   stamped on Delivery Challan / Sales Invoice / IC documents resolves through
   lib/refLabels.js to models/Contact.js, NOT to this model. Those existing
   documents point at a Contact. Repointing them is a data migration and a"""
new2="""   stamped on Delivery Challan / Sales Invoice / IC documents resolves through
   lib/refLabels.js to the AGENT model (lib/contacts.js), NOT to this model -
   the sales screens pick a sales person from the agent list. Those existing
   documents point at an agent. Repointing them is a data migration and a"""
for o,n in [(old,new),(old2,new2)]:
    assert s.count(o)==1, o[:50]
    s=s.replace(o,n)
io.open(p,'w',encoding='utf-8').write(s); print('patched',p)
