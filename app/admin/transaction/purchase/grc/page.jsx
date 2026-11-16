'use client';
import { useState } from 'react';
import ListView from '@/components/ListView';
import { useToast } from '@/components/ToastContext';
import GrcCancelModal from '@/components/GrcCancelModal';
import GrcTransferBlockModal from '@/components/GrcTransferBlockModal';

/* Goods Receipt Challans - list. Columns declared here, not fetched from a registry. */

export default function TransactionPurchaseGrcListPage() {
  const { showToast } = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  
  // Modal states
  const [checkingDeps, setCheckingDeps] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedGrc, setSelectedGrc] = useState(null);
  const [blockTransfers, setBlockTransfers] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [modalError, setModalError] = useState('');

  /**
   * Step 1: Check stock transfer dependencies
   * Shows loading indicator while checking
   */
  async function checkAndCancel(row) {
    setSelectedGrc(row);
    setCheckingDeps(true);
    setModalError('');
    
    // Show loading toast
    showToast('Checking stock transfer history...', 'success', 2000);

    try {
      const res = await fetch(`/api/purchase-grc/${row._id}/cancel/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      setCheckingDeps(false);

      if (!res.ok) {
        // Check if blocked due to transfers
        if (data.code === 'HAS_TRANSFERS') {
          // Show block modal with transfer details
          setBlockTransfers(data.transfers || []);
          setShowBlockModal(true);
        } else {
          // Other errors
          showToast(data.error || 'Failed to check dependencies', 'error');
        }
        return;
      }

      // No transfers found - safe to cancel, show confirmation modal
      setShowCancelModal(true);
      
    } catch (err) {
      setCheckingDeps(false);
      showToast('Failed to check stock transfer history: ' + err.message, 'error');
    }
  }

  /**
   * Step 2: Execute cancellation after user confirms
   */
  async function executeCancel() {
    if (!selectedGrc || processing) return;

    setProcessing(true);
    setModalError('');

    try {
      const res = await fetch(`/api/purchase-grc/${selectedGrc._id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        // Show error in modal
        setModalError(data.error || 'Failed to cancel GRC');
        setProcessing(false);
        return;
      }

      // Success
      setProcessing(false);
      setShowCancelModal(false);
      setSelectedGrc(null);
      showToast(data.message || 'GRC cancelled successfully', 'success');
      setReloadKey(prev => prev + 1);
      
    } catch (err) {
      setProcessing(false);
      setModalError('Failed to cancel GRC: ' + err.message);
    }
  }

  /**
   * Close modals and reset state
   */
  function closeCancelModal() {
    if (processing) return;
    setShowCancelModal(false);
    setSelectedGrc(null);
    setModalError('');
  }

  function closeBlockModal() {
    setShowBlockModal(false);
    setSelectedGrc(null);
    setBlockTransfers([]);
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
      { label: 'Cancel', icon: 'x', need: 'delete', onClick: checkAndCancel, show: (r) => r.isLatest !== true },
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

  return (
    <>
      <ListView cfg={CONFIG} reloadKey={reloadKey} />
      
      {/* GRC Cancellation Confirmation Modal */}
      <GrcCancelModal
        open={showCancelModal}
        grc={selectedGrc}
        operation="cancel"
        busy={processing}
        error={modalError}
        onConfirm={executeCancel}
        onCancel={closeCancelModal}
      />
      
      {/* Stock Transfer Block Modal */}
      <GrcTransferBlockModal
        open={showBlockModal}
        grc={selectedGrc}
        transfers={blockTransfers}
        onClose={closeBlockModal}
      />
    </>
  );
}