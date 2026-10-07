
'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Toolbar from './Toolbar';
import Field from './Field';
import ModalForm from './ModalForm';
import TabbedFormView from './TabbedFormView';
import { refreshOptions } from './useOptions';
import { useScope } from './ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';
import { FIELDS, freightBreakdown, bookingDelayDays, delayTone } from '@/app/admin/transport/delivery/fields';
import { FIELDS as TRANSPORTER_FIELDS } from '@/app/admin/transport/transporter/fields';
import { AGENT_QUICK_FIELDS, FIELD_LABELS as SUPPLIER_FIELD_LABELS, TABS as SUPPLIER_TABS } from '@/app/admin/contact/supplier/tabs';
import SupplierImportPanel from './SupplierImportPanel';
import AttachmentsDialog from './AttachmentsDialog';

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

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
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
        onMouseDown={onClose}
      >
        <div
          className="w-full max-w-[560px] rounded-lg bg-white shadow-pop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b border-line px-4 py-3">
            <span className="text-[15px] font-bold">
              {isEdit ? 'Edit' : 'Add'} Delivery / LR Transaction
            </span>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="text-inkmuted">
              <Icon name="x" size={15} />
            </button>
          </div>

          <div className="px-4 py-4">
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
                <Field f={field('document')} value={data.document} error={errors.document} onChange={set} />
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

                {['invPmNumber', 'parcelQty', 'value'].map((k) => (
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
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      </div>
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
  const transporter = labels[String(row.transporterId)] || '';
  const supplier = labels[String(row.supplierId)] || '';

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
              <Line label="Inv / PM Number" value={row.invPmNumber} />
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

          <div className="flex justify-end">
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
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
  /* The delivery whose Upload button was pressed. The ROW is held, not just
     an id, so the dialog captions itself with that consignment's own LR
     number and cannot be open against one record while showing another.
     It lives HERE, in the grid that owns the Action column - DeliveryDialog
     is a different component and could not reach it. */
  const [uploadRow, setUploadRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), search, status,
      business: business || '', location: location || '', finYear: finYear || '',
    });
    if (applied.startDate) qs.set('startDate', applied.startDate);
    if (applied.endDate) qs.set('endDate', applied.endDate);

    try {
      const r = await fetch(ENDPOINT + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], labels: d.labels || {},
        page: d.page || 1, pages: d.pages || 1, total: d.total || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, business, location, finYear, applied, refreshKey]);

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
          {...(onAdd && showAdd ? { onAdd } : {})}
          showAdd={showAdd}
          onExportCsv={() => download(fileBase + '.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
          onExportExcel={() =>
            download(fileBase + '.xls', toXlsHtml(title, exportHeaders(), exportRows()),
              'application/vnd.ms-excel')
          }
          onExportPdf={() => printTable(title, exportHeaders(), exportRows())}
        />

        <div className="mt-3 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                {visible.map((c, i) => <th key={c.t + i}>{c.t}</th>)}
                <th>Action</th>
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
                  {visible.map((c, i) => <td key={c.t + i}>{cell(row, c)}</td>)}
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <button className="act-btn bg-[#2b7fd4]" title="View" onClick={() => onView(row, state.labels)}>
                        <Icon name="eye" size={12} />
                      </button>
                      <button className="act-btn bg-warnyellow" title="Edit" onClick={() => onEdit(row)}>
                        <Icon name="pencil" size={12} />
                      </button>
                      {/* documents and photos attached to THIS consignment */}
                      <button className="act-btn bg-[#0d9488]" title="Upload document / photo" onClick={() => setUploadRow(row)}>
                        <Icon name="upload" size={12} />
                      </button>
                      <button className="act-btn bg-danger" title="Delete" onClick={() => remove(row._id)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center pt-3 text-[13px] text-cell">
          <span>Page <b className="text-brand-link">{state.page}</b> of {state.pages}</span>
          <span className="flex-1" />
          <span className="flex gap-2">
            <button className="btn" disabled={state.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn" disabled={state.page >= state.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
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
