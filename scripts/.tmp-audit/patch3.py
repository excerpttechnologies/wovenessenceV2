import io
p = 'app/api/options/route.js'
s = io.open(p, encoding='utf-8').read()
marker = "import { isValidObjectId } from 'mongoose';\nimport dbConnect from '@/lib/db';\nimport { requireSession } from '@/lib/session';"
assert s.count(marker) == 1, s.count(marker)
i = s.index(marker)
head, live = s[:i], s[i:]
pairs = [
 (marker, marker + "\n\n/* A contact kind's model, in the { default } shape REFS' loaders return - from\n   lib/contacts.js, so the supplier picker reads suppliers, the customer picker\n   customers and the agent picker agents, wherever lib/contactStorage.js keeps\n   them. */\nconst contactOptionsModel = (kind) => import('@/lib/contacts')\n  .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));"),
 ("  supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier',",
  "  /* load: the kind's own model. `kind` still filters on contactKind, which is\n     right whether the kinds share `contact` or each has its own collection. */\n  supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier',"),
 ("  agent:                     { load: () => import('@/models/Contact'), kind: 'Agent',",
  "  agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent',"),
 ("  customer:                  { load: () => import('@/models/Contact'), kind: 'Customer',",
  "  customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer',"),
]
for old, new in pairs:
    assert live.count(old) == 1, (old[:60], live.count(old))
    live = live.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(head + live)
print('patched', p)
