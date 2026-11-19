
'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Toolbar from './Toolbar';
import Field from './Field';
import ModalForm from './ModalForm';
import TabbedFormView from './TabbedFormView';
import { refreshOptions } from './useOptions';
import { useScope } from './ScopeContext';
import NumberedPager, { SortHeader } from './NumberedPager';
import { fmt, toCsv, toXlsHtml, download, printTable, exportFullData, formatFileSize } from '@/lib/format';
import { FIELDS, freightBreakdown, bookingDelayDays, delayTone } from '@/app/admin/transport/delivery/fields';
import { FIELDS as TRANSPORTER_FIELDS } from '@/app/admin/transport/transporter/fields';
import { AGENT_QUICK_FIELDS, FIELD_LABELS as SUPPLIER_FIELD_LABELS, TABS as SUPPLIER_TABS } from '@/app/admin/contact/supplier/tabs';
import SupplierImportPanel from './SupplierImportPanel';
import AttachmentsDialog from './AttachmentsDialog';
import ImageCropModal from './ImageCropModal';
import DocumentPreviewModal from './DocumentPreviewModal';
import MultiFileUpload, { normalizeFiles } from './MultiFileUpload';

/* The LR-page quick-add does not collect a transporter code. The API still
  requires one, so the dialog supplies an internal value when saving. */
const TRANSPORTER_QUICK_FIELDS = TRANSPORTER_FIELDS.filter((f) => f.k !== 'transporterCode');
const SUPPLIER_TYPES_WITHOUT_FIRST_NAME = /b2b.*inter.*store|vendor\s+(?:of|for)\s+goods/i;

/* ==========================================================================
   Delivery / LR Transactions.

   Three things this screen does that the generic list pattern can't:

     - a Filter card (start / end date) sitting above the list, applied only
       when Search is pressed
     - an Add dialog in three sections whose Total Freight Payable updates as
       you type, with Transaction No issued by the server on save
     - a read-only View dialog showing the freight breakdown

   The freight maths is imported from the page's fields.js, which the API
   also imports - so what you see while typing is what gets stored.
   ========================================================================== */

const ENDPOINT = '/api/delivery';
const money = (n) => '\u20b9 ' + (Number(n) || 0).toFixed(2);

/* "now" as a datetime-local string. Built from the local clock rather than
   toISOString(), which would hand the picker a UTC time. */
function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function localTransactionDate(value) {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: String(value).slice(0, 10), time: '' };
  const p = (n) => String(n).padStart(2, '0');
  const hours = d.getHours();
  const hour12 = hours % 12 || 12;
  return {
    date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()),
    time: hour12 + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + (hours < 12 ? ' am' : ' pm'),
  };
}

function keepTransactionTime(value, date) {
  const current = new Date(value);
  if (Number.isNaN(current.getTime())) return date + 'T00:00:00';
  const p = (n) => String(n).padStart(2, '0');
  return date + 'T' + p(current.getHours()) + ':' + p(current.getMinutes()) + ':' + p(current.getSeconds());
}

const COLUMNS = [
  { k: 'transactionNo', t: 'Transaction No' },
  { k: 'transactionDate', t: 'Date', f: 'datetime' },
  { k: 'transporterId', t: 'Transporter', f: 'ref' },
  { k: 'lrNumber', t: 'LR No' },
  { k: 'bookingDelay', t: 'Booking Delay' },
  { k: 'supplierId', t: 'Supplier', f: 'ref' },
  { k: 'invPmNumber', t: 'Invoice No' },
  { k: 'parcelQty', t: 'Parcel Qty' },
  { k: 'value', t: 'Value', f: 'amount' },
  { k: 'totalFreight', t: 'Freight', f: 'amount' },
  // { k: 'dispatchId', t: 'Dispatch', f: 'ref' },
];

const field = (k) => FIELDS.find((f) => f.k === k);

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="mb-2 border-b border-line pb-1 text-[11.5px] font-bold uppercase tracking-wide text-inkmuted">
        {title}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- ADD/EDIT -- */

const DRAFT_PREFIX = 'groo_delivery_lr_draft';
const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getDraftKey(user, business, location) {
  const u = user?._id || user?.id || user?.username || 'user';
  const b = business || 'default';
  const l = location || 'default';
  return `${DRAFT_PREFIX}_${u}_${b}_${l}`;
}

