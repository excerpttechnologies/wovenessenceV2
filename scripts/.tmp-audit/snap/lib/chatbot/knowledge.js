/* ==========================================================================
   Help bot knowledge base.

   NO AI. Answers are hand-written and matched by keyword scoring - the same
   question always returns the same answer, and nothing is generated at
   runtime. Plain module (no 'use client') so it can be imported by a route
   handler or a test as easily as by the widget.

   Adding a topic is one entry in TOPICS. Nothing else needs touching:
   categories, the browse menu and the "related" chips are all derived.

   Shape of a topic
     id       stable slug, used by `related` and by the browse menu
     cat      category name - drives the browse menu, order below is kept
     q        the question as a person would ask it (shown in menus)
     k        keywords. Multi-word entries are matched as a phrase and score
              much higher, so 'stock transfer' beats a stray 'stock'
     a        answer paragraphs
     steps    optional numbered steps
     note     optional caveat, rendered in the amber note style
     related  optional topic ids offered as follow-up chips
   ========================================================================== */

export const CATEGORY_ORDER = [
  'Getting started',
  'Masters setup',
  'Contacts',
  'Inventory & barcodes',
  'Purchase',
  'Sell & POS',
  'Stock transfers',
  'Inter company sell',
  'Transportation',
  'Ledger & reports',
  'Using the screens',
  'Troubleshooting',
  'Limits & known gaps',
];

