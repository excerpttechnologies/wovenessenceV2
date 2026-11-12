import { isValidObjectId, Types } from 'mongoose';
import { Customer } from '@/lib/contacts';
import CompanyLocation from '@/models/CompanyLocation';
import PosInvoice from '@/models/PosInvoice';
import SalesInvoice from '@/models/SalesInvoice';

const excludedDocument = {
  $and: [
    { status: { $not: { $regex: '^(cancelled|canceled|draft|deleted)$', $options: 'i' } } },
    { isCancelled: { $ne: true } },
    { isDeleted: { $ne: true } },
    { deletedAt: { $in: [null] } },
  ],
};

const number = (input) => ({ $convert: { input, to: 'double', onError: 0, onNull: 0 } });

const lineValue = (line) => number({
  $ifNull: [
    {
      $ifNull: [
        line + '.netAmount',
        { $ifNull: [line + '.Net Amount', { $ifNull: [line + '.beforeTax', line + '.Before Tax'] }] },
      ],
    },
    {
      $multiply: [
        number({ $ifNull: [line + '.rate', { $ifNull: [line + '.rsp', line + '.Rate'] }] }),
        number(line + '.qty'),
      ],
    },
  ],
});

const lineGst = (line) => number({ $ifNull: [line + '.gst', line + '.GST'] });
const lineTax = (line) => {
  const gross = lineValue(line);
  return {
    $subtract: [
      gross,
      {
        $divide: [
          gross,
          { $add: [1, { $divide: [lineGst(line), 100] }] },
        ],
      },
    ],
  };
};
const lineTaxable = (line) => ({ $subtract: [lineValue(line), lineTax(line)] });

const posTaxable = {
  $reduce: {
    input: { $cond: [{ $isArray: '$items' }, '$items', []] },
    initialValue: 0,
    in: { $add: ['$$value', lineTaxable('$$this')] },
  },
};

const posTax = {
  $reduce: {
    input: { $cond: [{ $isArray: '$items' }, '$items', []] },
    initialValue: 0,
    in: { $add: ['$$value', lineTax('$$this')] },
  },
};

function dateExpression(sp) {
  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to + 'T23:59:59.999');
  return Object.keys(range).length
    ? { $expr: { $and: Object.entries(range).map(([op, date]) => ({ [op]: [{ $ifNull: ['$date', '$createdAt'] }, date] })) } }
    : {};
}

export function reportRequest(sp) {
  const business = sp.get('business');
  const customerId = sp.get('customerId');
  if (!business || !isValidObjectId(business)) {
    return { error: 'A valid company is required.', status: 400 };
  }
  if (!customerId || !isValidObjectId(customerId)) {
    return { error: 'A valid customer is required.', status: 400 };
  }

  const location = sp.get('location');
  if (location && !isValidObjectId(location)) {
    return { error: 'Invalid location filter.', status: 400 };
  }
  const finYear = sp.get('finYear') || '';
  const fromDate = sp.get('fromDate');
  const toDate = sp.get('toDate');
  for (const value of [fromDate, toDate].filter(Boolean)) {
    if (Number.isNaN(Date.parse(value))) return { error: 'Invalid date filter.', status: 400 };
  }

  return {
    businessId: new Types.ObjectId(business),
    customerId: new Types.ObjectId(customerId),
    locationId: location ? new Types.ObjectId(location) : null,
    finYear,
    dateMatch: dateExpression(sp),
  };
}

export async function customerInBusiness(customerId, businessId) {
  return Customer.findOne({ _id: customerId, businessId })
    .select('_id businessName shortName contactId prefix firstName middleName lastName billingMobile billingState gstNo')
    .lean();
}

export function invoiceMatch({ businessId, customerId, locationId, finYear, dateMatch }) {
  return {
    businessId,
    customerId,
    ...(locationId ? { locationId } : {}),
    ...(finYear ? { finYear } : {}),
    ...excludedDocument,
    ...dateMatch,
  };
}

const salesBillStage = (match) => [
  { $match: match },
  {
    $project: {
      source: { $literal: 'sales' },
      _id: 1,
      locationId: 1,
      date: '$createdAt',
      invNo: '$salesInvoiceNo',
      billValue: { $ifNull: ['$netValue', 0] },
      taxableValue: { $ifNull: ['$taxableValue', posTaxable] },
      tax: {
        $subtract: [
          { $ifNull: ['$netValue', 0] },
          { $ifNull: ['$taxableValue', posTaxable] },
        ],
      },
    },
  },
];

