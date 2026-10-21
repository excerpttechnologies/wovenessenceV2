import io, re
KIND = {
  'app/api/supplier/route.js': 'Supplier',
  'app/api/supplier/[id]/route.js': 'Supplier',
  'app/api/customer/route.js': 'Customer',
  'app/api/customer/[id]/route.js': 'Customer',
  'app/api/customer/[id]/history/route.js': 'Customer',
  'app/api/agent/route.js': 'Agent',
  'app/api/agent/[id]/route.js': 'Agent',
  'app/api/barcode/[code]/route.js': 'Supplier',
  'app/api/barcode-generation/route.js': 'Supplier',
  'app/api/delivery/route.js': 'Supplier',
  'app/api/delivery/[id]/route.js': 'Supplier',
  'app/api/grc/[id]/route.js': 'Supplier',
  'app/api/purchase-grc/route.js': 'Supplier',
  'app/api/purchase-grc/[id]/print/route.js': 'Supplier',
  'app/api/purchase-invoice/[id]/print/route.js': 'Supplier',
  'app/api/reports/customer-outstanding/route.js': 'Customer',
  'app/api/reports/pos-report/route.js': 'Customer',
  'app/api/reports/sales-person/route.js': 'Agent',
  'app/api/reports/sales-report/route.js': 'Supplier',
  'app/api/reports/supplier-bill/route.js': 'Supplier',
  'app/api/reports/supplier-outstanding/route.js': 'Supplier',
  'app/api/sell-pos/route.js': 'Customer',
  'app/api/sell-pos/[id]/route.js': 'Customer',
  'app/api/stock-transfer/[id]/route.js': 'Supplier',
}
METHODS = r'(?:find|findById|findOne|countDocuments|create|findByIdAndUpdate|findByIdAndDelete|aggregate|updateOne|updateMany|deleteOne|deleteMany|exists|distinct|insertMany|bulkWrite)'
SITE = re.compile(r'(?<![\w.])Contact(?=\s*\.\s*' + METHODS + r'\b)')


def strip_comments(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'//[^\n]*', '', text)


for path, kind in KIND.items():
    s = io.open(path, encoding='utf-8').read()
    static_import = "import { %s } from '@/lib/contacts';" % kind
    dynamic_import = "const { %s } = await import('@/lib/contacts');" % kind

    lines = s.split('\n')
    converted = 0
    imports = 0
    for i, line in enumerate(lines):
        if line.lstrip().startswith('//'):
            continue  # commented-out legacy code stays exactly as it was
        if line == "import Contact from '@/models/Contact';" or re.fullmatch(r"import \{ \w+ as Contact \} from '@/lib/contacts';", line):
            lines[i] = static_import
        m = re.fullmatch(r"(\s*)const Contact = \(await import\('@/models/Contact'\)\)\.default;", line)
        if m:
            lines[i] = m.group(1) + dynamic_import
        lines[i], k = SITE.subn(kind, lines[i])
        converted += k
    s = '\n'.join(lines)

    code = strip_comments(s)
    imports = code.count(static_import) + code.count(dynamic_import)
    assert imports == 1, (path, 'expected exactly one import of', kind, imports)
    decl = re.findall(r'(?:const|let|var|function|class)\s+' + kind + r'\b(?!\s*\}\s*=\s*await import)', code)
    assert not decl, (path, 'local declaration clashes with', kind, decl)
    left = re.findall(r'(?<![\w.\'"/@])Contact(?![\w])', code)
    assert not left, (path, 'Contact identifier left in code', left)
    io.open(path, 'w', encoding='utf-8').write(s)
    print(f'{path:55} {kind:9} {converted} query sites converted')
