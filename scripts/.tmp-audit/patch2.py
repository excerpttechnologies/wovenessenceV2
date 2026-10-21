import io
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:80], s.count(old))
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)

# ---- lib/refLabels.js (live block only; the commented block above is untouched because the
#      live lines are uniquely identified by having no leading "//")
s = io.open('lib/refLabels.js', encoding='utf-8').read()
live_start = s.index("import mongoose from 'mongoose';\n \n/* Resolves")
head, live = s[:live_start], s[live_start:]
pairs = [
 ("import mongoose from 'mongoose';\n \n/* Resolves",
  "import mongoose from 'mongoose';\n \n/* A kind's model, in the { default, LABEL_FIELD } shape the map below expects -\n   from lib/contacts.js, so a supplierId resolves among suppliers, a customerId\n   among customers and an agentId or salesPersonId among agents, in whichever\n   collection lib/contactStorage.js says they live. */\nconst contactModel = (kind) => () => import('@/lib/contacts')\n  .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));\n \n/* Resolves"),
 ("  supplierId:       () => import('@/models/Contact'),\n  agentId:          () => import('@/models/Contact'),\n  customerId:       () => import('@/models/Contact'),",
  "  supplierId:       contactModel('Supplier'),\n  agentId:          contactModel('Agent'),\n  customerId:       contactModel('Customer'),"),
 ("  salesPersonId:          () => import('@/models/Contact'),",
  "  /* the sales screens pick a sales person from the agent list (ref: 'agent') */\n  salesPersonId:          contactModel('Agent'),"),
]
for old, new in pairs:
    assert live.count(old) == 1, ('refLabels', old[:60], live.count(old))
    live = live.replace(old, new)
io.open('lib/refLabels.js', 'w', encoding='utf-8').write(head + live)
print('patched lib/refLabels.js')

# ---- options route
patch('app/api/options/route.js', [
 ("  supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier',",
  "  /* load: the kind's own model (lib/contacts.js). `kind` still filters on\n     contactKind, which is correct whether the kinds share `contact` or each\n     has a collection of its own - see lib/contactStorage.js. */\n  supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier',"),
 ("  agent:                     { load: () => import('@/models/Contact'), kind: 'Agent',",
  "  agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent',"),
 ("  customer:                  { load: () => import('@/models/Contact'), kind: 'Customer',",
  "  customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer',"),
])
