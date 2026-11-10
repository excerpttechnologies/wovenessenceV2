'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuEye, LuMegaphone, LuPencil, LuPlus, LuRefreshCw, LuShieldCheck, LuTrash2,
} from 'react-icons/lu';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import { useScope } from '@/components/ScopeContext';
import ReleaseDetail, {
  ENTRY_GROUPS, formatReleaseDate,
} from '@/components/releases/ReleaseDetail';

/* ==========================================================================
   Masters -> Release Notes.

   The only screen that writes the release collection. The dashboard reads
   published rows; this screen reads drafts as well, because a release is
   written here before it is announced.

   ADMIN ONLY. The rail hides the entry from every other role, the permission
   matrix leaves it out, and /api/releases answers a non-administrator with
   published rows only. The server is the lock; this page's access card is the
   explanation.

   ENTRY FORMAT. Each category is a textarea, one change per line. A line may
   be written as "Module: change" to group it under that part of the ERP; a
   line without a module falls under General. The server validates and
   de-duplicates the same way, so what the preview shows is what was stored.
   ========================================================================== */

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    version: '',
    title: '',
    description: '',
    releaseDate: today(),
    status: 'published',
    isLatest: false,
    features: '',
    fixes: '',
    security: '',
    improvements: '',
  };
}

function entriesToText(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const module = String(entry?.module || 'General').trim() || 'General';
      const text = String(entry?.text || '').trim();
      return text ? module + ': ' + text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function textToEntries(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon > 0) {
        return {
          module: line.slice(0, colon).trim() || 'General',
          text: line.slice(colon + 1).trim(),
        };
      }
      return { module: 'General', text: line };
    })
    .filter((entry) => entry.text);
}

function formFromRelease(release) {
  return {
    version: release.version || '',
    title: release.title || '',
    description: release.description || '',
    releaseDate: String(release.releaseDate || '').slice(0, 10) || today(),
    status: release.status === 'draft' ? 'draft' : 'published',
    isLatest: Boolean(release.isLatest),
    features: entriesToText(release.features),
    fixes: entriesToText(release.fixes),
    security: entriesToText(release.security),
    improvements: entriesToText(release.improvements),
  };
}

