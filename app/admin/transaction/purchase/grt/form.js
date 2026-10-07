/* GRT entry only needs a vendor. Vendor barcode rows are selected in the
   vendor-items card rendered by TransactionFormView. */

export const FORM = {
  title: 'Add GRT',
  cards: [
    {
      type: 'fields',
      fields: [
        {
          k: 'supplierId',
          label: 'Vendor Name',
          type: 'ref',
          ref: 'supplier',
          req: true,
          placeholder: 'Select Vendor',
        },
      ],
    },
    { type: 'vendorItems', title: 'Vendor Items' },
  ],
};