const posBillStage = (match) => [
  { $match: match },
  {
    $project: {
      source: { $literal: 'pos' },
      _id: 1,
      locationId: 1,
      date: { $ifNull: ['$date', '$createdAt'] },
      invNo: '$invoiceNo',
      billValue: { $ifNull: ['$totalAmount', 0] },
      taxableValue: posTaxable,
      tax: posTax,
    },
  },
];

export function billPipeline(scope) {
  const match = invoiceMatch(scope);
  return [
    ...salesBillStage(match),
    { $unionWith: { coll: PosInvoice.collection.name, pipeline: posBillStage(match) } },
  ];
}

const itemFields = {
  itemCode: { $ifNull: ['$items.itemCode', { $ifNull: ['$items.code', { $ifNull: ['$items.Item Code', ''] }] }] },
  itemName: { $ifNull: ['$items.itemName', { $ifNull: ['$items.name', { $ifNull: ['$items.Item Name', ''] }] }] },
  qty: number({ $ifNull: ['$items.qty', { $ifNull: ['$items.QTY', '$items.Qty'] }] }),
  rate: number({ $ifNull: ['$items.rate', { $ifNull: ['$items.rsp', '$items.Rate'] }] }),
};

function salesItems(match) {
  return [
    { $match: match },
    {
      $addFields: {
        __items: { $cond: [{ $isArray: '$items' }, '$items', []] },
      },
    },
    {
      $addFields: {
        __itemsSum: {
          $reduce: {
            input: '$__items',
            initialValue: 0,
            in: { $add: ['$$value', lineValue('$$this')] },
          },
        },
        __invoiceTax: {
          $subtract: [
            { $ifNull: ['$netValue', 0] },
            { $ifNull: ['$taxableValue', 0] },
          ],
        },
      },
    },
    { $unwind: { path: '$__items', includeArrayIndex: 'lineIndex' } },
    {
      $addFields: {
        __lineValue: lineValue('$__items'),
        __lineTax: {
          $add: [
            number({ $ifNull: ['$__items.igstAmount', '$__items.IGST Amount'] }),
            number({ $ifNull: ['$__items.cgstAmount', '$__items.CGST Amount'] }),
            number({ $ifNull: ['$__items.sgstAmount', '$__items.SGST Amount'] }),
          ],
        },
      },
    },
    {
      $addFields: {
        __lineTax: {
          $cond: [
            { $gt: ['$__lineTax', 0] },
            '$__lineTax',
            {
              $cond: [
                { $ne: ['$__invoiceTax', 0] },
                {
                  $cond: [
                    { $gt: ['$__itemsSum', 0] },
                    { $multiply: ['$__invoiceTax', { $divide: ['$__lineValue', '$__itemsSum'] }] },
                    0,
                  ],
                },
                lineTax('$__items'),
              ],
            },
          ],
        },
      },
    },
    {
      $project: {
        source: { $literal: 'sales' },
        _id: 1,
        locationId: 1,
        date: '$createdAt',
        invNo: '$salesInvoiceNo',
        ...itemFields,
        lineIndex: 1,
        tax: '$__lineTax',
        amount: '$__lineValue',
        taxableValue: { $subtract: ['$__lineValue', '$__lineTax'] },
      },
    },
  ];
}

function posItems(match) {
  return [
    { $match: match },
    { $unwind: { path: '$items', includeArrayIndex: 'lineIndex' } },
    {
      $addFields: {
        __lineValue: lineValue('$items'),
        __lineTaxable: lineTaxable('$items'),
        __lineTax: lineTax('$items'),
      },
    },
    {
      $project: {
        source: { $literal: 'pos' },
        _id: 1,
        locationId: 1,
        date: { $ifNull: ['$date', '$createdAt'] },
        invNo: '$invoiceNo',
        ...itemFields,
        lineIndex: 1,
        taxableValue: '$__lineTaxable',
        tax: '$__lineTax',
        amount: '$__lineValue',
      },
    },
  ];
}

export function itemPipeline(scope) {
  const match = invoiceMatch(scope);
  return [
    ...salesItems(match),
    { $unionWith: { coll: PosInvoice.collection.name, pipeline: posItems(match) } },
  ];
}

export async function locationNames(rows) {
  const ids = [...new Set(rows.map((row) => String(row.locationId || '')).filter(Boolean))]
    .filter(isValidObjectId)
    .map((id) => new Types.ObjectId(id));
  if (!ids.length) return new Map();
  const locations = await CompanyLocation.find({ _id: { $in: ids } }).select('_id name').lean();
  return new Map(locations.map((location) => [String(location._id), location.name || '']));
}