export default function ReleaseNotesPage() {
  const { user, userReady } = useScope();

  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    fetch('/api/releases?includeDrafts=1&limit=100', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Release notes could not be loaded.');
        }
        return payload;
      })
      .then((payload) => {
        if (!cancelled) setReleases(Array.isArray(payload.releases) ? payload.releases : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Release notes could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isAdmin, tick]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setFieldErrors({});
    setFormOpen(true);
  };

  const openEdit = (release) => {
    setEditing(release);
    setForm(formFromRelease(release));
    setFormError('');
    setFieldErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
  };

  const change = (key) => (event) => {
    const value = event.target.type === 'checkbox'
      ? event.target.checked
      : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    if (saving) return;

    setSaving(true);
    setFormError('');
    setFieldErrors({});

    const payload = {
      version: form.version,
      title: form.title,
      description: form.description,
      releaseDate: form.releaseDate,
      status: form.status,
      isLatest: form.isLatest,
      features: textToEntries(form.features),
      fixes: textToEntries(form.fixes),
      security: textToEntries(form.security),
      improvements: textToEntries(form.improvements),
    };

    try {
      const response = await fetch(
        editing ? '/api/releases/' + editing.id : '/api/releases',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(data.error || 'The release could not be saved.');
        setFieldErrors(data.errors || {});
        return;
      }

      setFormOpen(false);
      load();
    } catch {
      setFormError('The release could not be saved. Check your connection and retry.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');

    try {
      const response = await fetch('/api/releases/' + deleting.id, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(data.error || 'The release could not be deleted.');
        return;
      }
      setDeleting(null);
      load();
    } catch {
      setDeleteError('The release could not be deleted. Check your connection and retry.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const published = useMemo(
    () => releases.filter((release) => release.status === 'published').length,
    [releases]
  );

  const latest = useMemo(
    () => releases.find((release) => release.isLatest) || null,
    [releases]
  );

  if (!userReady) {
    return (
      <div className="card">
        <div className="card-body center-load">
          <span className="spin" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="card-body rel-admin-denied">
          <span className="rel-admin-denied-ico"><LuShieldCheck size={24} strokeWidth={1.8} /></span>
          <h1>Administrators only</h1>
          <p>
            Release notes are published by an administrator. Your role can read the
            latest announcement on the dashboard, but it cannot change what is
            announced.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rel-admin">
      <div className="card">
        <div className="card-head rel-admin-head">
          <span className="card-title">
            <LuMegaphone size={18} strokeWidth={2} />
            Release Notes
          </span>
          <span className="card-sub">
            {published} published · {releases.length - published} draft
            {latest ? ' · latest v' + latest.version : ''}
          </span>
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <LuPlus size={15} strokeWidth={2.2} />
            New release
          </button>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="center-load"><span className="spin" /></div>
          ) : error ? (
            <div className="info-box rel-admin-error">
              <span>{error}</span>
              <button type="button" className="btn" onClick={load}>
                <LuRefreshCw size={14} strokeWidth={2} />
                Retry
              </button>
            </div>
          ) : releases.length === 0 ? (
            <div className="rel-admin-empty">
              <span className="rel-admin-empty-ico"><LuMegaphone size={24} strokeWidth={1.7} /></span>
              <h2>No releases yet</h2>
              <p>
                Publish the first release to show an announcement on the dashboard.
                Until then the dashboard stays as it is, with no placeholder note.
              </p>
              <button type="button" className="btn btn-primary" onClick={openNew}>
                <LuPlus size={15} strokeWidth={2.2} />
                Create the first release
              </button>
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dt rel-admin-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Title</th>
                    <th>Release date</th>
                    <th>Status</th>
                    <th>Changes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {releases.map((release) => (
                    <tr key={release.id}>
                      <td>
                        <span className="rel-admin-version">
                          v{release.version}
                          {release.isLatest && <span className="pill pill-green">Latest</span>}
                        </span>
                      </td>
                      <td>
                        <span className="rel-admin-title">{release.title}</span>
                        {release.description ? (
                          <span className="rel-admin-desc">{release.description}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">{formatReleaseDate(release.releaseDate)}</td>
                      <td>
                        <span className={'pill ' + (release.status === 'draft' ? 'pill-yellow' : 'pill-green')}>
                          {release.status === 'draft' ? 'Draft' : 'Published'}
                        </span>
                      </td>
                      <td>
                        <span className="rel-admin-counts">
                          <span title="Features">F {release.counts?.features ?? 0}</span>
                          <span title="Fixes">X {release.counts?.fixes ?? 0}</span>
                          <span title="Security">S {release.counts?.security ?? 0}</span>
                          <span title="Improvements">I {release.counts?.improvements ?? 0}</span>
                        </span>
                      </td>
                      <td>
                        <div className="rel-admin-actions">
                          <button
                            type="button"
                            className="act-btn act-blue"
                            title="Preview"
                            aria-label={'Preview release ' + release.version}
                            onClick={() => setPreview(release)}
                          >
                            <LuEye size={14} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="act-btn act-amber"
                            title="Edit"
                            aria-label={'Edit release ' + release.version}
                            onClick={() => openEdit(release)}
                          >
                            <LuPencil size={14} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="act-btn act-red"
                            title="Delete"
                            aria-label={'Delete release ' + release.version}
                            onClick={() => {
                              setDeleteError('');
                              setDeleting(release);
                            }}
                          >
                            <LuTrash2 size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit release v' + editing.version : 'New release'}
        size="lg"
        footer={(
          <>
            <button type="button" className="btn" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save release'}
            </button>
          </>
        )}
      >
        <form className="rel-admin-form" onSubmit={submit}>
          {formError ? <div className="info-box rel-admin-error">{formError}</div> : null}

          <div className="form-grid">
            <div className="f-field">
              <label className="f-label" htmlFor="rel-version">
                Version <span className="f-req">*</span>
              </label>
              <input
                id="rel-version"
                className="f-input"
                value={form.version}
                onChange={change('version')}
                placeholder="1.0.0"
                required
              />
              {fieldErrors.version ? <p className="f-err">{fieldErrors.version}</p> : null}
            </div>

            <div className="f-field">
              <label className="f-label" htmlFor="rel-date">Release date</label>
              <input
                id="rel-date"
                type="date"
                className="f-input"
                value={form.releaseDate}
                onChange={change('releaseDate')}
              />
              {fieldErrors.releaseDate ? <p className="f-err">{fieldErrors.releaseDate}</p> : null}
            </div>

            <div className="f-field">
              <label className="f-label" htmlFor="rel-status">Status</label>
              <select
                id="rel-status"
                className="f-input"
                value={form.status}
                onChange={change('status')}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="f-field">
            <label className="f-label" htmlFor="rel-title">
              Title <span className="f-req">*</span>
            </label>
            <input
              id="rel-title"
              className="f-input"
              value={form.title}
              onChange={change('title')}
              placeholder="What changed in this release"
              maxLength={240}
              required
            />
            {fieldErrors.title ? <p className="f-err">{fieldErrors.title}</p> : null}
          </div>

          <div className="f-field">
            <label className="f-label" htmlFor="rel-description">Description</label>
            <textarea
              id="rel-description"
              className="f-input f-textarea"
              rows={3}
              value={form.description}
              onChange={change('description')}
              placeholder="A short summary shown on the dashboard."
              maxLength={2000}
            />
            {fieldErrors.description ? <p className="f-err">{fieldErrors.description}</p> : null}
          </div>

          <label className="rel-admin-check">
            <input
              type="checkbox"
              checked={form.isLatest}
              onChange={change('isLatest')}
              disabled={form.status !== 'published'}
            />
            <span>
              <b>Announce this as the latest release</b>
              <small>
                {form.status === 'published'
                  ? 'The dashboard will show this release. Any other latest flag is cleared.'
                  : 'A draft is never announced. Publish it first.'}
              </small>
            </span>
          </label>

          <div className="rel-admin-entries">
            {ENTRY_GROUPS.map((group) => {
              const Icon = group.icon;
              return (
                <div className="f-field" key={group.key}>
                  <label className={'f-label rel-admin-entry-label rel-tone-' + group.tone} htmlFor={'rel-' + group.key}>
                    <Icon size={14} strokeWidth={2} />
                    {group.label}
                    <span className="f-hint">One change per line. Use Module: change to group it.</span>
                  </label>
                  <textarea
                    id={'rel-' + group.key}
                    className="f-input f-textarea rel-admin-entry"
                    rows={4}
                    value={form[group.key]}
                    onChange={change(group.key)}
                    placeholder={group.key === 'features'
                      ? 'Dashboard: Added a latest-release announcement.'
                      : 'Leave empty when there is nothing to report.'}
                  />
                </div>
              );
            })}
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? 'Release v' + preview.version : 'Release'}
        size="lg"
        footer={(
          <button type="button" className="btn" onClick={() => setPreview(null)}>
            Close
          </button>
        )}
      >
        <ReleaseDetail release={preview} />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this release?"
        recordName={deleting ? 'v' + deleting.version + ' — ' + deleting.title : ''}
        message="The announcement disappears from the dashboard and the version cannot be reused until it is created again."
        confirmLabel="Delete release"
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => { if (!deleteBusy) setDeleting(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