export const TOPICS = [
  /* ------------------------------------------------------ Getting started */
  {
    id: 'sign-in',
    cat: 'Getting started',
    q: 'How do I sign in?',
    k: ['login', 'log in', 'sign in', 'signin', 'password', 'credentials', 'account'],
    a: [
      'Go to /login. The seed script creates one Super Admin account.',
      'The default is s@gmail.com with the password s@gmail.com. You can override both by setting SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running the seed.',
      'Sessions last 12 hours. Everything under /admin is gated - visiting it signed out bounces you to /login and returns you afterwards.',
    ],
    related: ['seed', 'top-bar-scope'],
  },
  {
    id: 'seed',
    cat: 'Getting started',
    q: 'How do I set up a fresh database?',
    k: ['seed', 'fresh install', 'setup', 'install', 'mongodb uri', 'database', 'empty database', 'npm run seed'],
    a: ['Set MONGODB_URI in .env, then run the seed. It is safe to run more than once.'],
    steps: [
      'Add MONGODB_URI to .env (the seed refuses to run without it).',
      'npm run seed - creates the admin user, the Temple Fabrics main branch, two locations, 18 ledger groups, the barcode-label and invoice-layout catalogs, and a city list.',
      'npm run dev, then sign in.',
    ],
    note: 'The seed also enforces the branch invariant on every run: exactly one main branch, everything else pointed at it as a sub-branch.',
    related: ['sign-in', 'doc-setup'],
  },
  {
    id: 'top-bar-scope',
    cat: 'Getting started',
    q: 'What do the three selectors in the top bar do?',
    k: ['top bar', 'topbar', 'scope', 'business selector', 'location selector', 'financial year', 'fin year', 'branch', 'switch business'],
    a: [
      'Business, Location and Financial Year scope every single query in the app. They are not a filter you can ignore - a document raised under one branch does not exist as far as another branch is concerned.',
      'Business defaults to the main branch. Location remembers your last choice per browser. Financial year runs 1 April to 31 March.',
      'If a list looks empty, this is the first thing to check - it is the cause of most "my record vanished" reports.',
    ],
    related: ['empty-list', 'inbox-empty'],
  },
  {
    id: 'nav',
    cat: 'Getting started',
    q: 'How is the app laid out?',
    /* deliberately no 'where is' - as a phrase it outscored every topic
       someone was actually asking "where is X" about */
    k: ['sidebar', 'menu', 'navigation', 'modules', 'app layout'],
    a: [
      'The sidebar carries Dashboard, Masters, Inventory, Contacts, Purchase, Sell, Stock Transfers, Inter Company Sell and Ledger Transaction.',
      'Masters is where you set things up. Inventory holds items and barcodes. Purchase and Sell hold the day-to-day documents. Everything else builds on those.',
    ],
    related: ['transport-hidden', 'top-bar-scope'],
  },

  /* -------------------------------------------------------- Masters setup */
  {
    id: 'doc-setup',
    cat: 'Masters setup',
    q: 'How does document numbering work?',
    k: ['doc setup', 'document number', 'numbering', 'prefix', 'document numbering', 'auto number', 'invoice number', 'series'],
    a: [
      'Masters > Doc Setup holds one row per document type. A number is the prefix, then a running number zero-padded to Auto Number Length, starting at Start From.',
      'Doc Setup is scoped by business AND financial year. A row must exist under whichever branch raises the document.',
    ],
    steps: [
      'Masters > Doc Setup > ADD.',
      'Pick the Document Type, set Prefix, Auto Number Length, Start From and Validity.',
      'Switch the top bar to your other branch and repeat - the rows do not carry across.',
    ],
    note: 'Prefix tokens: [MMM] short month, [YY] short year, [YYYY] full year, [FYY] and [FYYYY] financial year. So WH/DC/[YY]/ becomes WH/DC/26/0001.',
    related: ['bare-number', 'barcode-settings'],
  },
  {
    id: 'business-masters',
    cat: 'Masters setup',
    q: 'How do branches and the main branch work?',
    k: ['business master', 'branch', 'main branch', 'sub branch', 'add business', 'company', 'delete business'],
    a: [
      'Masters > Business Masters. The seed creates one business flagged as the main branch; it carries a green Main Branch badge on the list.',
      'Anything you add through the form becomes a sub-branch pointing at it. You cannot make a second main branch from the UI - the flag is set server-side and never read from the form.',
      'The main branch cannot be deleted; the API returns 409 and the delete button is not offered on that row.',
    ],
    note: 'Renaming the main branch does not demote it - identity lives in the stored flag, not the name.',
    related: ['company-locations', 'gstin-tax-split'],
  },
  {
    id: 'company-locations',
    cat: 'Masters setup',
    q: 'How do I add a location for a second business?',
    k: ['company location', 'location', 'add location', 'warehouse', 'location dropdown empty', 'branch location'],
    a: [
      'Masters > Company Locations saves against whatever business the top bar is showing.',
      'To give a second business a location you must switch the top bar to that business first, then add it. Skipping the switch is the most common setup mistake - the other branch then has an empty Location dropdown on every screen with nothing on-screen explaining why.',
    ],
    related: ['location-empty', 'business-masters'],
  },
  {
    id: 'tax-master',
    cat: 'Masters setup',
    q: 'How do I set up tax rates?',
    k: ['tax master', 'gst', 'igst', 'cgst', 'sgst', 'cess', 'tax rate', 'tax slab', 'add tax'],
    a: [
      'Masters > Tax Master. Create one row per slab, e.g. "GST 5 %".',
      'Fill all four rate fields, not just IGST. If CGST and SGST are blank, an intra-state document computes zero tax while still showing the slab name - which reads as a display bug but is really missing data.',
    ],
    related: ['hsn', 'gst-zero', 'gstin-tax-split'],
  },
  {
    id: 'hsn',
    cat: 'Masters setup',
    q: 'How do HSN codes and tax slabs connect?',
    k: ['hsn', 'hsn master', 'tax slab', 'slab', 'hsn code'],
    a: [
      'Masters > HSN Master. Each HSN carries one or more Tax Slab rows, and each slab points at a Tax Master row. That is the chain every document walks: item to HSN to slab to the actual IGST/CGST/SGST percentages.',
    ],
    note: 'Tax slabs can only be added while creating an HSN, not while editing. Get it right first time, or delete the HSN and re-create it.',
    related: ['tax-master', 'item-master'],
  },
  {
    id: 'item-master',
    cat: 'Masters setup',
    q: 'How do I create an item?',
    k: ['item', 'item master', 'product', 'create item', 'add item', 'rsp', 'wsp', 'item code'],
    a: ['Inventory > Item. Fill these in order, because each depends on the one before: Tax Master, HSN Master, Unit of Measurement, Group, then Item.'],
    steps: [
      'Set Name, Sub Group, UOM and HSN.',
      'Set Item Code and Prefix.',
      'Set RSP Price - this is the unit rate every selling document reads.',
      'Unique Barcode = Yes makes barcode generation default to one barcode per piece.',
    ],
    note: 'Without RSP, every line on a challan or invoice comes out 0.00 and all totals stay zero.',
    related: ['unit-rate-zero', 'barcode-generation'],
  },
  {
    id: 'barcode-settings',
    cat: 'Masters setup',
    q: 'How do Barcode Settings work?',
    k: ['barcode setting', 'barcode settings', 'periodic', 'monthly', 'quarterly', 'yearly', 'sample barcode', 'start number', 'number length'],
    a: [
      'Masters > Barcode Settings. One row per period: a Monthly configuration produces 12 rows for the financial year, Quarterly 4, Yearly 1. Each row is independently editable and deletable.',
      'ADD opens a full-screen overlay where you pick Type and Sub Type once and fill every period below. Copy pushes the first period settings down into the rest; Clear empties them. Both only appear for Monthly and Quarterly.',
    ],
    note: 'Sample Barcode is derived, never typed: prefix + start number padded to Number Lenght + suffix. Effective and Expiry dates must cover today or barcode generation refuses to run.',
    related: ['barcode-generation', 'no-active-setting'],
  },
  {
    id: 'stock-point',
    cat: 'Masters setup',
    q: 'What is a Stock Point?',
    k: ['stock point', 'stockpoint', 'warehouse', 'showroom', 'stockroom'],
    a: [
      'Masters > Stock Point Master. A named place stock sits - Warehouse, Stockroom, Showroom or Transit Stock. Stock points can nest through the Parent field.',
      'Several documents require one: GRC, Delivery Challan, Stock Transfer Packet and the inter company documents.',
    ],
    related: ['stock-transfer-flow', 'ic-flow'],
  },
  {
    id: 'ledger-setup',
    cat: 'Masters setup',
    q: 'What are Ledger Groups, Ledgers and Voucher Settings?',
    k: ['ledger', 'ledger group', 'ledger mapping', 'voucher setting', 'chart of accounts', 'opening balance'],
    a: [
      'Ledger Group is the tree - the seed creates 18, rooted at Assets, Liabilities and EXPENSES. Ledger is an individual account hanging off a group, carrying an opening balance.',
      'Ledger Mapping and Voucher Settings decide which groups feed which dropdowns. Voucher Settings has three sections - Receipt, Payment and Contra - each with a Dr and a Cr multi-select.',
    ],
    note: 'The Dashboard Expenses tile sums the opening balance of every ledger whose group tree is rooted at EXPENSES.',
    related: ['ledger-transaction', 'ledger-name-ac'],
  },

  /* -------------------------------------------------------------- Contacts */
  {
    id: 'contacts',
    cat: 'Contacts',
    q: 'How do suppliers, customers and agents work?',
    k: ['contact', 'supplier', 'customer', 'agent', 'add supplier', 'add customer', 'contact type'],
    a: [
      'All three live in one collection and are told apart by a kind that is stamped server-side, so it cannot be spoofed from the form.',
      'Each form has four tabs with its own Submit - the record is created on the first tab and updated as you move through the rest.',
      'Create Contact Types first: the type prefix drives the generated Contact ID.',
    ],
    related: ['contact-id', 'payment-ledger'],
  },
  {
    id: 'contact-id',
    cat: 'Contacts',
    q: 'Where does the Contact ID come from?',
    k: ['contact id', 'contactid', 'prefix', 'g1', 'contact number'],
    a: [
      'Contact ID is the Contact Type prefix plus a running number - G1, G2, PO510, AGENT7. It is issued server-side on create and sorts on the numeric part, so it counts past 9 into 10 correctly.',
    ],
    related: ['contacts'],
  },
  {
    id: 'payment-ledger',
    cat: 'Contacts',
    q: 'How do I map a contact to a ledger?',
    k: ['payment ledger', 'map ledger', 'financial details', 'ledger mapping contact'],
    a: [
      'Open the contact, go to the Financial Details tab and set Payment Ledger.',
      'Until you do, that party shows on Ledger Transactions as "<Party> A/C" rather than a real ledger name. Mapping it renames every entry for that party, old rows included, because entries are computed at read time.',
    ],
    related: ['ledger-name-ac', 'ledger-transaction'],
  },

  /* -------------------------------------------- Inventory & barcodes */
  {
    id: 'barcode-generation',
    cat: 'Inventory & barcodes',
    q: 'How do I generate barcodes / put stock into the system?',
    k: ['barcode generation', 'generate barcode', 'create stock', 'add stock', 'gcr', 'unique', 'batch', 'receive stock'],
    a: [
      'Inventory > Barcode Generation. This screen is where stock comes from - it writes a GRC plus the barcode rows, and those barcode rows ARE the stock every other screen reads.',
    ],
    steps: [
      'Type an Item Code and press Enter - the item master fills in the row.',
      'Choose UNIQUE (one barcode per piece, splits into that many rows) or BATCH (one barcode for the whole lot, single row).',
      'Enter QTY and press Enter.',
      'Fill the shared fields - UOM, HSN, Pur Rate, GST %, prices. They propagate live to every row in the group.',
      'Generate All Barcodes, then Submit.',
    ],
    note: 'Generate reads the Barcode Setting whose Effective/Expiry window covers today, and pushes the advanced serial back onto that setting - so numbering survives a page reload.',
    related: ['barcode-settings', 'no-active-setting', 'no-grc-item'],
  },
  {
    id: 'print-label',
    cat: 'Inventory & barcodes',
    q: 'How do I print barcode labels?',
    k: ['print label', 'label', 'barcode print', 'sticker', 'print barcode'],
    a: [
      'Inventory > Print Label, or the barcode-print screen reached from a GRC. Labels render with JsBarcode bundled into the app, so there is no CDN call to fail.',
      'Label sizes come from Masters > Barcode Label Settings, which is a choice table over the seeded catalog - tick the ones you use and mark one Default.',
    ],
    related: ['barcode-generation'],
  },
  {
    id: 'barcode-item',
    cat: 'Inventory & barcodes',
    q: 'What is the Barcode Item screen?',
    k: ['barcode item', 'barcode list', 'search barcode'],
    a: [
      'Inventory > Barcode Item is a read-only list of generated barcode rows, joined back to the GRC that produced them. Filter by group, item, RSP range, cost range or barcode range.',
    ],
    related: ['barcode-generation'],
  },
  {
    id: 'stock-adjustment',
    cat: 'Inventory & barcodes',
    q: 'How do I adjust stock?',
    k: ['stock adjustment', 'adjust stock', 'lost', 'damaged', 'expired', 'theft', 'write off'],
    a: [
      'Inventory > Stock Adjustment. Pick a reason (Lost, Damaged, Expired, Theft, Other), a date and a stock point, then add items under the Stock Addition or Stock Subtraction tab.',
    ],
    note: 'Adjustments are recorded but do not move a running balance - this project has no stock ledger.',
    related: ['no-stock-ledger'],
  },

  /* -------------------------------------------------------------- Purchase */
  {
    id: 'grc',
    cat: 'Purchase',
    q: 'What is a GRC and how do I raise one?',
    k: ['grc', 'goods receipt challan', 'receipt challan', 'receive goods', 'purchase receipt'],
    a: [
      'A Goods Receipt Challan records goods arriving from a supplier. Purchase > Goods Receipt Challan.',
      'There are two ways to get one: the ADD form, which captures the header, or Inventory > Barcode Generation, which creates the GRC and its barcode rows together. The second is the one that also creates stock.',
      'The row Action menu offers Edit, Barcode Print and GRC Print.',
    ],
    related: ['barcode-generation', 'grc-to-invoice'],
  },
  {
    id: 'grc-to-invoice',
    cat: 'Purchase',
    q: 'How do I turn a GRC into a Purchase Invoice?',
    k: ['purchase invoice', 'grc to invoice', 'convert grc', 'unconverted', 'grc list'],
    a: [
      'Purchase > Purchase Invoice > ADD. Pick the supplier, and the GRC List shows that supplier\'s challans that have not been invoiced yet. Tick one or more.',
      'Once invoiced, the GRC drops out of that list. The invoice also writes its Taxable, Total Quantity, GST and Net Amount back onto the GRC, split pro-rata when several are merged.',
    ],
    note: 'Line maths: Discount = Purchase Rate x Discount%, Final Rate = Rate - Discount - R.Off Discount, Before Tax = Final Rate x QTY, then GST per slab, then Net = Before Tax + GST.',
    related: ['grc', 'debit-note'],
  },
  {
    id: 'debit-note',
    cat: 'Purchase',
    q: 'How do returns to a supplier work?',
    k: ['grt', 'goods return note', 'debit note', 'return to supplier', 'purchase return'],
    a: [
      'Two steps. Purchase > Goods Return Note (GRT) records the goods going back. Purchase > Debit Note then picks up unconverted GRTs for that supplier and carries the value.',
      'The GRT moves stock; the Debit Note is the one that shows on Ledger Transactions, because it is the document that carries money.',
    ],
    related: ['grc-to-invoice', 'ledger-transaction'],
  },

  /* ----------------------------------------------------------- Sell & POS */
  {
    id: 'sell-flow',
    cat: 'Sell & POS',
    q: 'How does the sell flow work?',
    k: ['delivery challan', 'sales invoice', 'sell', 'dc', 'sales', 'invoice customer'],
    a: [
      'Sell > Delivery Challan records goods leaving. Sell > Sales Invoice then picks up that customer\'s unconverted challans and consolidates them.',
      'The challan list on the invoice is filtered by the customer you pick, so you only see their challans.',
    ],
    related: ['credit-note', 'pos'],
  },
  {
    id: 'credit-note',
    cat: 'Sell & POS',
    q: 'How do customer returns work?',
    k: ['sales return', 'credit note', 'customer return', 'return from customer'],
    a: [
      'Sell > Sales Return records the goods coming back. Sell > Credit Note then picks up unconverted sales returns for that customer.',
      'Both appear on Ledger Transactions as a credit against the customer.',
    ],
    related: ['sell-flow', 'ledger-transaction'],
  },
  {
    id: 'pos',
    cat: 'Sell & POS',
    q: 'How does the POS till work?',
    k: ['pos', 'till', 'counter', 'point of sale', 'cash register', 'pos return'],
    a: [
      'Sell > POS opens a full-screen till with no sidebar or top bar. Scan or type into the product box and press Enter, F9 or Tab to add a line.',
      'Counter and Sales Person come from Pos Counter Master and your agent list. POS Return handles refunds.',
    ],
    note: 'Hold, Multiple Pay and Recent Transactions render but do not persist anything yet - that part was never implemented.',
    related: ['sell-flow'],
  },

  /* ------------------------------------------------------- Stock transfers */
  {
    id: 'stock-transfer-flow',
    cat: 'Stock transfers',
    q: 'How do stock transfers work?',
    k: ['stock transfer', 'transfer stock', 'packet', 'transfer between locations', 'stl', 'stp', 'str'],
    a: [
      'Moving goods between two locations of the SAME business, in three stages. If the goods change owner it is Inter Company Sell instead; if they only change shelf, it is this.',
    ],
    steps: [
      'Transfer Stock Packet - goods are boxed at the source. Gets a packet number, e.g. WH/26/00001.',
      'Transfer Stock Location - one or more packets are consolidated into a despatch, with the waybill.',
      'Transfer Stock Received - the destination accepts it, e.g. 26/jnr/001.',
    ],
    note: 'A packet on its own never reaches the Received page. A packet is goods boxed, not goods sent - only a Stock Transfer Location is a despatch.',
    related: ['transfer-locked', 'inbox-empty', 'stock-transfer-rules'],
  },
  {
    id: 'stock-transfer-rules',
    cat: 'Stock transfers',
    q: 'What does a stock transfer refuse to do?',
    k: ['transfer rules', 'transfer refused', 'transfer error', 'source destination same'],
    a: ['These are enforced server-side, so they hold even if the form is bypassed:'],
    steps: [
      'Source and destination must differ.',
      'A packet must have at least one line.',
      'Only unconsolidated packets running between the two chosen locations can be picked, re-checked at write time.',
      'A claimed packet cannot be edited or deleted (409).',
      'You can only receive what is addressed to your location (403 otherwise).',
      'Two people receiving at once - the loser is rolled back with a 409.',
    ],
    related: ['stock-transfer-flow', 'conflict-409'],
  },

  /* --------------------------------------------------- Inter company sell */
  {
    id: 'ic-flow',
    cat: 'Inter company sell',
    q: 'How does Inter Company Sell work?',
    k: ['inter company', 'intercompany', 'ic', 'between businesses', 'auto purchase', 'branch transfer sale'],
    a: [
      'Moving goods between two of your own businesses, and the paperwork that follows. Five screens.',
      'The top-bar business selector is "which branch am I standing in" - half this flow is switching it. If a list looks empty, check that first.',
    ],
    steps: [
      'Delivery Challan, raised by the sender.',
      'Sales Invoice - picks up unconverted challans for that destination and prints as a Tax Invoice.',
      'Auto Purchases Received - switch to the receiving branch, accept it. This creates a real GRC in that branch, so the goods enter its normal purchase flow.',
      'Auto Purchases Return - the receiver sends goods back.',
      'Sales Return - the original sender accepts the return.',
    ],
    related: ['gstin-tax-split', 'ic-guards', 'inbox-empty'],
  },
  {
    id: 'gstin-tax-split',
    cat: 'Inter company sell',
    q: 'What decides IGST versus CGST + SGST?',
    k: ['igst or cgst', 'tax split', 'interstate', 'intrastate', 'state code', 'gstin state'],
    a: [
      'The first two digits of the two GSTINs - that is the state code.',
      'Same state code means intra-state, which splits into CGST + SGST. Different means inter-state, which carries IGST. On an inter company document it compares the two businesses\' GSTINs; on a stock transfer it compares the two locations\'.',
      'The printed invoice switches its column layout to match automatically.',
    ],
    related: ['tax-master', 'gst-zero'],
  },
  {
    id: 'ic-guards',
    cat: 'Inter company sell',
    q: 'Why can I not edit or delete an inter company document?',
    k: ['409', 'cannot edit', 'cannot delete', 'locked', 'claimed', 'refused'],
    a: ['Once a document has been consumed downstream it locks, because the downstream document copied its lines. The refusals are:'],
    steps: [
      'Edit or delete a Delivery Challan that is on a Sales Invoice - 409.',
      'Delete a Sales Invoice the other branch has received - 409.',
      'Receive an invoice twice, or accept a return twice - 409, and race-safe.',
      'Receive an invoice not addressed to you - 403.',
      'Reverse a receipt whose GRC is already on a Purchase Invoice - 409.',
    ],
    note: 'Deleting the downstream document always releases what it claimed, so nothing is ever stranded.',
    related: ['conflict-409', 'ic-flow'],
  },
  {
    id: 'e-invoice',
    cat: 'Inter company sell',
    q: 'Why is there no IRN or QR code on the printed invoice?',
    k: ['irn', 'e-invoice', 'einvoice', 'qr code', 'ack no', 'irp'],
    a: [
      'That is correct and expected. The fields exist on the model, but nothing in this project calls an IRP.',
      'The invoice prints as a plain Tax Invoice and simply omits those lines. When a real integration writes IRN, Ack No, Ack Date and a QR data URI, the block appears on its own.',
    ],
    related: ['ic-flow'],
  },

  /* -------------------------------------------------------- Transportation */
  {
    id: 'transport-hidden',
    cat: 'Transportation',
    q: 'Where is the Transportation module?',
    k: ['transportation', 'transport', 'transporter', 'vehicle', 'driver', 'route', 'dispatch', 'lr', 'consignment'],
    a: [
      'It is fully built - six screens under /admin/transport - but the sidebar group is currently commented out in config/nav.js, so there is no menu entry. Reach it by URL until that is switched back on.',
      'The screens are: /admin/transport/transporter, /delivery, /vehicle, /driver, /route and /dispatch.',
    ],
    related: ['transport-flow'],
  },
  {
    id: 'transport-flow',
    cat: 'Transportation',
    q: 'How does the transport flow work?',
    k: ['delivery lr', 'lr number', 'booking', 'freight', 'dispatch vehicle', 'consignment'],
    a: [
      'Two masters feed one transaction, which is then loaded onto a dispatch.',
      'Set up Transport Master, Vehicle, Driver and Route first. Then Delivery books a consignment against a transporter and issues an LR number like LR/26/001. Dispatch picks a vehicle, driver and route, and claims consignments no other dispatch has taken.',
    ],
    note: 'Freight GST is 5%, split evenly into CGST and SGST at 2.5% each. The rate that applied is stored on each document, so changing it later never rewrites history.',
    related: ['transport-hidden', 'dispatch-load'],
  },
  {
    id: 'dispatch-load',
    cat: 'Transportation',
    q: 'How do I change which consignments a dispatch carries?',
    k: ['change dispatch', 'edit dispatch', 'consignment change', 'release consignment'],
    a: [
      'You cannot, by editing. Editing a dispatch changes Vehicle, Driver, Route, Party and Status only.',
      'To change the load, delete the dispatch - which releases every consignment back into the picker - and raise it again.',
    ],
    related: ['transport-flow'],
  },

  /* ----------------------------------------------------- Ledger & reports */
  {
    id: 'ledger-transaction',
    cat: 'Ledger & reports',
    q: 'What is the Ledger Transaction screen?',
    k: ['ledger transaction', 'dr cr', 'debit credit', 'ledger report', 'statement', 'account'],
    a: [
      'A read-only list of Dr / Cr entries. There is no ADD button because this module owns no data - it reads eight other collections and turns each document into a ledger line.',
      'The eight sources are Purchase Invoice (Cr), Debit Note (Dr), Sales Invoice (Dr), Credit Note (Cr), Sales Return (Cr), POS (Dr), POS Return (Cr) and Inter Company Sales Invoice (Dr).',
      'Direction is from the party\'s point of view: buying on credit credits the supplier, returning goods to them debits them.',
    ],
    note: 'GRC, GRT and Delivery Challan are deliberately absent - they move stock, not money. A goods return appears when its Debit Note is raised.',
    related: ['ledger-name-ac', 'no-posting-engine'],
  },
  {
    id: 'dashboard',
    cat: 'Ledger & reports',
    q: 'What do the dashboard tiles show?',
    k: ['dashboard', 'tiles', 'chart', 'total sales', 'total purchase', 'expenses'],
    a: [
      'Total Purchase is a count of GRCs. Total Sales is sales invoice net value plus POS totals. Expenses sums opening balances of ledgers under EXPENSES. Both charts group sales invoices by day (last 30) and by month (financial year), split by business.',
      'Purchase Due and Invoice Due are marked (static) - they need payments and receipts, which live in the Voucher and Cash Register modules and are not built.',
    ],
    related: ['ledger-setup'],
  },

  /* ------------------------------------------------------ Using the screens */
  {
    id: 'exports',
    cat: 'Using the screens',
    q: 'How do I export a list?',
    k: ['export', 'csv', 'excel', 'pdf', 'download', 'print list'],
    a: [
      'Every list has Export to CSV, Export to Excel and Export to PDF above the table. PDF opens the browser print dialog.',
    ],
    note: 'Exports cover the page currently on screen, not the whole result set. Narrow the filters first, or raise perPage in the URL.',
    related: ['filters', 'columns'],
  },
  {
    id: 'filters',
    cat: 'Using the screens',
    q: 'How do the filter cards work?',
    k: ['filter', 'search', 'date range', 'reset filter'],
    a: [
      'Filters are held locally and only applied when you press Search - or Enter inside a text box. They do not apply as you type.',
      'The plain Search box beside ADD is separate and does filter as you type.',
    ],
    related: ['exports', 'columns'],
  },
  {
    id: 'columns',
    cat: 'Using the screens',
    q: 'Can I hide columns?',
    k: ['column', 'column visibility', 'hide column', 'show column'],
    a: ['Yes - Column visibility at the top left of any list. Hidden columns are also left out of exports.'],
    related: ['exports'],
  },
  {
    id: 'scan-shortcut',
    cat: 'Using the screens',
    q: 'What are the keyboard shortcuts on entry screens?',
    k: ['shortcut', 'keyboard', 'enter', 'f9', 'tab', 'scan', 'barcode gun'],
    a: [
      'In any "Enter item code" box, press Enter, F9 or Tab to add the item - the box must have focus.',
      'Scanning a code that is already on the grid adds 1 to that line rather than opening a duplicate, which is what a barcode gun does when it repeats a scan.',
    ],
    related: ['barcode-generation', 'no-grc-item'],
  },

  /* ------------------------------------------------------- Troubleshooting */
  {
    id: 'empty-list',
    cat: 'Troubleshooting',
    q: 'A list is empty but I know the records exist',
    k: ['empty list', 'no data', 'missing records', 'records gone', 'nothing showing', 'cannot find record'],
    a: ['In order of likelihood:'],
    steps: [
      'Wrong business in the top bar - everything is scoped by it.',
      'Wrong financial year.',
      'Wrong location, on screens that scope by location.',
      'On an inbox screen, you are standing in the sending branch rather than the destination.',
      'On a filter-card screen, you have not pressed Search yet.',
    ],
    related: ['top-bar-scope', 'inbox-empty'],
  },
  {
    id: 'inbox-empty',
    cat: 'Troubleshooting',
    q: 'The Pending list on a receiving screen is empty',
    k: ['pending empty', 'inbox empty', 'nothing to receive', 'auto purchases received empty', 'pending transfer'],
    a: [
      'An inbox shows what is addressed to YOU, and "you" means whatever the top bar points at.',
      'For Auto Purchases Received, switch the top-bar Business to the destination branch. For Transfer Stock Received, switch the top-bar Location to the destination location - on the source it is correctly empty.',
      'If it is still empty: you only created a packet (packets never appear there - create the Stock Transfer Location), the financial years differ, or it has already been received and is in the lower card.',
    ],
    related: ['top-bar-scope', 'stock-transfer-flow', 'ic-flow'],
  },
  {
    id: 'bare-number',
    cat: 'Troubleshooting',
    q: 'My document number came out as 0001 with no prefix',
    k: ['bare number', 'no prefix', '0001', 'wrong number', 'number missing prefix'],
    a: [
      'There is no Doc Setup row for that document type under that business and financial year. Numbering falls back silently rather than erroring.',
      'Add the row and new documents pick up the prefix. Existing documents keep the number they were issued.',
    ],
    related: ['doc-setup'],
  },
  {
    id: 'no-grc-item',
    cat: 'Troubleshooting',
    q: '"No GRC item found" when I scan an item code',
    k: ['no grc item', 'item not found', 'scan fails', 'code rejected', 'receive it first'],
    a: [
      'That item has never been received through a Goods Receipt Challan, so there is no barcode row for it - and barcode rows are what this app treats as stock.',
      'Fix it at Inventory > Barcode Generation: enter the item code, set QTY, Generate, Submit.',
    ],
    related: ['barcode-generation', 'no-stock-here'],
  },
  {
    id: 'no-stock-here',
    cat: 'Troubleshooting',
    q: '"No stock of X at this business"',
    k: ['no stock at this business', 'stock elsewhere', 'wrong business stock'],
    a: [
      'The item exists and has barcode rows, but they belong to a different business. Stock is scoped by business, so another branch\'s rows are not stock you can ship from here.',
      'Receive it into this business first.',
    ],
    related: ['no-grc-item', 'no-stock-ledger'],
  },
  {
    id: 'unit-rate-zero',
    cat: 'Troubleshooting',
    q: 'Unit Rate is 0.00 on every line',
    k: ['unit rate zero', 'rate 0.00', 'price zero', 'no price', 'total zero'],
    a: ['The item has no RSP Price. RSP is the unit rate every selling document reads. Set it on Inventory > Item.'],
    note: 'Editing a master does not update a row already on screen. Delete the grid row and scan it again.',
    related: ['item-master'],
  },
  {
    id: 'gst-zero',
    cat: 'Troubleshooting',
    q: 'GST columns show 0.00 even though the slab says 5%',
    k: ['gst zero', 'tax zero', 'no gst', 'cgst blank', 'gst not calculating'],
    a: [
      'The Tax Master row has CGST and SGST blank - only IGST was filled. An intra-state document then computes zero while still showing the slab name.',
      'Fill all four rate fields on Masters > Tax Master.',
    ],
    related: ['tax-master', 'gstin-tax-split'],
  },
  {
    id: 'location-empty',
    cat: 'Troubleshooting',
    q: 'The Location dropdown is empty',
    k: ['location empty', 'no location', 'location dropdown'],
    a: [
      'There is no Company Location under that business. Switch the top bar to that business and add one at Masters > Company Locations.',
    ],
    related: ['company-locations'],
  },
  {
    id: 'conflict-409',
    cat: 'Troubleshooting',
    q: 'I get a 409 error when editing or deleting',
    k: ['409', 'conflict', 'cannot delete', 'cannot edit', 'already claimed', 'locked document'],
    a: [
      'A 409 means the document has been consumed downstream and its lines were copied. Editing it would put the two documents out of step.',
      'Delete the downstream document first - that always releases what it claimed - then edit.',
      'A 409 saying "refresh and try again" is different: two people acted at the same moment, and the loser was rolled back. Refresh and repeat.',
    ],
    related: ['ic-guards', 'stock-transfer-rules'],
  },
  {
    id: 'transfer-locked',
    cat: 'Troubleshooting',
    q: 'A packet has a green tick and no Edit or Delete buttons',
    k: ['green tick', 'packet locked', 'no edit button', 'is location created'],
    a: [
      'A Stock Transfer Location has claimed that packet. The View dialog shows it as "Is Location Created: Yes".',
      'The API would refuse both actions, so the buttons are not rendered rather than failing when pressed. Delete the Stock Transfer Location to release it.',
    ],
    related: ['stock-transfer-flow', 'conflict-409'],
  },
  {
    id: 'no-active-setting',
    cat: 'Troubleshooting',
    q: '"No active Barcode Setting covers today\'s date"',
    k: ['no active barcode setting', 'cannot generate barcode', 'barcode setting expired'],
    a: [
      'Barcode generation reads the setting whose Effective and Expiry dates bracket today, for the current business and financial year.',
      'Add or edit a period at Masters > Barcode Settings so its window covers today.',
    ],
    related: ['barcode-settings', 'barcode-generation'],
  },

  /* ------------------------------------------------- Limits & known gaps */
  {
    id: 'no-stock-ledger',
    cat: 'Limits & known gaps',
    q: 'Is the stock figure accurate?',
    k: ['stock accurate', 'max qty', 'stock ledger', 'available quantity', 'balance', 'stock wrong'],
    a: [
      'Treat it as advisory. There is no stock ledger in this project - no model holds a running balance.',
      'The "(Max: n)" hint counts barcode rows received through GRCs, minus what open documents already commit. It does not subtract POS sales, sales invoices, stock adjustments or GRTs, so it reads high for anything that has moved through the sell side.',
      'It is also scoped by business, not location - barcode rows store location as a plain string that is often blank, so filtering on it would hide real stock.',
    ],
    note: 'Going over Max QTY turns the box red and warns, but does not block.',
    related: ['no-grc-item', 'stock-adjustment'],
  },
  {
    id: 'no-posting-engine',
    cat: 'Limits & known gaps',
    q: 'Can I treat Ledger Transactions as books of account?',
    k: ['audit trail', 'books', 'accounting', 'trial balance', 'opening balance ledger', 'double entry'],
    a: [
      'Not yet. Every entry is computed at read time from the document that caused it, because nothing writes journal entries.',
      'Three consequences: editing a source document silently rewrites its ledger line; deleting a document deletes its history; and there are no opening balances, running balance or trial balance.',
      'Entries are also single-sided - one line against the party, with no matching side posted to a sales, purchase or GST ledger.',
    ],
    related: ['ledger-transaction'],
  },
  {
    id: 'ledger-name-ac',
    cat: 'Limits & known gaps',
    q: 'Why does Ledger Name read "<Party> A/C"?',
    k: ['a/c', 'ledger name', 'party a/c', 'unmapped ledger'],
    a: [
      'That is the fallback for a party with no Payment Ledger mapped, which is most of them. Map one on the contact\'s Financial Details tab and the real ledger name replaces it everywhere, old rows included.',
    ],
    related: ['payment-ledger', 'ledger-transaction'],
  },
  {
    id: 'tenant-scope',
    cat: 'Limits & known gaps',
    q: 'How is tenant data isolated?',
    k: ['tenant', 'security', 'isolation', 'permission', 'access control', 'roles'],
    a: [
      'Weakly, and this is the largest known gap. Every route takes the business id from the request body rather than binding it to the session, so a signed-in user can read another branch\'s records by passing a different id.',
      'Role and permission enforcement is not implemented either - the session carries a role, but nothing checks it.',
      'Worth closing before this goes anywhere near production.',
    ],
    related: ['top-bar-scope'],
  },
  {
    id: 'numbering-race',
    cat: 'Limits & known gaps',
    q: 'Can two documents get the same number?',
    k: ['duplicate number', 'race', 'concurrent', 'same number', 'collision'],
    a: [
      'In theory yes. Numbers are derived by reading the highest issued so far and adding one, which is not atomic against a simultaneous insert.',
      'Closing it needs a unique index on the number field or a counter collection.',
    ],
    note: 'The read deliberately takes the maximum rather than a count, so deleting a document can never make the next one collide with a live number.',
    related: ['doc-setup'],
  },
];

