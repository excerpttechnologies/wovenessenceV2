'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* ==========================================================================
   ACCOUNTING SETTINGS - which account each automatic posting uses.

   Nothing here is a preference in the cosmetic sense: a Purchase GRC debits
   Inventory and credits Accounts Payable, and this screen is where a business
   says WHICH of its accounts those are, per branch. A posting with a role
   left unmapped is refused by the server and the reason is stored on the
   document, so the warning this screen shows is exactly what the posting
   would say.
   ========================================================================== */

const PURCHASE_KEYS = ['inventory', 'accountsPayable'];
const TAX_KEYS = {
  inclusive: [],
  'input-igst': ['inputIgst'],
  'input-cgst-sgst': ['inputCgst', 'inputSgst'],
};
const OTHER_KEYS = [
  'purchase', 'sales', 'accountsReceivable', 'salesReturn',
  'outputCgst', 'outputSgst', 'outputIgst',
  'cash', 'bank', 'retainedEarnings',
];

const MODES = [
  {
    v: 'inclusive',
    l: 'Tax-inclusive stock (default)',
    hint: 'The whole invoice - taxable value plus GST - is debited to Inventory. No tax account is used.',
  },
  {
    v: 'input-igst',
    l: 'Inter-state: Input IGST',
    hint: 'Only the taxable value goes to Inventory; the GST goes to Input IGST; the payable is the full invoice.',
  },
  {
    v: 'input-cgst-sgst',
    l: 'Intra-state: Input CGST + SGST',
    hint: 'The GST is split evenly into Input CGST and Input SGST; the payable is the full invoice.',
  },
];

const accountLabel = (account) => (account.accountCode
  ? account.accountCode + ' - ' + account.accountName
  : account.accountName);

