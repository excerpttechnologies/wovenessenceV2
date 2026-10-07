'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { stamp } from './CashRegisterList';

/* ==========================================================================
   Cash Register Open - /admin/cashregister/open

   Shows the register currently open for the business + location in the top
   bar, and closes it. There is at most one, which is why this screen takes
   no id: it asks the API for "the open one here" rather than being linked to
   a particular record.
   ========================================================================== */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => num(v).toFixed(2);

function Line({ icon, label, value, tone }) {
  return (
    <div className="flex items-center border-b border-line px-4 py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-[13.5px] text-ink">
        <span className="text-inkmuted"><Icon name={icon} size={15} /></span>
        {label}
      </span>
      <span className="flex-1" />
      <span className={'text-[13.5px] font-semibold ' + (tone === 'green' ? 'text-okgreen' : 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

export default function CashRegisterOpenView() {
  const router = useRouter();
  const { business, location, finYear } = useScope();

  const [reg, setReg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [amount, setAmount] = useState('0');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    if (!business || !location) { setLoading(false); setReg(null); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        business, location, finYear: finYear || '', status: 'Open', perPage: '1',
      });
      const r = await fetch('/api/cash-register?' + qs);
      const d = await r.json();
      setReg((d.rows || [])[0] || null);
    } finally {
      setLoading(false);
    }
  }, [business, location, finYear]);

  useEffect(() => { load(); }, [load]);

  async function close() {
    setClosing(true);
    setErr('');
    try {
      const r = await fetch('/api/cash-register/' + reg._id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingBalance: num(amount) }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not close the register.'); return; }
      setDone(d);
      setReg(null);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="mx-auto max-w-[820px]">
      <button
        type="button"
        className="mb-3 inline-flex items-center gap-1.5 rounded bg-[#3c4a63] px-3 py-1.5 text-[13px] text-white hover:bg-[#2f3b50]"
        onClick={() => router.push('/admin/cashregister')}
      >
        <Icon name="back" size={13} /> Back
      </button>

      {loading && (
        <div className="card"><div className="card-body text-center"><span className="spin" /></div></div>
      )}

      {!loading && done && (
        <div className="rounded-lg border border-line bg-white shadow-pop">
          <div className="rounded-t-lg bg-okgreen px-4 py-3 text-[16px] font-bold text-white">
            Register closed
          </div>
          <div>
            <Line icon="register" label="Expected Balance" value={'₹ ' + money(done.expectedBalance)} />
            <Line icon="register" label="Counted (Closing)" value={'₹ ' + money(done.closingBalance)} />
            <Line
              icon="chart"
              label="Difference"
              value={'₹ ' + money(done.differenceBalance)}
              tone={num(done.differenceBalance) === 0 ? 'green' : undefined}
            />
          </div>
          <div className="border-t border-line bg-[#f7f9fc] px-4 py-2.5 text-center text-[13px] text-inkmuted">
            {num(done.differenceBalance) === 0
              ? 'Balanced.'
              : num(done.differenceBalance) > 0
                ? 'Over by ₹ ' + money(Math.abs(num(done.differenceBalance))) + '.'
                : 'Short by ₹ ' + money(Math.abs(num(done.differenceBalance))) + '.'}
          </div>
        </div>
      )}

      {!loading && !done && !reg && (
        <div className="card">
          <div className="card-body text-center text-[13.5px] text-inkmuted">
            {!business || !location
              ? 'Select a business and location in the top bar.'
              : 'No register is open for this location.'}
            <div className="mt-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push('/admin/cashregister')}
              >
                Go to Cash Registers
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && reg && (
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-pop">
          <div className="flex items-center bg-okgreen px-4 py-3 text-white">
            <span className="flex items-center gap-2 text-[17px] font-bold">
              <Icon name="register" size={18} /> Cash Register
            </span>
            <span className="flex-1" />
            <span className="rounded bg-white/20 px-2 py-0.5 text-[11px] font-bold tracking-wide">
              OPEN
            </span>
          </div>

          <Line icon="cal" label="Opening Time" value={stamp(reg.openedAt)} />
          <Line
            icon="register"
            label="Opening Balance"
            value={'₹ ' + money(reg.openingBalance)}
            tone="green"
          />
          {reg.openedBy && <Line icon="users" label="Opened By" value={reg.openedBy} />}

          <div className="px-4 py-3">
            {err && <div className="flash flash-err">{err}</div>}

            {!closing ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded border border-danger px-3 py-1.5 text-[13px] font-semibold text-danger hover:bg-danger hover:text-white"
                  onClick={() => setClosing(true)}
                >
                  <Icon name="voucher" size={14} /> Close Register
                </button>
              </div>
            ) : (
              <div className="rounded border border-line bg-[#f7f9fc] p-3">
                <label className="f-label">Closing Balance (counted)<span className="f-req">*</span></label>
                <input
                  type="number" min="0" autoFocus
                  className="f-input max-w-[240px]"
                  value={amount}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-2 text-[12px] text-inkmuted">
                  The expected balance is worked out on the server from POS taken
                  while this register was open.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn bg-danger text-white" onClick={close}>
                    <Icon name="save" size={14} /> Confirm Close
                  </button>
                  <button type="button" className="btn" onClick={() => { setClosing(false); setErr(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-line bg-[#f7f9fc] px-4 py-2.5 text-center text-[13px] text-inkmuted">
            Register is currently open
          </div>
        </div>
      )}
    </div>
  );
}
