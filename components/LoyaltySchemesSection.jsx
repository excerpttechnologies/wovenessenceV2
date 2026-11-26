'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import Field from '@/components/Field';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useScope } from '@/components/ScopeContext';
import { SCHEME_FIELDS } from '@/app/admin/setting/loyaltypoint/fields';

/* Multi-scheme management card embedded on /admin/contact/contact-type.
   Reads and writes through /api/loyalty-point (mode=list / mode=create) and
   /api/loyalty-point/[id] (GET / PUT / DELETE). */

function schemeDefaults() {
  const d = {};
  SCHEME_FIELDS.forEach((f) => {
    d[f.k] = f.def !== undefined ? f.def : '';
  });
  return d;
}

function fmtDate(ymd) {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return String(ymd);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function LoyaltySchemesSection() {
  const { business, businessReady, can } = useScope();

  const mayCreate = can
    ? (can('/admin/contact/contact-type', 'create') || can('/admin/setting/loyaltypoint', 'create'))
    : true;
  const mayUpdate = can
    ? (can('/admin/contact/contact-type', 'update') || can('/admin/setting/loyaltypoint', 'update'))
    : true;
  const mayDelete = can
    ? (can('/admin/contact/contact-type', 'delete') || can('/admin/setting/loyaltypoint', 'delete'))
    : true;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Add / Edit modal */
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState(() => schemeDefaults());
  const [formErrors, setFormErrors] = useState({});
  const [formMsg, setFormMsg] = useState('');
  const [saving, setSaving] = useState(false);

  /* View modal */
  const [viewRow, setViewRow] = useState(null);

  /* Delete confirm modal */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    if (!businessReady) return;
    if (!business) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ mode: 'list', business });
      const r = await fetch('/api/loyalty-point?' + qs, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || 'Could not load loyalty schemes.');
        return;
      }
      setRows(d.rows || []);
    } catch {
      setError('Network error — could not load loyalty schemes.');
    } finally {
      setLoading(false);
    }
  }, [business, businessReady]);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditId(null);
    setFormData(schemeDefaults());
    setFormErrors({});
    setFormMsg('');
    setFormOpen(true);
  }

  async function openEdit(row) {
    setEditId(row._id);
    setFormErrors({});
    setFormMsg('');
    setFormData({
      loyaltyPointName: row.loyaltyPointName || '',
      active: row.active || 'Yes',
      loyaltyPointsApplicable: row.loyaltyPointsApplicable || 'Yes',
      pointsToInr: row.pointsToInr ?? 0,
      purchaseAmountForOnePoint: row.purchaseAmountForOnePoint ?? 0,
      pointsExpireAfter: String(row.pointsExpireAfter || '12'),
      otpRequired: row.otpRequired || 'No',
      fromDate: row.fromDate ? String(row.fromDate).slice(0, 10) : '',
      toDate: row.toDate ? String(row.toDate).slice(0, 10) : '',
    });
    setFormOpen(true);
  }

  const setField = (k, v) => {
    setFormData((prev) => ({ ...prev, [k]: v }));
    setFormErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  function validateClient() {
    const errs = {};
    SCHEME_FIELDS.forEach((f) => {
      const val = formData[f.k];
      const empty = val === undefined || val === null || val === '';
      if (f.req && empty) errs[f.k] = f.label + ' is required.';
    });
    if (Number(formData.pointsToInr) < 0) errs.pointsToInr = 'Points to INR cannot be negative.';
    if (Number(formData.purchaseAmountForOnePoint) < 0) {
      errs.purchaseAmountForOnePoint = 'Purchase amount cannot be negative.';
    }
    if (formData.fromDate && formData.toDate && formData.toDate < formData.fromDate) {
      errs.toDate = 'To Date cannot be earlier than From Date.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function saveScheme() {
    if (!validateClient()) {
      setFormMsg('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormMsg('');
    try {
      const isEdit = Boolean(editId);
      const url = isEdit ? `/api/loyalty-point/${editId}` : '/api/loyalty-point';
      const method = isEdit ? 'PUT' : 'POST';
      const payload = isEdit
        ? { business, data: formData }
        : { mode: 'create', business, data: formData };

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 422 && d.errors) {
        setFormErrors(d.errors);
        setFormMsg('Please correct the highlighted fields.');
        return;
      }
      if (!r.ok) {
        setFormMsg(d.error || 'Could not save loyalty scheme.');
        return;
      }
      setFormOpen(false);
      await load();
    } catch {
      setFormMsg('Network error — could not save loyalty scheme.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const r = await fetch(`/api/loyalty-point/${pendingDelete._id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDeleteError(d.error || 'Could not delete this loyalty scheme.');
        return;
      }
      setPendingDelete(null);
      await load();
    } catch {
      setDeleteError('Network error — could not reach the server.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">
            <Icon name="star" size={16} /> Loyalty Point Schemes
          </span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading || !business}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          {mayCreate && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!business}
              onClick={openAdd}
            >
              <Icon name="plus" size={14} /> Add Loyalty Scheme
            </button>
          )}
        </div>

        <div className="card-body">
          <div className="mb-3 text-[12.5px] text-inkmuted">
            Configure multiple Loyalty Point schemes for the selected business. Eligible Contact Types
            (<span className="font-semibold text-okgreen">ENABLED</span>) apply the highest-priority active
            scheme within its validity dates on POS billing (or let the cashier select when multiple overlap).
          </div>

          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Scheme Name</th>
                  <th>Active</th>
                  <th>Loyalty Applicable</th>
                  <th>1 Pt = INR</th>
                  <th>Purchase Amt / 1 Pt</th>
                  <th>From Date</th>
                  <th>To Date</th>
                  <th>Expires After</th>
                  <th>OTP Required</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="dt-empty">
                      <span className="spin" />
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={10} className="dt-empty text-danger">
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && !business && (
                  <tr>
                    <td colSpan={10} className="dt-empty">
                      Select a business to manage loyalty point schemes.
                    </td>
                  </tr>
                )}
                {!loading && !error && business && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="dt-empty">
                      No loyalty point schemes configured yet. Click &ldquo;Add Loyalty Scheme&rdquo; to create one.
                    </td>
                  </tr>
                )}
                {!loading && !error && rows.map((row) => {
                  const isActive = row.active === 'Yes';
                  const isApplicable = row.loyaltyPointsApplicable !== 'No';
                  return (
                    <tr key={row._id}>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            className="act-btn act-blue"
                            title="View Scheme"
                            aria-label="View Scheme"
                            onClick={() => setViewRow(row)}
                          >
                            <Icon name="eye" size={12} />
                          </button>
                          {mayUpdate && (
                            <button
                              type="button"
                              className="act-btn act-amber"
                              title="Edit Scheme"
                              aria-label="Edit Scheme"
                              onClick={() => openEdit(row)}
                            >
                              <Icon name="pencil" size={12} />
                            </button>
                          )}
                          {mayDelete && (
                            <button
                              type="button"
                              className="act-btn act-red"
                              title="Delete Scheme"
                              aria-label="Delete Scheme"
                              onClick={() => {
                                setDeleteError('');
                                setPendingDelete(row);
                              }}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="font-semibold text-ink">{row.loyaltyPointName || '—'}</td>
                      <td>
                        <span className={'pill inline-flex items-center gap-1 ' + (isActive ? 'pill-green' : 'pill-red')}>
                          <Icon name={isActive ? 'checkCircle' : 'x'} size={12} stroke={2.2} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span className={'pill inline-flex items-center gap-1 ' + (isApplicable ? 'pill-green' : 'pill-red')}>
                          <Icon name={isApplicable ? 'checkCircle' : 'x'} size={12} stroke={2.2} />
                          {isApplicable ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td>{row.pointsToInr ?? 0}</td>
                      <td>{row.purchaseAmountForOnePoint ?? 0}</td>
                      <td>{row.fromDate ? fmtDate(row.fromDate) : <span className="text-inkmuted">All Dates</span>}</td>
                      <td>{row.toDate ? fmtDate(row.toDate) : <span className="text-inkmuted">All Dates</span>}</td>
                      <td>{row.pointsExpireAfter ? `${row.pointsExpireAfter} Months` : 'No Expiry'}</td>
                      <td>{row.otpRequired || 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Loyalty Scheme Modal */}
      <Modal
        open={formOpen}
        size="md"
        title={editId ? 'Edit Loyalty Point Scheme' : 'Add Loyalty Point Scheme'}
        onClose={() => !saving && setFormOpen(false)}
        closeOnBackdrop={!saving}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveScheme} disabled={saving}>
              {saving ? <span className="spin" /> : <Icon name="save" size={14} />}
              {editId ? 'Update Scheme' : 'Save Scheme'}
            </button>
          </>
        }
      >
        {formMsg && <div className="flash flash-err mb-3">{formMsg}</div>}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {SCHEME_FIELDS.map((f) => (
            <Field
              key={f.k}
              f={f}
              value={formData[f.k]}
              error={formErrors[f.k]}
              onChange={setField}
            />
          ))}
        </div>
      </Modal>

      {/* View Scheme Details Modal */}
      <Modal
        open={Boolean(viewRow)}
        size="md"
        title="Loyalty Scheme Details"
        onClose={() => setViewRow(null)}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setViewRow(null)}>
            Close
          </button>
        }
      >
        {viewRow && (
          <dl className="rec-grid">
            <div className="rec-row">
              <dt className="rec-k">Scheme Name</dt>
              <dd className="rec-v font-semibold">{viewRow.loyaltyPointName || '—'}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">Active Status</dt>
              <dd className="rec-v">
                <span className={'pill ' + (viewRow.active === 'Yes' ? 'pill-green' : 'pill-red')}>
                  {viewRow.active === 'Yes' ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">Loyalty Applicable</dt>
              <dd className="rec-v">
                <span className={'pill ' + (viewRow.loyaltyPointsApplicable !== 'No' ? 'pill-green' : 'pill-red')}>
                  {viewRow.loyaltyPointsApplicable !== 'No' ? 'YES' : 'NO'}
                </span>
              </dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">Points to INR</dt>
              <dd className="rec-v">1 Point = ₹{viewRow.pointsToInr ?? 0}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">Purchase Amt / 1 Point</dt>
              <dd className="rec-v">₹{viewRow.purchaseAmountForOnePoint ?? 0}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">Points Expire After</dt>
              <dd className="rec-v">{viewRow.pointsExpireAfter ? `${viewRow.pointsExpireAfter} Months` : 'No Expiry'}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">From Date</dt>
              <dd className="rec-v">{viewRow.fromDate ? fmtDate(viewRow.fromDate) : 'All Dates'}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">To Date</dt>
              <dd className="rec-v">{viewRow.toDate ? fmtDate(viewRow.toDate) : 'All Dates'}</dd>
            </div>
            <div className="rec-row">
              <dt className="rec-k">OTP Required</dt>
              <dd className="rec-v">{viewRow.otpRequired || 'No'}</dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Safe Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Loyalty Scheme?"
        recordName={pendingDelete?.loyaltyPointName || 'Unnamed Scheme'}
        message="Deletion is allowed only if no loyalty transactions depend on this scheme."
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError('');
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}