export default function AccountingSettingsView() {
  const scope = useScope();
  const [loading, setLoading] = useState(true);
  const [settingUp, setSettingUp] = useState(false);
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [labels, setLabels] = useState({});
  const [mode, setMode] = useState('inclusive');
  const [mappings, setMappings] = useState({});

  const load = useCallback(async () => {
    if (!scope.business) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        business: scope.business || '',
        location: scope.location || '',
        finYear: scope.finYear || '',
      });
      const r = await fetch('/api/accounting/settings?' + qs, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not load the accounting settings.'); return; }

      const map = {};
      Object.entries(d.settings?.mappings || {}).forEach(([key, value]) => {
        map[key] = value?.accountId || '';
      });
      setMappings(map);
      setMode(d.settings?.gstPostingMode || 'inclusive');
      setAccounts(d.accounts || []);
      setLabels(Object.fromEntries((d.mappingKeys || []).map((k) => [k.key, k.label])));
      setProblems(d.problems || []);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [scope.business, scope.location, scope.finYear]);

  useEffect(() => { load(); }, [load]);

  /* The GST mode decides which tax roles are required, so the markers follow
     the select immediately rather than after a save. */
  const required = useMemo(() => new Set([...PURCHASE_KEYS, ...(TAX_KEYS[mode] || [])]), [mode]);

  const setMapping = (key, value) => setMappings((m) => ({ ...m, [key]: value }));

  async function save() {
    setSaving(true);
    setFlash(null);
    setError('');
    try {
      const r = await fetch('/api/accounting/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            gstPostingMode: mode,
            mappings: Object.fromEntries(
              Object.entries(mappings).map(([key, accountId]) => [key, { accountId: accountId || '' }])
            ),
          },
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 422) {
        setError(Object.values(d.errors || {})[0] || d.error || 'Could not save those mappings.');
        return;
      }
      if (!r.ok) { setError(d.error || 'Could not save those mappings.'); return; }

      const warnings = d.warnings || [];
      setFlash({
        type: warnings.length ? 'err' : 'ok',
        msg: warnings.length
          ? 'Saved, but posting will still be refused: ' + warnings.join(' ')
          : 'Saved. New documents will post to these accounts.',
      });
      await load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const field = (key, { required: isRequired = false } = {}) => (
    <div key={key} className="w-full">
      <label className="mb-[5px] flex items-center gap-1 text-[13px] text-ink">
        {labels[key] || key}
        {isRequired && <span className="f-req">*</span>}
      </label>
      <select
        className="f-input"
        value={mappings[key] || ''}
        onChange={(e) => setMapping(key, e.target.value)}
      >
        <option value="">Not mapped</option>
        {accounts.map((account) => (
          <option key={account._id} value={account._id}>{accountLabel(account)}</option>
        ))}
      </select>
      {isRequired && !mappings[key] && (
        <div className="f-err">Required: postings are refused until this is mapped.</div>
      )}
    </div>
  );

  const activeMode = MODES.find((m) => m.v === mode) || MODES[0];

  /* One press creates the standard chart and fills every empty mapping for
     the branch on the top bar. It never overwrites an account or a mapping
     already in place, so it is safe to press again. */
  async function setup() {
    setSettingUp(true);
    setFlash(null);
    setError('');
    try {
      const r = await fetch('/api/accounting/settings/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { gstPostingMode: mode },
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not set up accounting.'); return; }

      setFlash({
        type: (d.problems || []).length ? 'err' : 'ok',
        msg: (d.createdCount
          ? d.createdCount + ' account' + (d.createdCount === 1 ? '' : 's') + ' created (' + d.created.join(', ') + '). '
          : 'Your chart already has every standard account. ')
          + (d.filled.length ? 'Mapped: ' + d.filled.join(', ') + '. ' : '')
          + ((d.problems || []).length ? 'Still missing: ' + d.problems.join(' ') : 'Posting is ready to use.'),
      });
      await load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSettingUp(false);
    }
  }

  return (
    <div className="card form-card">
      <div className="card-head">
        <span className="card-title">
          <Icon name="gear" size={15} /> Accounting Settings
        </span>
        <span className="flex-1" />
        {scope.business && (
          <button
            type="button"
            className="btn"
            onClick={setup}
            disabled={settingUp}
            title="Create the standard chart of accounts and fill any mapping this branch has not set"
          >
            {settingUp ? <span className="spin" /> : <Icon name="plus" size={14} />} Set up accounting
          </button>
        )}
      </div>
      <div className="card-body">
        {error && <div className="flash flash-err">{error}</div>}
        {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}
        {!scope.business && <div className="flash flash-err">Select a business in the top bar.</div>}
        {loading && <div className="dt-empty"><span className="spin" /></div>}

        {!loading && scope.business && accounts.length === 0 && (
          <div className="flash flash-err mb-4">
            <div className="font-bold">No chart of accounts yet for this business.</div>
            <div className="text-[13px]">
              Until accounts exist there is nothing for a posting to go to, so every GRC will record
              itself as “not set up”. Press <b>Set up accounting</b> above to create the standard
              accounts, or add your own on Chart of Accounts.
            </div>
          </div>
        )}

        {!loading && scope.business && accounts.length > 0 && problems.length > 0 && (
          <div className="flash flash-err mb-4">
            <div className="font-bold">Posting is not ready for this branch yet.</div>
            <ul className="list-disc pl-5 text-[13px]">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
            <div className="text-[13px]">
              Press <b>Set up accounting</b> to create any missing standard account and map it - your
              own accounts and mappings are left as they are.
            </div>
          </div>
        )}

        {!loading && scope.business && (
          <>
            <div className="note-box mb-4">
              These mappings apply to the business and location selected in the top bar.
              A document is only ever posted with accounts from its own branch, and a posting
              with a required role unmapped is refused - it is never guessed.
            </div>

            <div className="form-section">
              <div className="form-section-title">Purchase GRC Posting</div>
              <div className="mb-3 flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="w-full max-w-[360px]">
                  <label className="mb-[5px] block text-[13px] text-ink">GST Treatment</label>
                  <select className="f-input" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div className="max-w-[520px] text-[12.5px] text-inkmuted">{activeMode.hint}</div>
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                {PURCHASE_KEYS.map((key) => field(key, { required: required.has(key) }))}
                {(TAX_KEYS[mode] || []).map((key) => field(key, { required: required.has(key) }))}
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">Other Mappings</div>
              <div className="text-[12.5px] text-inkmuted mb-3">
                Used by the reports (which accounts the GST Ledger and Bank &amp; Cash books read) and
                reserved for future automatic postings. They are optional today.
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                {OTHER_KEYS.map((key) => field(key))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-submit disabled:cursor-not-allowed disabled:opacity-50"
              onClick={save}
              disabled={saving || !scope.business}
            >
              {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save Settings
            </button>
            <span className="ml-2 text-[12.5px] text-inkmuted">
              Required for a GRC posting right now: {[...PURCHASE_KEYS, ...(TAX_KEYS[mode] || [])]
                .map((key) => labels[key] || key).join(', ')}.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
