/* Sales Analysis Report - spec.

   Three tables on one screen: performance by location, then the top five
   groups and the top five items by net sales.

   All three read the same computed shape - sales less returns, with the
   basket averages derived from bill count - so they differ only in what the
   first column names and how many columns are shown.

   NOTE ON THE DEPLOYED SCREEN: its "Top 5 Item wise" table is headed "Group
   Name", which is a copy-paste from the table above it. This one says "Item
   Name", because that is what the column holds. Same call the Stock Transfer
   view made about the two swapped totals.

   THIS REPORT WILL RETURN NO ROWS until the Sell screens capture line
   quantities and rates and the POS till starts posting - see the note at the
   top of app/api/reports/[slug]/route.js. The aggregation is written against
   the shape the lines should have, so it fills in the moment they do. */

/* the four figures every table shares, after its own first column */
const SHARED = [
  { k: 'netSales', t: 'Net Sales', f: 'amount' },
  { k: 'saleQty', t: 'Sale Quantity', f: 'amount' },
  { k: 'billCount', t: 'Bill Count', num: true },
  { k: 'avgBasketQty', t: 'Average Basket Quantity', f: 'amount' },
  { k: 'avgBasketValue', t: 'Average Basket value', f: 'amount' },
];

export const REPORT = {
  slug: 'sales-analysis',
  title: 'Sales Analysis Report',
  /* three independent tables - paging one of them would be meaningless */
  paginated: false,

  filters: [
    { k: 'location', label: 'Business Location', type: 'ref', ref: 'companylocations', all: 'All Locations' },
    { k: 'fromDate', label: 'From Date', type: 'date', req: true, def: '-1month' },
    { k: 'toDate', label: 'End Date', type: 'date', req: true, def: 'today' },
  ],

  sections: [
    {
      key: 'location',
      title: 'Location wise Performance Report',
      columns: [
        { k: 'label', t: 'Location' },
        { k: 'salesValue', t: 'Sales Value', f: 'amount' },
        { k: 'returnValue', t: 'Return Value', f: 'amount' },
        { k: 'netSales', t: 'Net Sales', f: 'amount' },
        { k: 'saleQty', t: 'Sale Quantity', f: 'amount' },
        { k: 'returnQty', t: 'Return Quantity', f: 'amount' },
        { k: 'netQty', t: 'Net Qty', f: 'amount' },
        { k: 'billCount', t: 'Bill Count', num: true },
        { k: 'avgBasketQty', t: 'Average Basket Quantity', f: 'amount' },
        { k: 'avgBasketValue', t: 'Average Basket value', f: 'amount' },
      ],
    },
    {
      key: 'group',
      title: 'Top 5 Group wise',
      columns: [{ k: 'label', t: 'Group Name' }, ...SHARED],
    },
    {
      key: 'item',
      title: 'Top 5 Item wise',
      columns: [{ k: 'label', t: 'Item Name' }, ...SHARED],
    },
  ],
};
