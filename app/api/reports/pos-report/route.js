// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
// import PosInvoice from '@/models/PosInvoice';
// import CompanyLocation from '@/models/CompanyLocation';
// import { Customer } from '@/lib/contacts';
// import {
//   json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
//   linesOf, lineItemCode, lineItemName, lineQty, lineNet,
// } from '@/lib/reports';

// /* /api/reports/pos-report - read-only.

//    Finalized POS sales, bill by bill or item by item. Both tabs share one set
//    of filters, so the same query serves each and only the shaping differs.

//    The tax columns are split two ways on purpose, matching the deployed
//    report: IGST / CGST / SGST is the whole tax on the bill, and the
//    "(5%)" / "(2.5%)" columns beside them are the part of that tax which came
//    from lines carrying exactly that rate. On a single-slab shop the two are
//    the same figure; on a mixed-slab one they are not.

//    ---------------------------------------------------------------------------
//    THIS RETURNS NOTHING TODAY. PosTill issues only GET requests - nothing in
//    the codebase writes a PosInvoice - so there are no bills to report. Every
//    figure is computed properly against the shape a bill should have, so the
//    report fills in the moment the till starts posting.
//    --------------------------------------------------------------------------- */

// /* the part of a line's tax that came from one exact rate */
// const rateSlice = (lines, key, rate) => r2(lines.reduce((a, l) => {
//   const pct = num(l[key + 'Pct'] ?? l[key.toUpperCase() + ' %']);
//   return pct === rate ? a + num(l[key + 'Amount'] ?? l[key.toUpperCase() + ' Amount']) : a;
// }, 0));

// const taxOf = (lines, key) => r2(lines.reduce(
//   (a, l) => a + num(l[key + 'Amount'] ?? l[key.toUpperCase() + ' Amount']), 0
// ));

// const discountOf = (d, lines) => r2(
//   num(d.discount) || lines.reduce((a, l) => a + num(l.discount ?? l.Discount), 0)
// );

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   await dbConnect();

//   const scope = scopeOf(sp);
//   const { page, perPage } = pageOf(sp);
//   const tab = sp.get('tab') === 'itemwise' ? 'itemwise' : 'billwise';

//   if (!sp.get('fromDate') || !sp.get('toDate')) {
//     return json({ error: 'Date From and Date To are required.' }, 422);
//   }

//   const bills = await PosInvoice.find({
//     ...scopeFilter(scope),
//     ...dateRange(sp, 'date'),
//   }).sort({ date: -1 }).limit(5000).lean();

//   /* PosInvoice carries no salesperson field, so the filter can only narrow to
//      nothing once a bill would actually record one. Left wired so it works the
//      moment the till stores it. */
//   const wantPerson = sp.get('salesPersonId');

//   const locIds = [...new Set(bills.map((b) => b.locationId).filter(Boolean).map(String))];
//   const custIds = [...new Set(bills.map((b) => b.customerId).filter(Boolean).map(String))];

//   const [locs, customers] = await Promise.all([
//     locIds.length
//       ? CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean() : [],
//     custIds.length
//       ? Customer.find({ _id: { $in: custIds } })
//         .select('businessName firstName lastName gstNo billingMobile').lean() : [],
//   ]);
//   const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));
//   const custById = new Map(customers.map((c) => [String(c._id), c]));

//   const nameOf = (c) => (c
//     ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
//     : '');

//   const kept = bills.filter((b) => {
//     if (!wantPerson || !isValidObjectId(wantPerson)) return true;
//     return String(b.salesPersonId || '') === String(wantPerson);
//   });

//   /* ---------------------------------------------------------- tiles ---- */
//   let gross = 0; let discount = 0; let net = 0; let taxable = 0;
//   kept.forEach((b) => {
//     const lines = linesOf(b);
//     const t = r2(num(b.taxableValue) || lines.reduce((a, l) => a + lineNet(l), 0));
//     const d = discountOf(b, lines);
//     const n = r2(b.totalAmount);
//     taxable += t;
//     discount += d;
//     net += n;
//     gross += r2(n + d);
//   });

//   const tiles = {
//     totalBills: kept.length,
//     gross: r2(gross),
//     discount: r2(discount),
//     net: r2(net),
//     taxable: r2(taxable),
//   };

