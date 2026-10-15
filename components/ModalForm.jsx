'use client';
import { useState, useEffect } from 'react';
import Icon from './Icon';
import Field from './Field';
import { useScope } from './ScopeContext';
import { refreshOptions } from './useOptions';

/* ADD-as-dialog, over the dimmed list, with the red circular close button.
   Used by Contact Types, the five Inventory masters and Logistic. */

export default function ModalForm({ cfg, slug, onClose, onSaved, recordId = null }) {
  const scope = useScope();
  const slugPath = cfg.slugPath || slug;

  const [data, setData] = useState(() => {
    const d = {};
    (cfg.fields || []).forEach((f) => { d[f.k] = f.def !== undefined ? f.def : ''; });
    return d;
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!recordId);
  const [quickAddField, setQuickAddField] = useState(null);
  const quickAdd = quickAddField ? cfg.quickAdds?.[quickAddField] : null;

  // Load existing record for editing
  useEffect(() => {
    if (!recordId) return;
    
    async function loadRecord() {
      setLoading(true);
      setFormError('');
      try {
        const r = await fetch(`${cfg.endpoint}/${recordId}`);
        const result = await r.json().catch(() => ({}));
        if (!r.ok) {
          setFormError(result.error || 'Could not load record.');
          return;
        }
        // Populate form with existing data
        setData(result.doc || result.data || result);
      } catch (err) {
        setFormError(err.message || 'Could not load record.');
      } finally {
        setLoading(false);
      }
    }
    
    loadRecord();
  }, [recordId, cfg.endpoint]);

  const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  async function submit() {
    setSaving(true); setFormError('');
    try {
      const payload = {
        data: cfg.prepareData ? cfg.prepareData(data) : data,
        business: scope.business, location: scope.location, finYear: scope.finYear,
      };
      
      const url = recordId ? `${cfg.endpoint}/${recordId}` : cfg.endpoint;
      const method = recordId ? 'PUT' : 'POST';
      
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 422) { setErrors(d.errors || {}); return; }
      /* Any other failure - a GST number another supplier already holds
         (409 from /api/supplier), a server fault - is shown here rather than
         handed to onSaved as though the record had been written. */
      if (!r.ok) {
        setErrors(d.errors || {});
        setFormError(d.error || 'Save failed. Nothing was saved.');
        return;
      }
      onSaved(d);
    } finally { setSaving(false); }
  }

  return (
    <>
    {quickAdd && (
      <ModalForm
        cfg={{ ...quickAdd, modalNested: true }}
        slug={quickAdd.slug || quickAddField}
        onClose={() => setQuickAddField(null)}
        onSaved={(result) => {
          setQuickAddField(null);
          set(quickAddField, result.id);
          refreshOptions(quickAdd.ref || quickAdd.slug || quickAddField);
        }}
      />
    )}
    <div className={'fixed inset-0 ' + (cfg.modalNested ? 'z-[60]' : 'z-50') + ' flex items-start justify-center bg-black/45 p-4 pt-16'} onMouseDown={onClose}>
      <div
        className={'w-full rounded-lg bg-white shadow-pop ' + (cfg.modalWide ? 'max-w-[960px]' : 'max-w-[420px]')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center border-b border-line px-4 py-3">
          <span className="text-[15px] font-bold">{recordId ? (cfg.editTitle || 'Edit ' + (cfg.title || 'Record')) : cfg.addTitle}</span>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="px-4 py-4">
          {loading && <div className="flash">Loading...</div>}
          {formError && <div className="flash flash-err">{formError}</div>}
          <div className={'grid gap-x-4 gap-y-3 ' + (cfg.modalWide ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2')}>
            {(cfg.fields || []).filter((f) => !cfg.isFieldVisible || cfg.isFieldVisible(f, data)).map((f) => {
              const add = cfg.quickAdds?.[f.k];
              return (
                <div key={f.k} className={(f.span === 'all' && !cfg.modalWide ? 'col-span-2 ' : '') + (add ? 'flex items-end gap-1.5' : '')}>
                  <div className={add ? 'min-w-0 flex-1' : ''}>
                    <Field f={f} value={data[f.k]} error={errors[f.k]} onChange={set} />
                  </div>
                  {add && (
                    <button
                      type="button"
                      title={add.label || 'Add'}
                      aria-label={add.label || 'Add'}
                      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white hover:opacity-90"
                      onClick={() => setQuickAddField(f.k)}
                    >
                      <Icon name="plus" size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="btn btn-primary btn-submit" onClick={submit} disabled={saving || loading}>
            {saving ? <span className="spin" /> : <Icon name="save" size={14} />} {recordId ? 'Update' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