function DeliveryDialog({ row, onClose, onSaved }) {
  const scope = useScope();
  const isEdit = Boolean(row?._id);

  const [data, setData] = useState(() => {
    const d = {};
    FIELDS.forEach((f) => {
      const v = row?.[f.k];
      d[f.k] = v === undefined || v === null
        ? (f.def === 'now' ? nowLocal()
          : f.def === 'today' ? new Date().toISOString().slice(0, 10)
            : (f.def !== undefined ? f.def : ''))
        /* datetime is handed over raw: Field converts the stored UTC
           timestamp into the local clock the picker expects */
        : (f.type === 'date' ? String(v).slice(0, 10) : (f.type === 'ref' ? String(v) : v));
    });
    return d;
  });
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addingTransporter, setAddingTransporter] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  /* bumped after one is created inline, to refetch that dropdown - useOptions
     keys off the field, so remounting it is what forces the refresh */
  const [transporterNonce, setTransporterNonce] = useState(0);
  const [supplierNonce, setSupplierNonce] = useState(0);
  /* preview of the number this delivery will most likely be given - never
     submitted, see the effect below */
  const [nextNo, setNextNo] = useState('');
  
  /* GRC auto-fetch and image cropping */
  const [availableGrcs, setAvailableGrcs] = useState([]);
  const [loadingGrcs, setLoadingGrcs] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [croppedImageUrl, setCroppedImageUrl] = useState(null);
  const [cropTargetField, setCropTargetField] = useState('document'); // 'document' or 'invoiceCopy'
  const [previewModal, setPreviewModal] = useState({ open: false, url: '', title: '' });

  /* Draft & confirmation states */
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const [hasPendingFile, setHasPendingFile] = useState(false);

  /* Check if form contains non-empty user input */
  const checkIsDirty = useCallback((currentData) => {
    if (!currentData) return false;
    const userFields = [
      'transporterId', 'lrNumber', 'bookingDate', 'supplierId',
      'vendorInvoiceNo', 'vendorInvoiceDate', 'parcelQty', 'value',
      'freightAmount', 'autoCharges', 'tips',
      'vendorWaybill', 'supplierCode', 'vendorGstNo',
    ];
    for (const k of userFields) {
      const v = currentData[k];
      if (v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '0') {
        return true;
      }
    }
    if (normalizeFiles(currentData.document).length > 0) return true;
    if (normalizeFiles(currentData.vendorInvoiceCopy).length > 0) return true;
    if (currentData.gstApplicable === 'Yes') return true;
    if (currentData.transactionNo && !isEdit && currentData.transactionNo.trim() !== '') return true;
    return false;
  }, [isEdit]);

  /* Save draft to browser Local Storage */
  const saveDraftToStorage = useCallback((currentData) => {
    if (isEdit || typeof window === 'undefined') return;
    if (!currentData || !checkIsDirty(currentData)) return;

    try {
      const key = getDraftKey(scope.user, scope.business, scope.location);

      let docToSave = currentData.document || [];
      let hasLocalFileFlag = false;

      if (Array.isArray(docToSave)) {
        docToSave = docToSave.map((f) => {
          if (!f) return null;
          if (typeof f === 'string') {
            if (f.startsWith('data:') && f.length > 400000) {
              hasLocalFileFlag = true;
              return null;
            }
            return f;
          }
          if (typeof f === 'object' && f.url && f.url.startsWith('data:') && f.url.length > 400000) {
            hasLocalFileFlag = true;
            return { ...f, url: '' };
          }
          return f;
        }).filter(Boolean);
      } else if (typeof docToSave === 'string' && docToSave.startsWith('data:') && docToSave.length > 400000) {
        docToSave = '';
        hasLocalFileFlag = true;
      }

      let invoiceCopyToSave = currentData.vendorInvoiceCopy || [];
      if (Array.isArray(invoiceCopyToSave)) {
        invoiceCopyToSave = invoiceCopyToSave.map((f) => {
          if (!f) return null;
          if (typeof f === 'string') return f.startsWith('data:') && f.length > 400000 ? null : f;
          if (typeof f === 'object' && f.url && f.url.startsWith('data:') && f.url.length > 400000) {
            return { ...f, url: '' };
          }
          return f;
        }).filter(Boolean);
      } else if (typeof invoiceCopyToSave === 'string' && invoiceCopyToSave.startsWith('data:') && invoiceCopyToSave.length > 400000) {
        invoiceCopyToSave = '';
      }

      const payload = {
        version: 1,
        savedAt: Date.now(),
        scope: {
          userId: scope.user?._id || scope.user?.id || scope.user?.username || '',
          business: scope.business || '',
          location: scope.location || '',
          finYear: scope.finYear || '',
        },
        data: {
          ...currentData,
          document: docToSave,
          vendorInvoiceCopy: invoiceCopyToSave,
        },
        hasLocalFile: hasLocalFileFlag,
      };

      localStorage.setItem(key, JSON.stringify(payload));
      setDraftStatus('Draft saved');
      setTimeout(() => {
        setDraftStatus((prev) => (prev === 'Draft saved' ? '' : prev));
      }, 3000);
    } catch (err) {
      console.warn('Failed to save draft to localStorage:', err);
      try {
        const key = getDraftKey(scope.user, scope.business, scope.location);
        const fallbackPayload = {
          version: 1,
          savedAt: Date.now(),
          data: { ...currentData, document: [], vendorInvoiceCopy: [] },
          hasLocalFile: true,
        };
        localStorage.setItem(key, JSON.stringify(fallbackPayload));
        setDraftStatus('Draft saved');
      } catch {
        // Storage full
      }
    }
  }, [isEdit, checkIsDirty, scope.user, scope.business, scope.location, scope.finYear]);

  /* Clear draft from Local Storage */
  const clearDraftFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = getDraftKey(scope.user, scope.business, scope.location);
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('Failed to clear draft:', err);
    }
  }, [scope.user, scope.business, scope.location]);

  /* Restore draft automatically on open */
  useEffect(() => {
    if (isEdit || typeof window === 'undefined') return;
    const key = getDraftKey(scope.user, scope.business, scope.location);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.data) return;

      // Expiry check (7 days)
      if (parsed.savedAt && (Date.now() - parsed.savedAt > DRAFT_EXPIRY_MS)) {
        localStorage.removeItem(key);
        return;
      }

      // Check if draft has user values
      if (!checkIsDirty(parsed.data)) return;

      setData((current) => ({
        ...current,
        ...parsed.data,
        transactionDate: parsed.data.transactionDate || current.transactionDate,
      }));

      setIsDirty(true);
      setDraftRestored(true);
      setDraftStatus('Draft restored');
      if (parsed.hasLocalFile) {
        setHasPendingFile(true);
      }
      setTimeout(() => {
        setDraftStatus((prev) => (prev === 'Draft restored' ? '' : prev));
      }, 4000);
    } catch (e) {
      console.warn('Error restoring draft:', e);
    }
  }, [isEdit, checkIsDirty, scope.user, scope.business, scope.location]);

  /* Discard draft and reset to default */
  const handleDiscardDraft = () => {
    clearDraftFromStorage();
    const d = {};
    FIELDS.forEach((f) => {
      const v = row?.[f.k];
      d[f.k] = v === undefined || v === null
        ? (f.def === 'now' ? nowLocal()
          : f.def === 'today' ? new Date().toISOString().slice(0, 10)
            : (f.def !== undefined ? f.def : ''))
        : (f.type === 'date' ? String(v).slice(0, 10) : (f.type === 'ref' ? String(v) : v));
    });
    setData(d);
    setIsDirty(false);
    setDraftRestored(false);
    setHasPendingFile(false);
    setDraftStatus('');
    setFlash({ type: 'ok', msg: 'Draft discarded. Form reset to blank.' });
  };

  /* Close confirmation handlers */
  const handleAttemptClose = useCallback(() => {
    if (isDirty && checkIsDirty(data)) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, checkIsDirty, data, onClose]);

  const handleContinueEditing = () => {
    setShowCloseConfirm(false);
  };

  const handleSaveDraftAndClose = () => {
    saveDraftToStorage(data);
    setShowCloseConfirm(false);
    onClose();
  };

  /* Debounced save whenever user changes a field */
  useEffect(() => {
    if (isEdit || !isDirty) return;
    setDraftStatus('Saving draft...');
    const timer = setTimeout(() => {
      saveDraftToStorage(data);
    }, 800);
    return () => clearTimeout(timer);
  }, [data, isDirty, isEdit, saveDraftToStorage]);

  /* Periodic 1-minute backup auto-save */
  useEffect(() => {
    if (isEdit || !isDirty) return;
    const interval = setInterval(() => {
      saveDraftToStorage(data);
    }, 60000);
    return () => clearInterval(interval);
  }, [data, isDirty, isEdit, saveDraftToStorage]);

  /* Escape key listener to trigger confirmation if dirty */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (addingTransporter || addingSupplier || showCropModal) return;
        e.preventDefault();
        handleAttemptClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addingTransporter, addingSupplier, showCropModal, handleAttemptClose]);

  /* Browser refresh & navigation protection (beforeunload & pagehide) */
  useEffect(() => {
    if (isEdit || !isDirty) return;

    const handleBeforeUnload = (e) => {
      saveDraftToStorage(data);
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const handlePageHide = () => {
      saveDraftToStorage(data);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isEdit, isDirty, data, saveDraftToStorage]);

  /* The next Transaction No, shown only as a hint.

     This used to write the fetched number straight into `data`, and the
     endpoint behind it reserved that number - so merely opening the dialog
     consumed one. Open, cancel, open again and the series had walked
     LR/26/022 -> 023 -> 024 with nothing saved.

     Two things changed. The endpoint is now a pure read (see
     previewSeriesNumber), and what it returns is kept OUT of the form: the
     dialog submits a blank Transaction No and the API reserves the real
     number atomically as part of the save. So this is a display value that
     can go stale between opening the dialog and saving, which is fine -
     nothing downstream depends on it, and typing over it still works as a
     manual override. */
  useEffect(() => {
    if (isEdit) return;
    let live = true;
    const qs = new URLSearchParams({
      nextNumber: '1', business: scope.business || '', location: scope.location || '', finYear: scope.finYear || '',
    });
    fetch(ENDPOINT + '?' + qs, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) setNextNo(d.transactionNo || ''); })
      .catch(() => {});
    return () => { live = false; };
  }, [isEdit, scope.business, scope.location, scope.finYear]);
  
  /* GRC auto-fetch functionality removed - fields can be entered manually */

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    if (!isEdit) setIsDirty(true);
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  
  const handleFileSelect = (e, fieldName = 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isEdit) setIsDirty(true);
    // Check if it's an image
    if (file.type.startsWith('image/')) {
      setSelectedImageFile(file);
      setCropTargetField(fieldName);
      setShowCropModal(true);
    } else {
      // Non-image files go directly
      const reader = new FileReader();
      reader.onload = () => set(fieldName, reader.result);
      reader.readAsDataURL(file);
    }
  };
  
  const handleCroppedImage = (croppedDataUrl) => {
    setCroppedImageUrl(croppedDataUrl);
    set(cropTargetField, croppedDataUrl);
    if (!isEdit) setIsDirty(true);
    setShowCropModal(false);
    setSelectedImageFile(null);
  };

  /* same helper the API uses, so this preview cannot disagree with storage */
  const totals = freightBreakdown(data);

  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch(ENDPOINT + (isEdit ? '/' + row._id : ''), {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          business: scope.business, location: scope.location, finYear: scope.finYear,
        }),
      });
      const d = await r.json();

      if (r.status === 422) {
        setErrors(d.errors || {});
        setFlash({ type: 'err', msg: 'Please correct the highlighted fields.' });
        return;
      }
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Save failed' }); return; }

      /* Successful submission: clear Local Storage draft */
      clearDraftFromStorage();
      setIsDirty(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {addingTransporter && (
        <ModalForm
          cfg={{
            addTitle: 'Add Transporter',
            endpoint: '/api/transporter',
            fields: TRANSPORTER_QUICK_FIELDS,
            modalWide: true,
            prepareData: (data) => ({
              ...data,
              transporterCode: 'AUTO-' + Date.now(),
            }),
          }}
          slug="transporter"
          onClose={() => setAddingTransporter(false)}
          onSaved={() => {
            setAddingTransporter(false);
            refreshOptions('transporter');
            setTransporterNonce((n) => n + 1);
          }}
        />
      )}

      {addingSupplier && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-8">
          {/* No click-outside-to-close here, unlike the small dialogs: this is
              a three-tab form and a stray click on the backdrop would throw
              away everything typed so far. The X is the only way out. */}
          <div className="w-full max-w-[1120px]">
            <div className="flex items-center rounded-t-lg border-b border-line bg-white px-5 py-3">
              <span className="text-[16px] font-bold">Add Supplier</span>
              <span className="flex-1" />
              {/* TabbedFormView only reports back on the LAST tab, but the
                  supplier is created on the first one - so closing early still
                  has to refresh the dropdown, or the record exists and cannot
                  be picked. */}
              <button
                type="button"
                onClick={() => { setAddingSupplier(false); refreshOptions('supplier'); }}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e0342c] text-white"
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            {/* The real supplier form - all three tabs, saving per tab exactly
                as Contacts > Suppliers does. onSaved is what keeps it in a
                dialog: finishing the last tab hands the record back here
                instead of navigating away from the consignment being booked. */}
            <TabbedFormView
              cfg={{
                title: 'Suppliers',
                addTitle: 'Add Suppliers',
                basePath: '/admin/contact/',
                slugPath: 'supplier',
                endpoint: '/api/supplier',
                scope: ['business'],
                contactKind: 'Supplier',
                tabs: SUPPLIER_TABS,
                /* the same GST NO duplicate check as Contacts > Suppliers */
                gstLookup: true,
                /* GST / Excel import panel on the Basic Information tab,
                   identical to the standalone Supplier Add page. applyPatch
                   writes into the form state; nothing reaches the API until
                   the operator hits Submit. */
                renderStepExtras: ({ tab, data, applyPatch }) => (
                  tab.key === 'basic'
                    ? <SupplierImportPanel data={data} labels={SUPPLIER_FIELD_LABELS} onApply={applyPatch} />
                    : null
                ),
                quickAdds: {
                  agentId: {
                    label: 'Add Agent', title: 'Add Agent', slug: 'agent', ref: 'agent',
                    endpoint: '/api/agent', fields: AGENT_QUICK_FIELDS,
                    prepareData: (data) => ({ ...data, openingBalance: 0 }),
                  },
                },
                allowBlankFirstName: true,
                isFieldVisible: (f, data) => f.k !== 'firstName'
                  || !SUPPLIER_TYPES_WITHOUT_FIRST_NAME.test(data._supplierTypeLabel || ''),
                onOptionChange: (f, option) => {
                  if (f.k !== 'typeId') return {};
                  return SUPPLIER_TYPES_WITHOUT_FIRST_NAME.test(option?.label || '')
                    ? { firstName: '' }
                    : {};
                },
              }}
              onSaved={() => {
                setAddingSupplier(false);
                refreshOptions('supplier');
                setSupplierNonce((n) => n + 1);
              }}
            />
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-10"
        onMouseDown={handleAttemptClose}
      >
        <div
          className="w-full max-w-[560px] rounded-lg bg-white shadow-pop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">
                {isEdit ? 'Edit' : 'Add'} Delivery / LR Transaction
              </span>
              {draftStatus && (
                <span className="text-[11.5px] font-normal italic text-inkmuted">
                  &bull; {draftStatus}
                </span>
              )}
            </div>
            <span className="flex-1" />
            <button type="button" onClick={handleAttemptClose} className="text-inkmuted">
              <Icon name="x" size={15} />
            </button>
          </div>

          <div className="px-4 py-4">
            {draftRestored && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2 text-[12.5px] text-amber-900">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>
                    Previous unsaved draft restored.
                    {hasPendingFile && ' (Note: LR Copy must be selected again before saving)'}
                  </span>
                </div>
                <button
                  type="button"
                  className="text-[11.5px] font-semibold text-danger underline hover:text-red-800 shrink-0 ml-2"
                  onClick={handleDiscardDraft}
                >
                  Discard Draft
                </button>
              </div>
            )}
            {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

            <Section title="Transaction Info">
              {/* "Opened At" used to sit here as a read-only clock. It said
                  nothing Transaction Date does not, and Transaction Date is
                  the field that is actually stored - so the clock is gone and
                  Transaction Date opens on today with a calendar picker. */}
              <div className="mb-3">
                <label className="mb-1 block text-[13px] font-semibold">
                  Transaction No <span className="f-req">*</span>
                </label>
                {isEdit ? (
                  /* Edit mode — show the saved number, never regenerate */
                  <input
                    type="text"
                    className="f-input bg-gray-100 font-mono"
                    value={data.transactionNo || ''}
                    readOnly
                    aria-label="Transaction No"
                  />
                ) : (
                  /* Add mode — show the preview number (pure read from server,
                     does NOT consume the sequence). The real number is reserved
                     atomically by the server when Save is clicked.
                     Loading state shows a spinner so the operator knows the
                     fetch is in flight rather than seeing a blank box. */
                  <div className="relative">
                    <input
                      type="text"
                      className="f-input bg-gray-100 font-mono"
                      value={nextNo || ''}
                      readOnly
                      placeholder={nextNo ? '' : 'Fetching next number…'}
                      aria-label="Transaction No — auto-generated on save"
                    />
                    {!nextNo && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        <span className="spin" style={{ width: 14, height: 14 }} />
                      </span>
                    )}
                  </div>
                )}
                {errors.transactionNo && (
                  <div className="mt-1 text-[12px] text-red-600">{errors.transactionNo}</div>
                )}
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-[13px] font-semibold">
                  LR Copy Upload
                </label>
                <MultiFileUpload
                  value={data.document}
                  onChange={(files) => set('document', files)}
                  placeholder="Choose LR Copy (Images / PDFs)"
                  title="LR Copy Preview"
                  accept="image/*,.pdf,application/pdf"
                />
                {errors.document && (
                  <div className="mt-1 text-[12px] text-red-600">{errors.document}</div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="mb-1 block text-[13px] font-semibold">Transaction Date</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      className="f-input"
                      value={localTransactionDate(data.transactionDate).date}
                      onChange={(e) => set('transactionDate', keepTransactionTime(data.transactionDate, e.target.value))}
                    />
                    <input
                      type="text"
                      className="f-input bg-gray-100"
                      value={localTransactionDate(data.transactionDate).time}
                      readOnly
                      aria-label="Transaction time"
                    />
                  </div>
                  {errors.transactionDate && <div className="mt-1 text-[12px] text-red-600">{errors.transactionDate}</div>}
                </div>

                <div>
                  <Field
                    key={'transporter-' + transporterNonce}
                    f={field('transporterId')}
                    value={data.transporterId}
                    error={errors.transporterId}
                    onChange={set}
                  />
                  <button
                    type="button"
                    className="btn btn-primary mt-2"
                    onClick={() => setAddingTransporter(true)}
                  >
                    <Icon name="plus" size={20} /> 
                  </button>
                </div>

                <Field f={field('lrNumber')} value={data.lrNumber} error={errors.lrNumber} onChange={set} />
                <Field f={field('bookingDate')} value={data.bookingDate} error={errors.bookingDate} onChange={set} />
              </div>
            </Section>

            <Section title="Supplier / Parcel Info">
              <div className="grid grid-cols-1 gap-3">
                {/* supplier gets the same inline-add treatment as transporter,
                    so a new vendor does not cost you the half-filled form */}
                <div>
                  <Field
                    key={'supplier-' + supplierNonce}
                    f={field('supplierId')}
                    value={data.supplierId}
                    error={errors.supplierId}
                    onChange={set}
                  />
                  <button
                    type="button"
                    className="btn btn-primary mt-2"
                    onClick={() => setAddingSupplier(true)}
                  >
                    <Icon name="plus" size={20} />
                  </button>
                </div>
                
                {/* Supplier Code - Auto-fetched */}
                {data.supplierCode && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold">
                      Supplier Code
                    </label>
                    <input
                      type="text"
                      className="f-input bg-gray-100"
                      value={data.supplierCode || ''}
                      readOnly
                    />
                  </div>
                )}
                
                {/* Vendor GST Number - Auto-fetched */}
                {data.vendorGstNo && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold">
                      Vendor GST No
                    </label>
                    <input
                      type="text"
                      className="f-input bg-gray-100"
                      value={data.vendorGstNo || ''}
                      readOnly
                    />
                  </div>
                )}
                
                {/* GRC Number - Hidden but can be set programmatically */}
                
                {/* Vendor Invoice Number - Always shown, can be manually entered or auto-filled */}
                {data.supplierId && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold">
                      Vendor Invoice No
                    </label>
                    <input
                      type="text"
                      className="f-input"
                      value={data.vendorInvoiceNo || ''}
                      onChange={(e) => set('vendorInvoiceNo', e.target.value)}
                      placeholder="Enter vendor invoice number"
                    />
                  </div>
                )}
                
                {/* Vendor Invoice Date - Always shown, can be manually entered or auto-filled */}
                {data.supplierId && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold">
                      Vendor Invoice Date
                    </label>
                    <input
                      type="date"
                      className="f-input"
                      value={data.vendorInvoiceDate ? String(data.vendorInvoiceDate).slice(0, 10) : ''}
                      onChange={(e) => set('vendorInvoiceDate', e.target.value)}
                    />
                  </div>
                )}
                
                {/* Vendor Invoice Copy - Show link if from GRC, or allow upload */}
                {data.supplierId && (
                  <div className="mb-3">
                    <label className="mb-1 block text-[13px] font-semibold">
                      Vendor Invoice Copy
                    </label>
                    <MultiFileUpload
                      value={data.vendorInvoiceCopy}
                      onChange={(files) => set('vendorInvoiceCopy', files)}
                      placeholder="Choose Vendor Invoice Copy (Images / PDFs)"
                      title="Vendor Invoice Copy Preview"
                      accept="image/*,.pdf,application/pdf"
                    />
                  </div>
                )}
                
                {/* Vendor Waybill - Show if exists */}
                {data.vendorWaybill && (
                  <div>
                    <label className="mb-1 block text-[13px] font-semibold">
                      Vendor Waybill
                    </label>
                    <input
                      type="text"
                      className="f-input bg-gray-100"
                      value={data.vendorWaybill || ''}
                      readOnly
                    />
                  </div>
                )}

                {['parcelQty', 'value'].map((k) => (
                  <Field key={k} f={field(k)} value={data[k]} error={errors[k]} onChange={set} />
                ))}
              </div>
            </Section>

            <Section title="Freight Details">
              <div className="grid grid-cols-1 gap-3">
                <Field f={field('freightAmount')} value={data.freightAmount} error={errors.freightAmount} onChange={set} />
                <Field f={field('gstApplicable')} value={data.gstApplicable} error={errors.gstApplicable} onChange={set} />

                {data.gstApplicable === 'Yes' && (
                  <>
                    <Field f={field('gstRate')} value={data.gstRate} error={errors.gstRate} onChange={set} />
                    <div className="rounded-md border border-line bg-[#f7fafc] px-3 py-2 text-[13px]">
                      <div className="font-semibold">GST @ {totals.gstRate}%</div>
                      <div className="mt-1 flex gap-5 text-inkmuted">
                        <span>Input CGST: {money(totals.inputCgst)}</span>
                        <span>Input SGST: {money(totals.inputSgst)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center border-y border-line py-2">
                  <span className="text-[13.5px] font-semibold">Total Freight Payable</span>
                  <span className="flex-1" />
                  <span className="text-[13.5px] font-semibold text-brand-link">
                    {money(totals.totalFreight)}
                  </span>
                </div>

                <Field f={field('autoCharges')} value={data.autoCharges} error={errors.autoCharges} onChange={set} />
                <Field f={field('tips')} value={data.tips} error={errors.tips} onChange={set} />
              </div>
            </Section>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={handleAttemptClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {showCropModal && selectedImageFile && (
        <ImageCropModal
          imageFile={selectedImageFile}
          onCrop={handleCroppedImage}
          onCancel={() => {
            setShowCropModal(false);
            setSelectedImageFile(null);
          }}
        />
      )}

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-[460px] rounded-lg bg-white p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold text-gray-900">
                  Unsaved Changes
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">
                  Do you want to close this form? Your entered data will be saved as a draft and can be restored when you reopen it.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                className="btn"
                onClick={handleContinueEditing}
              >
                Continue Editing
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDraftAndClose}
              >
                <Icon name="save" size={14} /> Save Draft &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {previewModal.open && (
        <DocumentPreviewModal
          open={previewModal.open}
          url={previewModal.url}
          title={previewModal.title}
          onClose={() => setPreviewModal({ open: false, url: '', title: '' })}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- VIEW -- */

function Line({ label, value, badge, badgeTone = 'blue', strong }) {
  return (
    <div className={'flex items-center py-1.5 ' + (strong ? 'font-semibold' : '')}>
      <span className="text-[13.5px]">{label}</span>
      <span className="flex-1" />
      <span className="text-[13.5px]">{value}</span>
      {badge && <span className={'pill pill-' + badgeTone + ' ml-2'}>{badge}</span>}
    </div>
  );
}

function ViewDialog({ row, labels, onClose }) {
  const [previewModal, setPreviewModal] = useState({ open: false, url: '', title: '' });
  const transporter = labels[String(row.transporterId)] || '';
  const supplier = labels[String(row.supplierId)] || '';
  const lrFiles = normalizeFiles(row.document);
  const invoiceFiles = normalizeFiles(row.vendorInvoiceCopy);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-12"
      onMouseDown={onClose}
    >
      <div className="w-full max-w-[900px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-5 py-3">
          <span className="text-[16px] font-bold">View Delivery &mdash; {row.transactionNo}</span>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="text-inkmuted"><Icon name="x" size={16} /></button>
        </div>

        <div className="px-5 py-4">
          <Section title="Transaction Info">
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <Line label="Transaction No" value={row.transactionNo} />
              <Line label="Transaction Date" value={fmt('date', row.transactionDate)} />
              <Line label="Transporter" value={transporter} />
              <Line label="LR Number" value={row.lrNumber} />
              <Line label="Booking Date" value={fmt('date', row.bookingDate)} />
            <Line
              label="Dispatch"
              value={labels[String(row.dispatchId)] || 'Not dispatched'}
            />
            </div>
          </Section>

          <Section title="Supplier / Parcel">
            <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
              <Line label="Supplier Name" value={supplier} />
              <Line label="Parcel Qty" value={row.parcelQty ?? ''} />
              <Line label="Value" value={money(row.value)} />
            </div>
          </Section>

          <Section title="Freight Breakdown">
            <Line label="Freight" value={money(row.freightAmount)} badge="INDIRECT EXP" badgeTone="red" />
            <Line label={'Input CGST @ ' + (Number(row.gstRate) || 0) / 2 + '%'} value={money(row.inputCgst)} badge="GST" />
            <Line label={'Input SGST @ ' + (Number(row.gstRate) || 0) / 2 + '%'} value={money(row.inputSgst)} badge="GST" />
            <div className="border-t border-line" />
            <Line label="Total Freight" value={money(row.totalFreight)} badge={transporter} badgeTone="grey" strong />
            <Line label="Auto Charges" value={money(row.autoCharges)} />
            <Line label="Tips" value={money(row.tips)} />
          </Section>

          {(lrFiles.length > 0 || invoiceFiles.length > 0) && (
            <Section title="Attachments">
              <div className="space-y-3">
                {lrFiles.length > 0 && (
                  <div>
                    <span className="text-[12.5px] font-semibold text-slate-700 block mb-1.5">
                      LR Copy Attachments ({lrFiles.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {lrFiles.map((f, i) => (
                        <button
                          key={f._id || i}
                          type="button"
                          onClick={() => setPreviewModal({ open: true, url: f.url, title: f.name || 'LR Copy' })}
                          className="attachment-action flex items-center gap-1.5"
                          title="Click to view"
                        >
                          <Icon name="file" size={12} />
                          <span className="truncate max-w-[200px]">{f.name || `LR Copy ${i + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {invoiceFiles.length > 0 && (
                  <div>
                    <span className="text-[12.5px] font-semibold text-slate-700 block mb-1.5">
                      Vendor Invoice Copy Attachments ({invoiceFiles.length}):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {invoiceFiles.map((f, i) => (
                        <button
                          key={f._id || i}
                          type="button"
                          onClick={() => setPreviewModal({ open: true, url: f.url, title: f.name || 'Invoice Copy' })}
                          className="attachment-action flex items-center gap-1.5"
                          title="Click to view"
                        >
                          <Icon name="file" size={12} />
                          <span className="truncate max-w-[200px]">{f.name || `Invoice Copy ${i + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          <div className="flex justify-end">
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {previewModal.open && (
        <DocumentPreviewModal
          open={previewModal.open}
          url={previewModal.url}
          title={previewModal.title}
          onClose={() => setPreviewModal({ open: false, url: '', title: '' })}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- LIST -- */

/* One grid: its own search, column visibility, exports, paging and fetch.

   Rendered twice - Pending and Completed - so the two lists page and filter
   independently, which is what "pagination for Pending and Completed should
   be independent" requires. The date range is owned by the shared Filter card
   above and passed in, so one Search applies to both. */
function DeliveryGrid({
  status, title, emptyText, applied, business, location, finYear,
  refreshKey, onView, onEdit, onAdd, onChanged, showAdd = true,
}) {
  const [state, setState] = useState({ rows: [], labels: {}, page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (19-10-2026). perPage stays null until picked, so the endpoint's
     own default page size is kept. */
  const [perPage, setPerPage] = useState(null);
  const [sort, setSort] = useState({ key: null, dir: null });
  /* The delivery whose Upload button was pressed. The ROW is held, not just
     an id, so the dialog captions itself with that consignment's own LR
     number and cannot be open against one record while showing another.
     It lives HERE, in the grid that owns the Action column - DeliveryDialog
     is a different component and could not reach it. */
  const [uploadRow, setUploadRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  /* Roles & Permissions (17-10-2026): hide what the server would refuse */
  const { can } = useScope();
  const GR_HREF = '/admin/transport/delivery';
  const mayCreate = can(GR_HREF, 'create');
  const mayUpdate = can(GR_HREF, 'update');
  const mayDelete = can(GR_HREF, 'delete');

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), search, status,
      business: business || '', location: location || '', finYear: finYear || '',
    });
    if (applied.startDate) qs.set('startDate', applied.startDate);
    if (applied.endDate) qs.set('endDate', applied.endDate);
    if (perPage) qs.set('perPage', String(perPage));
    if (sort.key && sort.dir) {
      qs.set('sortBy', sort.key);
      qs.set('sortDir', sort.dir);
    }

    try {
      const r = await fetch(ENDPOINT + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], labels: d.labels || {},
        page: d.page || 1, pages: d.pages || 1, total: d.total || 0,
        perPage: Number(d.perPage) || null,
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, business, location, finYear, applied, refreshKey, perPage, sort]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, business, location, finYear, applied]);

  const visible = COLUMNS.filter((c) => !hidden.includes(c.t));

  const cellText = (row, col) => {
    if (col.k === 'bookingDelay') {
      const d = bookingDelayDays(row);
      return d === null ? '' : d + (d === 1 ? ' day' : ' days');
    }
    if (col.f === 'ref') {
      const label = state.labels[String(row[col.k])] || '';
      /* an unclaimed consignment should read as such, not as a blank cell */
      return label || (col.k === 'dispatchId' ? '—' : '');
    }
    return col.f ? fmt(col.f, row[col.k]) : (row[col.k] ?? '');
  };

  const cell = (row, col) => {
    if (col.k === 'bookingDelay') {
      const d = bookingDelayDays(row);
      if (d === null) return '';
      return <span className={'pill pill-' + delayTone(d)}>{cellText(row, col)}</span>;
    }
    return cellText(row, col);
  };

  const exportRows = () => state.rows.map((r) => visible.map((c) => cellText(r, c)));
  const exportHeaders = () => visible.map((c) => c.t);
  const fileBase = status === 'completed' ? 'completed-goods-received' : 'pending-goods-received';

  function fullExportParams(mode) {
    const params = { status };
    if (business) params.business = business;
    if (location) params.location = location;
    if (finYear) params.finYear = finYear;
    if (mode !== 'all') {
      if (search) params.search = search;
      if (applied.startDate) params.startDate = applied.startDate;
      if (applied.endDate) params.endDate = applied.endDate;
    }
    if (sort.key && sort.dir) {
      params.sortBy = sort.key;
      params.sortDir = sort.dir;
    }
    return params;
  }

  async function runFullExport(mode) {
    if (exporting) return;
    if (!business) {
      setExportMessage({ tone: 'err', text: 'Select a business before exporting.' });
      return;
    }
    setExporting(true);
    setExportMessage(null);
    try {
      const result = await exportFullData({
        endpoint: ENDPOINT,
        params: fullExportParams(mode),
        title,
        fileBase: title,
      });
      const size = formatFileSize(result.bytes);
      setExportMessage({
        tone: result.truncated ? 'warn' : 'ok',
        text: `${result.filename}${size ? ` (${size})` : ''} - ${result.rows.toLocaleString('en-IN')} record${result.rows === 1 ? '' : 's'}.`
          + (result.truncated ? ' The server capped the export; narrow the filter to take the rest.' : ''),
      });
    } catch (e) {
      setExportMessage({ tone: 'err', text: `Could not build the full export - ${e.message || 'the server did not answer.'}` });
    } finally {
      setExporting(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this record?')) return;
    const r = await fetch(ENDPOINT + '/' + id, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      window.alert(d.error || 'Could not delete this record.');
      return;
    }
    onChanged();
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{title}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="card-body">
        <Toolbar
          columns={COLUMNS}
          hidden={hidden}
          onToggleColumn={(t) =>
            setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))
          }
          search={search}
          onSearch={setSearch}
          {...(onAdd && showAdd && mayCreate ? { onAdd } : {})}
          showAdd={showAdd && mayCreate}
          onExportCsv={() => download(fileBase + '.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
          onExportExcel={() =>
            download(fileBase + '.xls', toXlsHtml(title, exportHeaders(), exportRows()),
              'application/vnd.ms-excel')
          }
          onExportPdf={() => printTable(title, exportHeaders(), exportRows())}
          onExportFull={runFullExport}
          exporting={exporting}
          exportingLabel={`Building the full ${title} export...`}
        />

        {exportMessage && (
          <div className={'mt-2 text-[12.5px] ' + (exportMessage.tone === 'err' ? 'text-danger' : exportMessage.tone === 'warn' ? 'text-[#9a6700]' : 'text-okgreen')}>
            {exportMessage.text}
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr>
                <th>Action</th>
                {visible.map((c, i) => (
                  <SortHeader
                    key={c.t + i}
                    label={c.t}
                    sortKey={c.k}
                    sort={sort}
                    onSort={(next) => { setSort(next); setPage(1); }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={visible.length + 1} className="dt-empty"><span className="spin" /></td></tr>
              )}
              {!loading && state.rows.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="dt-empty">{emptyText}</td></tr>
              )}
              {!loading && state.rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <button className="act-btn act-blue" title="View" onClick={() => onView(row, state.labels)}>
                        <Icon name="eye" size={12} />
                      </button>
                      {mayUpdate && (
                      <button className="act-btn act-amber" title="Edit" onClick={() => onEdit(row)}>
                        <Icon name="pencil" size={12} />
                      </button>
                      )}
                      {/* documents and photos attached to THIS consignment */}
                      {(mayCreate || mayUpdate) && (
                      <button className="act-btn act-teal" title="Upload document / photo" onClick={() => setUploadRow(row)}>
                        <Icon name="upload" size={12} />
                      </button>
                      )}
                      {mayDelete && (
                      <button className="act-btn act-red" title="Delete" onClick={() => remove(row._id)}>
                        <Icon name="trash" size={12} />
                      </button>
                      )}
                    </span>
                  </td>
                  {visible.map((c, i) => <td key={c.t + i}>{cell(row, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <NumberedPager
          page={state.page}
          pages={state.pages}
          total={state.total}
          shown={state.rows.length}
          perPage={perPage || state.perPage || 10}
          onPage={setPage}
          onPerPage={(n) => { setPerPage(n); setPage(1); }}
        />
      </div>

      {/* Upload Document / Photo for ONE consignment. The id is this row's own
          _id, so a file can only be attached to the delivery whose button was
          pressed. Rendered only while a row is selected, so nothing stale
          survives a close. */}
      {uploadRow && (
        <AttachmentsDialog
          open
          kind="delivery"
          id={String(uploadRow._id)}
          title={uploadRow.transactionNo ? 'LR ' + uploadRow.transactionNo : 'this delivery'}
          onClose={() => setUploadRow(null)}
          onUploaded={() => load()}
        />
      )}
    </div>
  );
}

export default function DeliveryView() {
  const { business, location, finYear } = useScope();
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [applied, setApplied] = useState({ startDate: '', endDate: '' });
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [viewLabels, setViewLabels] = useState({});
  /* bumped after a save or delete so BOTH grids refetch - a consignment that
     has just been received has to leave Pending and appear in Completed */
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAll = useCallback(() => setRefreshKey((k) => k + 1), []);

  const shared = {
    applied, business, location, finYear, refreshKey,
    onView: (row, labels) => { setViewing(row); setViewLabels(labels); },
    onEdit: (row) => setEditing(row),
    onChanged: refreshAll,
  };

  return (
    <>
      {editing && (
        <DeliveryDialog
          row={editing === true ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refreshAll(); }}
        />
      )}

      {viewing && <ViewDialog row={viewing} labels={viewLabels} onClose={() => setViewing(null)} />}

      {/* Filter card - shared, so one date range applies to both grids */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Filter</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 items-end gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="f-label">Start Date</label>
              <input
                type="date" className="f-input" value={range.startDate}
                onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="f-label">End Date</label>
              <input
                type="date" className="f-input" value={range.endDate}
                onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary h-9 justify-center"
              onClick={() => setApplied(range)}
            >
              <Icon name="search" size={14} /> Search
            </button>
          </div>
        </div>
      </div>

      {/* Add lives on Pending only: a newly created LR has no GRC yet, so it
          can only ever land in this grid. */}
      <DeliveryGrid
        {...shared}
        status="pending"
        title="Pending Goods Received"
        emptyText="No pending goods received records found."
        onAdd={() => setEditing(true)}
      />

      <div className="mt-4">
        <DeliveryGrid
          {...shared}
          status="completed"
          title="Completed Goods Received"
          emptyText="No completed goods received records found."
          showAdd={false}
        />
      </div>
    </>
  );
}