//   /* ------------------------------------------------------- item wise --- */
//   if (tab === 'itemwise') {
//     const rows = kept.flatMap((b) => linesOf(b).map((l, i) => {
//       const lineDiscount = num(l.discount ?? l.Discount);
//       const lineNetValue = lineNet(l);
//       return {
//         _id: String(b._id) + ':' + i,
//         location: locName.get(String(b.locationId)) || '',
//         invoiceNo: b.invoiceNo || '',
//         date: b.date || b.createdAt || null,
//         itemCode: lineItemCode(l),
//         itemName: lineItemName(l),
//         hsn: String(l.hsn ?? l.HSN ?? ''),
//         qty: lineQty(l),
//         rate: num(l.unitRate ?? l['Unit Rate'] ?? l.rsp),
//         discount: r2(lineDiscount),
//         net: r2(lineNetValue),
//         taxable: r2(lineNetValue),
//       };
//     }));

//     const p = paged(rows, page, perPage);
//     const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

//     return json({
//       tiles,
//       sections: [{
//         rows: p.rows,
//         count: p.total,
//         totals: {
//           qty: sum('qty'), discount: sum('discount'),
//           net: sum('net'), taxable: sum('taxable'),
//         },
//       }],
//       total: p.total,
//       pages: p.pages,
//       page,
//       perPage,
//     });
//   }

//   /* ------------------------------------------------------- bill wise --- */
//   const rows = kept.map((b) => {
//     const lines = linesOf(b);
//     const c = custById.get(String(b.customerId));
//     const t = r2(num(b.taxableValue) || lines.reduce((a, l) => a + lineNet(l), 0));
//     const d = discountOf(b, lines);
//     const n = r2(b.totalAmount);

//     return {
//       _id: String(b._id),
//       location: locName.get(String(b.locationId)) || '',
//       invoiceNo: b.invoiceNo || '',
//       date: b.date || b.createdAt || null,
//       /* no salesperson is stored on a POS bill today */
//       salesPerson: b.salesPersonName || '',
//       customerName: nameOf(c) || b.customerName || '',
//       mobile: b.customerContact || c?.billingMobile || '',
//       gstNo: c?.gstNo || '',
//       gross: r2(n + d),
//       discount: d,
//       net: n,
//       taxable: t,
//       igst: taxOf(lines, 'igst'),
//       cgst: taxOf(lines, 'cgst'),
//       sgst: taxOf(lines, 'sgst'),
//       igst5: rateSlice(lines, 'igst', 5),
//       cgst25: rateSlice(lines, 'cgst', 2.5),
//       sgst25: rateSlice(lines, 'sgst', 2.5),
//     };
//   });

//   const p = paged(rows, page, perPage);
//   const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

//   return json({
//     tiles,
//     sections: [{
//       rows: p.rows,
//       count: p.total,
//       totals: {
//         gross: sum('gross'), discount: sum('discount'), net: sum('net'),
//         taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'),
//         igst5: sum('igst5'), cgst25: sum('cgst25'), sgst25: sum('sgst25'),
//       },
//     }],
//     total: p.total,
//     pages: p.pages,
//     page,
//     perPage,
//   });
// }




import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import CompanyLocation from '@/models/CompanyLocation';
import SalesPerson from '@/models/SalesPerson';
import { Customer } from '@/lib/contacts';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
  linesOf, lineItemCode, lineItemName, lineQty,
} from '@/lib/reports';

/* /api/reports/pos-report - read-only.

   Finalized POS sales, bill by bill or item by item. Both tabs share one set
   of filters, so the same query serves each and only the shaping differs.

   The tax columns are split two ways on purpose, matching the deployed
   report: IGST / CGST / SGST is the whole tax on the bill, and the
   "(5%)" / "(2.5%)" columns beside them are the part of that tax which came
   from lines carrying exactly that rate. On a single-slab shop the two are
   the same figure; on a mixed-slab one they are not.

   --------------------------------------------------------------------------- */

