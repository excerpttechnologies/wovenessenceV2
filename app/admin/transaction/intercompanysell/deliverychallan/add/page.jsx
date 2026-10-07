'use client';
import IcChallanForm from '@/components/IcChallanForm';
import { COMPACT_GRID_COLS } from '../fields';

/* Add Inter Company Delivery Challan.
   DC No is issued by the server on save from the Doc Setup master, so it is
   not on this form - it appears readonly on the edit screen. */

export default function AddIcDeliveryChallanPage() {
  return (
    <IcChallanForm
      cfg={{
        title: 'Inter Company Delivery Challans',
        addTitle: 'Inter Company Delivery Challan',
        basePath: '/admin/transaction/intercompanysell/',
        slugPath: 'deliverychallan',
        endpoint: '/api/ic-delivery-challan',
        scope: ['business', 'location', 'finYear'],
        docType: 'Inter Company Delivery Challan',
        /* the three-rule Info panel is hidden on this screen - the rules still
           apply, they are just not printed above every challan */
        showInfo: false,
        /* the printed challan's column set - see COMPACT_GRID_COLS */
        gridCols: COMPACT_GRID_COLS,
        compactGrid: true,
        /* totals panel hidden - still computed and still saved */
        showTotals: false,
        /* Submit lands on the print preview; Print is pressed there */
        afterSaveHref: (savedId) =>
          '/admin/transaction/intercompanysell/deliverychallan/print/' + savedId,
      }}
    />
  );
}
