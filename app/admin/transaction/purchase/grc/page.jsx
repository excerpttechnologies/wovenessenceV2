'use client';
import { useState } from 'react';
import ListView from '@/components/ListView';
import { useToast } from '@/components/ToastContext';

/* Goods Receipt Challans - list. Columns declared here, not fetched from a registry. */

export default function TransactionPurchaseGrcListPage() {
  const { showToast } = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel(row) {
    if (cancelling) return;
    
    const confirmMsg = `Cancel GRC ${row.grcNumber || ''}?\n\n` +
      'This will:\n' +
      '- Reverse the stock receipt\n' +
      '- Reverse accounting entries\n' +
      '- Mark the GRC as cancelled\n\n' +
      'This action cannot be undone if the stock has been transferred.';
    
    if (!window.confirm(confirmMsg)) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/purchase-grc/${row._id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'HAS_TRANSFERS') {
          showToast(
            data.error + '\n\n' +
            (data.details || 'Check related stock transfers before cancelling.'),
            'error',
            8000
          );
        } else {
          showToast(data.error || 'Failed to cancel GRC', 'error');
        }
        return;
      }

      showToast(data.message || 'GRC cancelled successfully', 'success');
      setReloadKey(prev => prev + 1);
    } catch (err) {
      showToast('Failed to cancel GRC: ' + err.message, 'error');
    } finally {
      setCancelling(false);
    }
  }

  const CONFIG = {
    title: "Goods Receiptc Challans",
    basePath: '/admin/',
    slugPath: "transaction/purchase/grc",
    endpoint: '/api/purchase-grc',
    pager: 'numbered',
    sortable: true,
    scope: ["business","location","finYear"],
    actionPosition: "right",
    actionVariant: "buttons",
    nowrapHead: true,
    
    /* Action menu with conditional DELETE/CANCEL buttons using show property */
    actionMenu: [
      { label: 'Edit', icon: 'pencil', to: (r) => '/admin/transaction/purchase/grc/' + r._id, need: 'update' },
      { label: 'Barcode Print', icon: 'barcode', to: (r) => '/admin/transaction/purchase/barcode-print/' + r._id },
      { label: 'GRC Print', icon: 'printer', to: (r) => '/admin/transaction/purchase/grc/print/' + r._id },
      /* DELETE button - only for latest GRC */
      { label: 'Delete', icon: 'trash', action: 'delete', need: 'delete', show: (r) => r.isLatest === true },
      /* CANCEL button - only for non-latest GRCs */
      { label: 'Cancel', icon: 'x-circle', need: 'delete', onClick: handleCancel, show: (r) => r.isLatest === false },
    ],
    
    filters: [
      { k: "supplierId", label: "Supplier", type: "ref", ref: "supplier", placeholder: "Select Supplier" },
      { k: "startDate", label: "Start Date", type: "date" },
      { k: "endDate", label: "End Date", type: "date" },
    ],
    
    columns: [
      {
        k: "supplierId",
        t: "Vendor Name",
        value: (r) => r.supplierName,
        f: "text",
        badge: (r) => r.purchaseInvoiceId ? { label: "verified", tone: "verified" } : null,
      },
      { k: "grcNumber", t: "GRC NO" },
      { k: "grcDate", t: "GRC Date", f: "date" },
      { k: "logisticId", t: "Logistic No", f: "ref" },
      { k: "purchaseGroupId", t: "Purchase Group", f: "ref" },
      { k: "occasion", t: "Occasion" },
      { k: "agentId", t: "Agent", f: "ref" },
      { k: "vendorDocNo", t: "Vendor Doc No" },
      { k: "freightMode", t: "Purchase Term" },
      { k: "taxable", t: "Taxable", f: "amount", value: (r) => r.taxable || 0 },
      { k: "totalQuantity", t: "Total Quantity", f: "amount" },
      { k: "gstAmount", t: "GST", f: "amount", value: (r) => r.gstAmount || 0 },
      { k: "netAmount", t: "Net Amount", f: "amount", value: (r) => r.netAmount || 0 },
    ],
  };

  return <ListView cfg={CONFIG} reloadKey={reloadKey} />;
}