const discountOf = (d, lines) => r2(
  num(d.discount) || lines.reduce((a, l) => {
    const stored = l.discountAmount ?? l.discount ?? l.Discount;
    if (stored !== undefined && stored !== null && stored !== '') return a + num(stored);
    const gross = num(l.grossAmount ?? l.gross ?? l.rate ?? l.rsp) * num(l.qty ?? l.Qty ?? l.QTY ?? 1);
    return a + gross * num(l.discountPct) / 100;
  }, 0)
);

const lineAmount = (line) => {
  const stored = line.netAmount ?? line['Net Amount'] ?? line.beforeTax ?? line['Before Tax'];
  const gross = num(line.grossAmount ?? line.gross ?? line.rate ?? line.rsp ?? line.price)
    * num(line.qty ?? line.Qty ?? line.QTY ?? 1);
  const amount = stored !== undefined && stored !== null && stored !== ''
    ? num(stored)
    : gross * (1 - num(line.discountPct) / 100);
  return amount * (line.isReturn ? -1 : 1);
};

const lineDiscount = (line) => {
  const stored = line.discountAmount ?? line.discount ?? line.Discount;
  const amount = stored !== undefined && stored !== null && stored !== ''
    ? num(stored)
    : num(line.grossAmount ?? line.gross ?? line.rate ?? line.rsp)
      * num(line.qty ?? line.Qty ?? line.QTY ?? 1) * num(line.discountPct) / 100;
  return amount * (line.isReturn ? -1 : 1);
};

const lineTaxable = (line) => {
  const stored = line.taxableValue ?? line.taxableAmount ?? line.beforeTax ?? line['Before Tax'];
  if (stored !== undefined && stored !== null && stored !== '') {
    return num(stored) * (line.isReturn ? -1 : 1);
  }
  const amount = lineAmount(line);
  const rate = num(line.gst ?? line.gstPct ?? line.GST);
  return rate > 0 ? amount / (1 + rate / 100) : amount;
};

const lineTax = (line, key) => {
  const stored = line[key + 'Amount'] ?? line[key.toUpperCase() + ' Amount'];
  if (stored !== undefined && stored !== null && stored !== '') {
    return num(stored) * (line.isReturn ? -1 : 1);
  }
  if (key !== 'cgst' && key !== 'sgst') return 0;
  return (lineAmount(line) - lineTaxable(line)) / 2;
};

const lineTaxRate = (line, key) => {
  const stored = line[key + 'Pct'] ?? line[key.toUpperCase() + ' %'];
  if (stored !== undefined && stored !== null && stored !== '') return num(stored);
  if (key !== 'cgst' && key !== 'sgst') return 0;
  return num(line.gst ?? line.gstPct ?? line.GST) / 2;
};

/* The till stores GST-inclusive line totals and a single GST rate. POS
   receipts split that tax evenly into CGST and SGST. */
const rateSlice = (lines, key, rate) => r2(lines.reduce((sum, line) => (
  lineTaxRate(line, key) === rate ? sum + lineTax(line, key) : sum
), 0));