/* ---------------------------------------------------------------- matching */

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did',
  'i', 'my', 'me', 'we', 'you', 'your', 'it', 'its', 'to', 'of', 'in', 'on', 'at',
  'for', 'from', 'by', 'with', 'and', 'or', 'but', 'if', 'how', 'what', 'why',
  'when', 'where', 'which', 'who', 'can', 'cannot', 'cant', 'could', 'should',
  'would', 'will', 'shall', 'this', 'that', 'these', 'those', 'there', 'here',
  'get', 'got', 'have', 'has', 'had', 'not', 'no', 'yes', 'please', 'help',
  'am', 'as', 'so', 'up', 'out', 'about', 'into', 'then', 'than', 'want', 'need',
  'today', 'now', 'just', 'some', 'any', 'all', 'show', 'tell',
]);

/* Crude singulariser - drop a trailing 's' unless the word ends 'ss'. It is
   applied to the index and the query alike, so it only has to be consistent,
   not linguistically right: 'boxes' becoming 'boxe' matches fine, while
   'business' and 'address' are left alone. Without it, "how do barcodes work"
   missed every barcode topic. */
function stem(t) {
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/* Token sets are built once per topic and cached - the matcher runs on every
   keystroke-free submit, but there is no reason to redo this work each time. */
const INDEX = TOPICS.map((t) => ({
  topic: t,
  phrases: t.k.filter((kw) => kw.includes(' ')),
  keyTokens: new Set(t.k.flatMap(tokenize)),
  titleTokens: new Set(tokenize(t.q)),
  bodyTokens: new Set(
    tokenize([...(t.a || []), ...(t.steps || []), t.note || ''].join(' '))
  ),
}));

/* A keyword hit is worth much more than a body hit, and a multi-word phrase
   present verbatim in the question outranks both - that is what stops
   'stock transfer' from being answered by every topic mentioning stock. */
function score(entry, raw, tokens) {
  let s = 0;
  for (const p of entry.phrases) if (raw.includes(p)) s += 14;
  for (const tok of tokens) {
    if (entry.keyTokens.has(tok)) s += 5;
    else if (entry.titleTokens.has(tok)) s += 3;
    else if (entry.bodyTokens.has(tok)) s += 1;
  }
  return s;
}

/* Below this, a match is a coincidence rather than an answer - the caller
   should offer suggestions instead of pretending to know. */
export const CONFIDENT = 5;

/* And below THIS it is not even worth suggesting. A single body-token hit is
   noise: "what is the weather today" scored 1 against three barcode topics
   purely on the word 'today', and offering those reads as nonsense. */
const WORTH_SUGGESTING = 4;

export function search(query, limit = 4) {
  const raw = String(query || '').toLowerCase().trim();
  const tokens = tokenize(raw);
  if (!tokens.length) return [];
  return INDEX
    .map((e) => ({ topic: e.topic, score: score(e, raw, tokens) }))
    .filter((r) => r.score >= WORTH_SUGGESTING)
    .sort((a, b) => b.score - a.score || a.topic.q.length - b.topic.q.length)
    .slice(0, limit);
}

export function getTopic(id) {
  return TOPICS.find((t) => t.id === id) || null;
}

export function categories() {
  const seen = new Map();
  for (const t of TOPICS) {
    if (!seen.has(t.cat)) seen.set(t.cat, []);
    seen.get(t.cat).push(t);
  }
  return CATEGORY_ORDER
    .filter((c) => seen.has(c))
    .map((c) => ({ name: c, topics: seen.get(c) }));
}

/* Shown as chips when the panel first opens. */
export const OPENERS = [
  'top-bar-scope',
  'barcode-generation',
  'doc-setup',
  'empty-list',
];