const taxOf = (lines, key) => r2(lines.reduce((sum, line) => sum + lineTax(line, key), 0));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = sp.get('tab') === 'itemwise' ? 'itemwise' : 'billwise';

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const invoiceScope = scopeFilter(scope);
  delete invoiceScope.locationId;
  const filter = {
    ...invoiceScope,
    ...dateRange(sp, 'date'),
  };
  const locationId = sp.get('locationId');
  if (locationId && isValidObjectId(locationId)) filter.locationId = locationId;

  const bills = await PosInvoice.find(filter).sort({ date: -1 }).limit(5000).lean();
  const wantedPerson = sp.get('salesPersonId');
  const personId = wantedPerson && isValidObjectId(wantedPerson) ? wantedPerson : '';
  const linesFor = (bill) => linesOf(bill).filter((line) => (
    !personId || String(line.salesPerson || '') === personId
  ));
  const kept = bills.filter((bill) => !personId || linesFor(bill).length > 0);

  const locIds = [...new Set(kept.map((b) => b.locationId).filter(Boolean).map(String))];
  const custIds = [...new Set(kept.map((b) => b.customerId).filter(Boolean).map(String))];
  const personIds = [...new Set(kept.flatMap((b) => linesFor(b)
    .map((line) => line.salesPerson).filter(isValidObjectId).map(String)))];

  const [locs, customers, people] = await Promise.all([
    locIds.length
      ? CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean() : [],
    custIds.length
      ? Customer.find({ _id: { $in: custIds } })
        .select('businessName firstName lastName gstNo billingMobile').lean() : [],
    personIds.length
      ? SalesPerson.find({ _id: { $in: personIds } }).select('name').lean() : [],
  ]);
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));
  const custById = new Map(customers.map((c) => [String(c._id), c]));
  const personName = new Map(people.map((p) => [String(p._id), p.name || '']));

  const nameOf = (c) => (c
    ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
    : '');

  const billwiseRows = kept.map((b) => {
    const lines = linesFor(b);
    const t = r2(!personId && num(b.taxableValue)
      ? num(b.taxableValue)
      : lines.reduce((a, l) => a + lineTaxable(l), 0));
    const d = personId ? r2(lines.reduce((a, l) => a + lineDiscount(l), 0)) : discountOf(b, lines);
    const n = personId ? r2(lines.reduce((a, l) => a + lineAmount(l), 0)) : r2(b.totalAmount);
    const salesPeople = [...new Set(lines.map((line) => personName.get(String(line.salesPerson || ''))).filter(Boolean))];

    return {
      _id: String(b._id),
      location: locName.get(String(b.locationId)) || '',
      invoiceNo: b.invoiceNo || '',
      date: b.date || b.createdAt || null,
      salesPerson: salesPeople.join(', '),
      customerName: nameOf(custById.get(String(b.customerId))) || b.customerName || '',
      mobile: b.customerContact || custById.get(String(b.customerId))?.billingMobile || '',
      gstNo: custById.get(String(b.customerId))?.gstNo || '',
      gross: r2(n + d),
      discount: d,
      net: n,
      taxable: t,
      igst: taxOf(lines, 'igst'),
      cgst: taxOf(lines, 'cgst'),
      sgst: taxOf(lines, 'sgst'),
      igst5: rateSlice(lines, 'igst', 5),
      cgst25: rateSlice(lines, 'cgst', 2.5),
      sgst25: rateSlice(lines, 'sgst', 2.5),
    };
  });

  const sumBills = (key) => r2(billwiseRows.reduce((sum, bill) => sum + bill[key], 0));
  const tiles = {
    totalBills: billwiseRows.length,
    gross: sumBills('gross'),
    discount: sumBills('discount'),
    net: sumBills('net'),
    taxable: sumBills('taxable'),
  };

  /* ------------------------------------------------------- item wise --- */
  if (tab === 'itemwise') {
    const rows = kept.flatMap((b) => linesFor(b).map((l, i) => {
      const discountValue = lineDiscount(l);
      const lineNetValue = lineAmount(l);
      return {
        _id: String(b._id) + ':' + i,
        location: locName.get(String(b.locationId)) || '',
        invoiceNo: b.invoiceNo || '',
        date: b.date || b.createdAt || null,
        itemCode: lineItemCode(l),
        itemName: lineItemName(l),
        hsn: String(l.hsn ?? l.HSN ?? ''),
        qty: lineQty(l),
        rate: num(l.unitRate ?? l['Unit Rate'] ?? l.rsp ?? l.rate),
        discount: r2(discountValue),
        net: r2(lineNetValue),
        taxable: r2(lineTaxable(l)),
      };
    }));

    const p = paged(rows, page, perPage);
    const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

    return json({
      tiles,
      sections: [{
        rows: p.rows,
        count: p.total,
        totals: {
          qty: sum('qty'), discount: sum('discount'),
          net: sum('net'), taxable: sum('taxable'),
        },
      }],
      total: p.total,
      pages: p.pages,
      page,
      perPage,
    });
  }

  /* ------------------------------------------------------- bill wise --- */
  const p = paged(billwiseRows, page, perPage);
  const sum = (k) => r2(billwiseRows.reduce((a, r) => a + r[k], 0));

  return json({
    tiles,
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        gross: sum('gross'), discount: sum('discount'), net: sum('net'),
        taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'),
        igst5: sum('igst5'), cgst25: sum('cgst25'), sgst25: sum('sgst25'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}

