'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Field from './Field';
import MultiSelect from './MultiSelect';
import ModalForm from './ModalForm';
import { useScope } from './ScopeContext';
import { refreshOptions, useOptions } from './useOptions';
import { fmt } from '@/lib/format';
import { sourceLabel } from '@/lib/sourceLabel';

/* Renders the Purchase add screens from the registry `form.cards` spec:
   fields | info | scan | source | grid | totals   (see purchaseRegistry.js) */

function InfoBox({ items }) {
  return (
    <div className="info-box">
      <div className="mb-1.5 flex items-center gap-1.5 font-bold underline"><Icon name="eye" size={14} /> Info</div>
      <ol className="list-decimal pl-5">
        {items.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
      </ol>
    </div>
  );
}

function ScanRow({ onFound }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  async function search() {
    if (!code.trim()) return;
    /* resolves against the Item master at /api/item */
    try {
      const r = await fetch('/api/item?perPage=1&search=' + encodeURIComponent(code));
      const d = await r.json();
      const hit = (d.rows || [])[0];
      if (!hit) { setMsg('No item found for "' + code + '"'); return; }
      setMsg('');
      onFound(hit);
      setCode('');
    } catch {
      setMsg('Item master not available yet');
    }
  }

  return (
    <>
      <div className="kbd-hint">
        <Icon name="eye" size={13} /> Shortcut: Press <span className="kbd">Enter</span> /
        <span className="kbd">F9</span> / <span className="kbd">Tab</span>
        to add item &amp; and <b>box must be in focus</b>.
      </div>
      <div className="mb-3 flex">
        <input
          className="f-input rounded-r-none"
          placeholder="Enter item code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (['Enter', 'F9', 'Tab'].includes(e.key)) { e.preventDefault(); search(); } }}
        />
        <button type="button" className="btn btn-dark rounded-l-none" onClick={search}>
          <Icon name="search" size={14} /> Search
        </button>
      </div>
      {msg && <div className="flash flash-err">{msg}</div>}
    </>
  );
}

function SourceSelect({ card, supplierId, value, onChange, onSelect }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const scope = useScope();

  /* A source card that narrows by vendor cannot list anything until one is
     chosen. Saying so is the difference between "pick a vendor first" and
     "this vendor has no transactions" - the screen used to show the same
     empty box for both. */
  const needsSupplier = Boolean(card.withSupplier) && !supplierId;

  useEffect(() => {
    if (needsSupplier) { setOptions([]); setError(''); setLoading(false); return undefined; }

    let off = false;
    setLoading(true);
    setError('');

    const qs = new URLSearchParams({
      perPage: '200', unconverted: card.unconvertedBy || '', availableLr: card.availableLr ? '1' : '',
      business: scope.business || '', location: scope.location || '', finYear: scope.finYear || '',
    });
    if (card.withSupplier && supplierId) qs.set('supplierId', supplierId);

    fetch(card.endpoint + '?' + qs)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Request failed');
        return d;
      })
      .then((d) => {
        if (off) return;
        const mappedOptions = (d.rows || []).map((r) => ({ 
          value: r._id, 
          label: sourceLabel(card, r), 
          row: r 
        }));
        setOptions(mappedOptions);
        
        // Preserve the selected label if value exists
        if (value) {
          const selected = mappedOptions.find((opt) => opt.value === value);
          if (selected) setSelectedLabel(selected.label);
        }
      })
      .catch(() => {
        if (off) return;
        setOptions([]);
        setError('Unable to load transactions. Check your connection and try again.');
      })
      .finally(() => { if (!off) setLoading(false); });

    /* a vendor change mid-flight must not let the old vendor's list land last */
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.endpoint, supplierId, needsSupplier, scope.business, scope.location, scope.finYear]);

  // Add selected value to options if it's not already there
  const displayOptions = value && selectedLabel && !options.find((o) => o.value === value)
    ? [{ value, label: selectedLabel, row: {} }, ...options]
    : options;

  return (
    <div>
      <label className="f-label">{card.label}{card.req && <span className="f-req">*</span>}</label>
      <MultiSelect
        mode={card.multi ? 'multi' : 'single'}
        options={displayOptions}
        loading={loading}
        error={error}
        disabled={needsSupplier}
        emptyText={needsSupplier ? 'Select a vendor first' : 'No open transactions for this vendor'}
        placeholder={needsSupplier ? 'Select a vendor first' : (card.placeholder || 'Select...')}
        value={card.multi ? (value || []) : (value || '')}
        onChange={(next) => {
          onChange(next);
          if (card.multi) {
            onSelect?.(options.filter((option) => next.includes(option.value)).map((option) => option.row));
          } else {
            const selected = options.find((option) => option.value === next);
            if (selected) {
              setSelectedLabel(selected.label);
              onSelect?.(selected.row);
            }
          }
        }}
      />
      {!loading && !error && !needsSupplier && options.length === 0 && (
        <span className="mt-0.5 block text-[11px] text-inkmuted">
          Every LR for this vendor already has a GRC, or none has been raised yet.
        </span>
      )}
    </div>
  );
}



function Grid({ card, rows, onRemove }) {
  const total = rows.reduce((result, row) => {
    ['Return Quantity', 'Before Tax', 'IGST Amount', 'CGST Amount', 'SGST Amount', 'Net Amount'].forEach((key) => {
      result[key] = (result[key] || 0) + (Number(row[key]) || 0);
    });
    return result;
  }, {});
  return (
    <div className="overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            {card.cols.map((c) => <th key={c}>{c}</th>)}
            {card.removable && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={card.cols.length + (card.removable ? 1 : 0)} className="dt-empty">{card.empty}</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i}>
              {card.cols.map((c, ci) => (
                <td key={c}>
                  {/* only a real serial-number column shows the row index;
                      otherwise the first column's own value was being lost */}
                  {ci === 0 && /^(sl\s*no|s\.?\s*no|#)$/i.test(c) ? i + 1 : (r[c] ?? '')}
                </td>
              ))}
              {card.removable && (
                <td>
                  <button className="act-btn bg-danger" onClick={() => onRemove(i)}><Icon name="x" size={12} /></button>
                </td>
              )}
            </tr>
          ))}
          {card.total && rows.length > 0 && (
            <tr className="font-semibold">
              {card.cols.map((c, i) => <td key={c}>{i === 0 ? 'Total' : total[c] === undefined ? '' : Number(total[c]).toFixed(2)}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ScanTabs({ card, tab, setTab, rows, onFound, onRemove }) {
  return (
    <>
      <div className="mb-3 flex gap-1 border-b border-line">
        {card.tabs.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={
              'rounded-t-md px-4 py-2 text-[13.5px] ' +
              (tab === t.k ? 'border border-b-0 border-line bg-white font-bold' : 'text-brand-link')
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <ScanRow onFound={onFound} />
      <Grid card={{ ...card, removable: true }} rows={rows} onRemove={onRemove} />
    </>
  );
}

function Totals({ card, data, onChange }) {
  return (
    <table className="w-full border-collapse text-[13.5px]">
      <tbody>
        {card.rows.map((r) => (
          <tr key={r.label} className="border-b border-line">
            <td className="w-[38%] py-2 pr-3 text-right text-cell">{r.label}</td>
            <td className="w-[22%]" />
            <td className="w-[18%] px-2">
              {r.input && (
                <input
                  type="number"
                  className="f-input h-8 text-center"
                  value={data[r.input] ?? 0}
                  onChange={(e) => onChange(r.input, Number(e.target.value))}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              )}
            </td>
            <td className="w-[4%] text-center text-[#c07b2a]">{r.op || ''}</td>
            <td className="py-2 pr-3 text-right">{Number(data[r.value] || 0).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* The Freight value that means "no freight on this document". Named because
   it is checked in three places - the header lock, the voucher Freight column
   and the total - and a bare "N/A" in each would be three chances to typo. */
const FREIGHT_NONE = 'N/A';

/* Derived columns. They are normally read-only, except when Freight is N/A,
  where the operator may enter the tax and total amounts manually. */
const VOUCHER_COMPUTED = new Set(['taxAmount']);
function VoucherSection({ card, rows, onChange, onAdd, onRemove, rates = {}, freightLocked = false }) {
  const number = (value) => Number(value) || 0;
  /* Summed per column key rather than as a fixed list, so the Total row is
     driven by the same card.fields the header and the body are. The old
     version listed the five figures in a hardcoded order, which meant
     reordering a column silently printed one column's total under another's
     heading. The sums themselves are unchanged - every numeric column, added
     down the rows. */
  const totals = (card.fields || []).reduce((result, field) => {
    if (field.type === 'number') result[field.k] = rows.reduce((sum, row) => sum + number(row[field.k]), 0);
    return result;
  }, {});

  return (
    <div className="card">
      <div className="card-head flex items-center justify-between gap-3">
        <span className="card-title">{card.title || 'Voucher Section'}</span>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
      <div className="card-body overflow-x-auto">
        <table className="dt min-w-[900px]">
          <thead><tr>{card.fields.map((field) => <th key={field.k}>{field.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {card.fields.map((field) => {
                  const computed = VOUCHER_COMPUTED.has(field.k);
                  const manualAmount = freightLocked && computed;
                  /* Freight follows the header: N/A there means no freight
                     anywhere, so the column locks at 0 rather than quietly
                     accepting a number that the totals would then ignore. */
                  const lockedFreight = freightLocked && field.k === 'freightAmount';
                  const readOnly = (computed && !manualAmount) || lockedFreight;
                  const rate = field.k === 'hsnCode' ? rates[String(row.hsnCode || '').trim()] : undefined;
                  return (
                    <td key={field.k} className="min-w-[150px]">
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        className={'f-input' + (readOnly ? ' cursor-not-allowed bg-[#f3f5f9] text-inkmuted' : '')}
                        value={row[field.k] ?? ''}
                        readOnly={readOnly}
                        tabIndex={readOnly ? -1 : undefined}
                        title={manualAmount ? 'Enter manually when Freight is N/A' : (computed ? 'Calculated automatically' : (lockedFreight ? 'Freight is N/A on this document' : undefined))}
                        onChange={readOnly ? undefined : (event) => onChange(index, field.k, event.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                      {/* the rate is why Tax Amount reads what it reads - without
                          it an unmatched HSN just shows 0.00 with no explanation */}
                      {field.k === 'hsnCode' && rate !== undefined && rate !== null && (
                        <div className="mt-0.5 text-[11px] text-inkmuted">GST {rate}%</div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <button type="button" className="act-btn bg-danger" onClick={() => onRemove(index)} disabled={rows.length === 1}>
                    <Icon name="x" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* one cell per column, in column order: the first carries the
                "Total" caption, every numeric column carries its own sum, and
                the last empty cell lines up under Delete */}
            <tr>
              {card.fields.map((field, columnIndex) => (
                <th key={field.k}>
                  {columnIndex === 0
                    ? 'Total'
                    : (totals[field.k] === undefined ? '' : totals[field.k].toFixed(2))}
                </th>
              ))}
              <th />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SourceTable({ card, partyId, selected, onToggle }) {
  const [rows, setRows] = useState([]);
  const scope = useScope();

  useEffect(() => {
    const qs = new URLSearchParams({
      unconverted: card.unconvertedBy || '', perPage: '100',
      business: scope.business || '', location: scope.location || '', finYear: scope.finYear || '',
    });
    if (card.byCustomer && partyId) qs.set('customerId', partyId);
    fetch(card.endpoint + '?' + qs)
      .then((r) => r.json())
      .then((d) => setRows(d.rows || []))
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.endpoint, partyId, scope.business, scope.location, scope.finYear]);

  return (
    <>
      <label className="f-label">{card.label}{card.req && <span className="f-req">*</span>}</label>
      <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th>#</th><th>Select</th>
              {card.cols.map((c) => <th key={c.k}>{c.t}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={card.cols.length + 2} className="dt-empty">{card.empty}</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r._id}>
                <td>{i + 1}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={(selected || []).includes(r._id)}
                    onChange={() => onToggle(r._id)}
                  />
                </td>
                {card.cols.map((c) => <td key={c.k}>{fmt(c.f, r[c.k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VendorItems({ supplierId, selected, onChange, scope }) {
  const [available, setAvailable] = useState([]);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState([]);

  useEffect(() => {
    setAvailable([]); setChecked([]); onChange([]);
    if (!supplierId) { setOpen(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ supplier: supplierId, business: scope.business || '', location: scope.location || '', perPage: '1000', page: '1' });
    fetch('/api/barcode-generation?' + qs)
      .then((response) => response.json())
      .then((result) => { if (!cancelled) { setAvailable(result.rows || []); setOpen(true); } })
      .catch(() => { if (!cancelled) setAvailable([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supplierId, scope.business, scope.location, onChange]);

  const matches = available.filter((row) => {
    const query = term.trim().toLowerCase();
    if (!query) return true;
    return [row.barcodeGenerated, row.itemCode, row.itemName, row.supplierDescription, row.printDescription, row.purRate, row.finalNet, row.retailPrice, row.offerPrice]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  const toggle = (id) => setChecked((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const applySelection = () => { onChange(available.filter((row) => checked.includes(row._id))); setOpen(false); };
  const updateSelectedRow = (index, key, value) => {
    onChange(selected.map((row, rowIndex) => rowIndex === index
      ? { ...row, [key]: value, ...(key === 'finalNet' ? { purRate: value } : {}) }
      : row));
  };
  const amountFor = (row) => {
    const qty = Number(row.qty) || 0;
    const rate = Number(row.finalNet || row.purRate) || 0;
    const gst = Number(row.gst) || 0;
    const beforeGst = rate * qty;
    const gstAmount = beforeGst * gst / 100;
    return { beforeGst, igst: 0, cgst: gstAmount / 2, sgst: gstAmount / 2, net: beforeGst + gstAmount };
  };
  const selectedTotals = selected.reduce((totals, row) => {
    const amounts = amountFor(row);
    totals.qty += Number(row.qty) || 0;
    Object.keys(amounts).forEach((key) => { totals[key] += amounts[key]; });
    return totals;
  }, { qty: 0, beforeGst: 0, igst: 0, cgst: 0, sgst: 0, net: 0 });
  const firstMatchId = matches[0]?._id;

  return (
    <div className="card">
      <div className="card-head flex items-center justify-between gap-3"><span className="card-title">Vendor Items</span>{supplierId && <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Select Items</button>}</div>
      <div className="card-body">
        {!supplierId && <div className="text-sm text-gray-500">Select a vendor to view its items.</div>}
        {supplierId && selected.length > 0 && <div className="overflow-x-auto"><table className="dt min-w-[1500px]"><thead><tr><th>Sl No</th><th>Item Code</th><th>Item Name</th><th>HSN</th><th>GST Slab</th><th>UOM</th><th>Maximum Quantity</th><th>Final Rate</th><th>Return Quantity</th><th>Before GST</th><th>IGST Amount</th><th>CGST Amount</th><th>SGST Amount</th><th>Net Amount</th></tr></thead><tbody>
          {selected.map((row, index) => {
            const amounts = amountFor(row);
            const input = (key, type = 'text', fallback = '') => <input className="f-input h-8 min-w-[80px]" type={type} value={row[key] ?? fallback} onChange={(event) => updateSelectedRow(index, key, event.target.value)} onWheel={(e) => e.currentTarget.blur()} />;
            return <tr key={row._id}><td>{index + 1}</td><td>{input('itemCode')}</td><td>{input('supplierDescription', 'text', row.itemName)}</td><td>{input('hsn')}</td><td>{input('gst', 'number')}</td><td>{input('uom')}</td><td>{input('maximumQuantity', 'number', row.qty || 1)}</td><td>{input('finalNet', 'number')}</td><td>{input('qty', 'number')}</td><td>{amounts.beforeGst.toFixed(2)}</td><td>{amounts.igst.toFixed(2)}</td><td>{amounts.cgst.toFixed(2)}</td><td>{amounts.sgst.toFixed(2)}</td><td>{amounts.net.toFixed(2)}</td></tr>;
          })}
          <tr className="font-semibold"><td colSpan={8}>Total</td><td>{selectedTotals.qty.toFixed(2)}</td><td>{selectedTotals.beforeGst.toFixed(2)}</td><td>{selectedTotals.igst.toFixed(2)}</td><td>{selectedTotals.cgst.toFixed(2)}</td><td>{selectedTotals.sgst.toFixed(2)}</td><td>{selectedTotals.net.toFixed(2)}</td></tr>
        </tbody></table></div>}
        {supplierId && selected.length === 0 && !loading && <div className="text-sm text-gray-500">No items selected yet.</div>}
      </div>
      {open && supplierId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl"><div className="flex items-center gap-3 border-b border-line px-5 py-3"><span className="card-title">Select Vendor Items</span><span className="flex-1" /><button type="button" className="btn" onClick={() => setOpen(false)}>Close</button></div><div className="flex flex-wrap gap-2 border-b border-line p-4"><input className="f-input min-w-[280px] flex-1" placeholder="Search by barcode, item name, or price" value={term} onChange={(event) => setTerm(event.target.value)} /><button type="button" className="btn" onClick={() => setTerm((value) => value.trim())}>Search</button><button type="button" className="btn" onClick={() => setChecked(matches.map((row) => row._id))}>Select All</button><button type="button" className="btn" onClick={() => setChecked([])}>Unselect All</button></div><div className="flex-1 overflow-auto p-4">{loading && <div className="py-8 text-center text-sm text-gray-500">Loading vendor items...</div>}{!loading && matches.length === 0 && <div className="py-8 text-center text-sm text-gray-500">No matching items.</div>}{!loading && matches.length > 0 && <table className="dt min-w-[1050px]"><thead><tr><th>Select</th><th>Barcode</th><th>Item Code</th><th>Item Name</th><th>HSN</th><th>Pur Rate</th><th>Final NET</th><th>Retail Price</th><th>Qty</th><th>GST</th></tr></thead><tbody>{matches.map((row) => <tr key={row._id} className={(checked.includes(row._id) ? 'bg-indigo-50 ' : '') + (term && row._id === firstMatchId ? 'bg-yellow-100' : '')}><td><input type="checkbox" checked={checked.includes(row._id)} onChange={() => toggle(row._id)} /></td><td>{row.barcodeGenerated || '-'}</td><td>{row.itemCode || '-'}</td><td>{row.supplierDescription || row.itemName || row.printDescription || '-'}</td><td>{row.hsn || '-'}</td><td>{row.purRate || '-'}</td><td>{row.finalNet || '-'}</td><td>{row.retailPrice || row.offerPrice || '-'}</td><td>{row.qty || 1}</td><td>{row.gst || 0}%</td></tr>)}</tbody></table>}</div><div className="flex justify-end gap-2 border-t border-line p-4"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={applySelection}>Submit Selected ({checked.length})</button></div></div></div>}
    </div>
  );
}

export default function TransactionFormView({ cfg, id, slug }) {
  const router = useRouter();
  const scope = useScope();
  const cards = cfg.form?.cards || [];
  const slugPath = cfg.slugPath || slug;
  const listUrl = (cfg.basePath || '/admin/') + slugPath;
  const allFields = useMemo(
    () => cards.filter((c) => c.type === 'fields').flatMap((c) => c.fields || []),
    [cards]
  );
  const voucherCard = cards.find((card) => card.type === 'voucher');
  const inlineSourceCard = cards.find((card) => card.type === 'source' && card.inlineAfter);

  const [data, setData] = useState(() => {
    const d = {};
    allFields.forEach((f) => {
      d[f.k] = f.def === 'today' ? new Date().toISOString().slice(0, 10) : (f.def !== undefined ? f.def : '');
    });
    return d;
  });
  const [source, setSource] = useState([]);
  const [items, setItems] = useState([]);
  const [vendorItems, setVendorItems] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [voucherRows, setVoucherRows] = useState(() => [
    Object.fromEntries((voucherCard?.fields || []).map((field) => [field.k, ''])),
  ]);
  const [tab, setTab] = useState((cards.find((c) => c.type === 'scanTabs')?.tabs || [{ k: '' }])[0].k);
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(id || null);
  const [savedGrcNumber, setSavedGrcNumber] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState(null);
  const [quickAddNonce, setQuickAddNonce] = useState(0);
  const { options: stockPointOptions } = useOptions('stockpoint');

  useEffect(() => {
    if (id || data.stockPointId || !stockPointOptions.length) return;
    const warehouse = stockPointOptions.find((option) => String(option.label || '').trim().toLowerCase() === 'warehouse');
    if (!warehouse) return;
    setData((current) => ({ ...current, stockPointId: warehouse.value }));
    setSelectedOptions((current) => ({ ...current, stockPointId: warehouse }));
  }, [id, data.stockPointId, stockPointOptions]);

  /* A field with `disabledWhen` locks itself once its condition holds - the
     Freight selector does this at "N/A", so a choice that switches off the
     freight columns below cannot be nudged afterwards by a stray click. It is
     a guard rail, not a one-way door: `unlockable` puts an Unlock button next
     to it. Resetting or reloading the form clears this, since the state lives
     with the form. */
  const [unlocked, setUnlocked] = useState({});
  const isLocked = (f) => Boolean(
    f.disabledWhen
    && !unlocked[f.k]
    && Object.entries(f.disabledWhen).every(([key, expected]) => data[key] === expected)
  );
  /* AUTO-CALCULATED VOUCHER ROWS.

     Tax Amount and Total Amount are derived, never typed:
       Tax Amount   = Taxable x rate / 100      (rate from the HSN master)
       Total Amount = Taxable + Tax Amount + Freight
     Both inputs are read-only in the table, so a hand-typed figure cannot
     drift away from the numbers the rest of the document is built from.

     The rate is resolved the same way the barcode screen does it: /api/hsn to
     find the code, then /api/tax/<id> for the slab. Results are cached per
     code in a ref - the effect re-runs on every keystroke, and without the
     cache each one would be two more requests. Codes shorter than four
     characters are skipped: they are half-typed, not real HSN codes. */
  const hsnRateCache = useRef(new Map());
  const [hsnRates, setHsnRates] = useState({});
  const freightLocked = data.freightMode === FREIGHT_NONE;

  useEffect(() => {
    if (!voucherCard) return undefined;
    const codes = Array.from(new Set(
      voucherRows.map((row) => String(row.hsnCode || '').trim()).filter((c) => c.length >= 4)
    )).filter((code) => !hsnRateCache.current.has(code));
    if (!codes.length) return undefined;

    let cancelled = false;
    /* claim them before awaiting, so a re-render mid-flight does not refetch */
    codes.forEach((code) => hsnRateCache.current.set(code, undefined));

    Promise.all(codes.map(async (code) => {
      try {
        const hsnResponse = await fetch('/api/hsn?perPage=20&search=' + encodeURIComponent(code));
        const hsnPayload = await hsnResponse.json();
        const rows = hsnPayload.rows || [];
        /* the search is a contains-match, so prefer the exact code */
        const match = rows.find((r) => String(r.code || '').trim() === code) || rows[0];
        const taxId = match?.taxSlabs?.[0]?.gstTaxNameId;
        if (!taxId) return [code, null];
        const taxResponse = await fetch('/api/tax/' + taxId);
        const taxPayload = await taxResponse.json();
        const doc = taxPayload.doc || {};
        /* IGST when it is set, otherwise CGST + SGST, which is the same total */
        const split = Number(doc.cgst || 0) + Number(doc.sgst || 0);
        const rate = Number(doc.igst) || split || Number(doc.gst) || 0;
        return [code, rate > 0 ? rate : null];
      } catch {
        return [code, null];
      }
    })).then((pairs) => {
      if (cancelled) return;
      pairs.forEach(([code, rate]) => hsnRateCache.current.set(code, rate));
      setHsnRates((current) => ({ ...current, ...Object.fromEntries(pairs) }));
    });

    return () => { cancelled = true; };
  }, [voucherRows, voucherCard]);

  /* Recompute after anything that feeds the formulas: a Taxable edit, an HSN
     code, a rate arriving, the Freight mode, a row added or removed.

     Writing back into voucherRows rather than only rendering the numbers is
     deliberate - submit() sends voucherRows, so a display-only total would
     save blank. The identity guard below returns the SAME array when nothing
     moved, which is what stops this from looping: React bails out of a state
     update that returns the current reference. */
  useEffect(() => {
    if (!voucherCard) return;
    setVoucherRows((current) => {
      let changed = false;
      const next = current.map((row) => {
        const rate = hsnRates[String(row.hsnCode || '').trim()];
        const taxable = Number(row.taxableValue) || 0;
        const freightValue = freightLocked ? '0' : (row.freightAmount ?? '');
        const freight = Number(freightValue) || 0;
        if (freightLocked) {
          if (row.freightAmount === freightValue) return row;
          changed = true;
          return { ...row, freightAmount: freightValue };
        }
        const tax = rate ? Math.round(taxable * rate) / 100 : 0;
        const taxAmount = tax.toFixed(2);
        const totalAmount = (taxable + tax).toFixed(2);
        const totalValue = String(row.totalAmount ?? '').trim() || totalAmount;
        if (row.taxAmount === taxAmount && row.totalAmount === totalValue && row.freightAmount === freightValue) return row;
        changed = true;
        return { ...row, taxAmount, totalAmount: totalValue, freightAmount: freightValue };
      });
      return changed ? next : current;
    });
  }, [voucherRows, hsnRates, freightLocked, voucherCard]);

  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setData((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            const v = d.doc[k];
            if (v === null || v === undefined) return;
            next[k] = allFields.find((f) => f.k === k)?.type === 'ref' ? String(v) : v;
          });
          return next;
        });
        setItems(d.doc.items || []);
        setVendorItems(d.doc.items || []);
        if (voucherCard) {
          const savedRows = Array.isArray(d.doc.voucherRows) && d.doc.voucherRows.length
            ? d.doc.voucherRows
            : [Object.fromEntries((voucherCard.fields || []).map((field) => [field.k, d.doc[field.k] ?? '']))];
          setVoucherRows(savedRows);
        }
        
        // Load selected options for ref fields, especially supplierId
        const refFields = allFields.filter((f) => f.type === 'ref');
        refFields.forEach((field) => {
          const value = d.doc[field.k];
          if (value) {
            // Load options for this ref field
            fetch('/api/options?ref=' + field.ref + '&business=' + (scope.business || '') + '&location=' + (scope.location || ''))
              .then((r) => r.json())
              .then((optionsData) => {
                const options = optionsData.options || [];
                const selectedOption = options.find((opt) => opt.value === String(value));
                if (selectedOption) {
                  setSelectedOptions((prev) => ({ ...prev, [field.k]: selectedOption }));
                }
              })
              .catch(() => {});
          }
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, slugPath, scope.business, scope.location]);

  /* A slow lookup for a vendor picked two changes ago must not land on top
     of the current one. */
  const fillTicket = useRef(0);

  const set = (k, v) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));

    const spec = allFields.find((f) => f.k === k);

    /* `clears` names the fields that BELONG to the old value and must not
       survive it.

       Changing the vendor left the previously chosen LR - and the invoice
       number copied off it - sitting in the form while the LR dropdown
       reloaded with a different vendor's transactions. The GRC could then be
       submitted with vendor B and vendor A's LR. The server rejects that (it
       re-checks the LR belongs to the vendor), but the operator only found
       out at submit, with no indication of which field was wrong. */
    if (spec?.clears?.length) {
      setData((d) => spec.clears.reduce((next, target) => ({ ...next, [target]: '' }), d));
      setErrors((e) => spec.clears.reduce((next, target) => ({ ...next, [target]: undefined }), e));
    }

    /* `fillFrom` lets a ref field copy details off the record it points at.
       Vendor GST No is read-only and has no other source - without this it
       renders as a permanently empty box. */
    if (!spec?.fillFrom) return;

    const { endpoint, map } = spec.fillFrom;
    const ticket = ++fillTicket.current;

    /* clearing the vendor clears what it filled in */
    if (!v) {
      setData((d) => Object.keys(map)
        .reduce((next, target) => ({ ...next, [target]: '' }), d));
      return;
    }

    fetch(endpoint + '/' + v)
      .then((r) => r.json())
      .then(({ doc }) => {
        if (ticket !== fillTicket.current || !doc) return;
        setData((d) => Object.entries(map)
          .reduce((next, [target, src]) => ({ ...next, [target]: doc[src] ?? '' }), d));
      })
      .catch(() => { /* leave the filled fields as they are */ });
  };

  const updateVoucherRow = (index, key, value) => {
    setVoucherRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [key]: value };
      if (['invoiceQty', 'taxableValue', 'taxAmount'].includes(key)) {
        next.totalAmount = (Number(next.taxableValue) + Number(next.taxAmount)).toFixed(2);
      }
      return next;
    }));
  };

  async function submit() {
    setSaving(true); setFlash(null);
    try {
      const payload = {
        data: {
          ...data,
          ...Object.fromEntries((voucherCard?.fields || []).map((field) => [field.k, voucherRows[0]?.[field.k] ?? ''])),
          voucherRows,
          items: vendorItems.length ? vendorItems : items,
          sourceIds: source, ...(tab ? { type: tab } : {}),
        },
        business: scope.business, location: scope.location, finYear: scope.finYear,
      };

      const r = await fetch(cfg.endpoint + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (r.status === 422) {
        setErrors(d.errors || {});
        /* Build a human-readable summary from the field-level errors so the
           operator knows exactly what to correct even on forms whose first
           card is not a fields card (e.g. GRC Add, where the flash used to
           be invisible because it was rendered only inside the first card). */
        const messages = Object.values(d.errors || {}).filter(Boolean);
        setFlash({
          type: 'err',
          msg: messages.length
            ? messages.join(' • ')
            : 'Please correct the highlighted fields.',
        });
        return;
      }
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || ('Save failed (' + r.status + ')') });
        return;
      }
      if (cfg.afterSaveBarcode && d.id) {
        setSavedId(d.id);
        setSavedGrcNumber(d.grcNumber || '');
      }
      else router.push(listUrl);
    } catch (err) {
      /* Network failure, JSON parse error, etc. — previously swallowed silently */
      setFlash({ type: 'err', msg: err?.message || 'An unexpected error occurred. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Flash message lives here — outside the card map — so it always
          renders regardless of which card type is first. Previously it was
          only shown inside the first `fields` card, which meant it was
          invisible on forms like GRC Add whose first card is `source`. */}
      {flash && (
        <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>
          {flash.msg}
        </div>
      )}

      {cards.map((card, i) => {
        if (card.type === 'fields') {
          return (
            <div className="card" key={i}>
              {cfg.form.title && i === 0 && (
                <div className="card-head"><span className="card-title">{cfg.form.title}</span></div>
              )}
              <div className="card-body">
                <div className={card.gridClass || 'form-grid-4'}>
                  {(card.fields || []).filter((f) => !f.visibleWhen || Object.entries(f.visibleWhen).every(([key, expected]) => data[key] === expected)).map((f) => (
                    <div key={f.k} className={(f.layoutClass || '') + ((cfg.quickAdds?.[f.k] || (cfg.quickAdd?.field === f.k && cfg.quickAdd?.inline)) ? ' flex items-end gap-1.5' : '')}>
                      <Field 
                        key={f.k + '-' + quickAddNonce} 
                        f={isLocked(f) ? { ...f, disabled: true } : f} 
                        value={data[f.k]} 
                        error={errors[f.k]} 
                        onChange={set} 
                        onOptionChange={(option) => {
                          if (option) {
                            setSelectedOptions((prev) => ({ ...prev, [f.k]: option }));
                          }
                        }}
                        selectedOption={selectedOptions[f.k]}
                      />
                      {isLocked(f) && f.unlockable && (
                        <button
                          type="button"
                          className="mt-1 text-[12px] font-semibold text-brand-link hover:underline"
                          onClick={() => setUnlocked((current) => ({ ...current, [f.k]: true }))}
                        >
                          Locked - click to unlock
                        </button>
                      )}
                      {(cfg.quickAdds?.[f.k] || (cfg.quickAdd?.field === f.k ? cfg.quickAdd : null)) && (
                        <button type="button" className="btn btn-primary mt-2 shrink-0" title="Add" aria-label="Add" onClick={() => { setQuickAddTarget(f.k); setQuickAddOpen(true); }}>
                          <Icon name="plus" size={13} /> {(cfg.quickAdds?.[f.k] || cfg.quickAdd).label}
                        </button>
                      )}
                      {inlineSourceCard?.inlineAfter === f.k && (
                        <div className="mt-3">
                          <SourceSelect
                            card={inlineSourceCard}
                            supplierId={data.supplierId}
                            value={source}
                            onChange={(next) => {
                              setSource(next);
                              if (inlineSourceCard.sourceKey) set(inlineSourceCard.sourceKey, next);
                            }}
                            onSelect={(row) => {
                              if (!row || !inlineSourceCard.populate) return;
                              const fillFromKeys = new Set(
                                allFields.filter((f) => f.fillFrom).map((f) => f.k)
                              );
                              const batchEntries = Object.entries(inlineSourceCard.populate)
                                .filter(([target]) => !fillFromKeys.has(target));
                              const fillEntries = Object.entries(inlineSourceCard.populate)
                                .filter(([target]) => fillFromKeys.has(target));
                              if (batchEntries.length) {
                                setData((current) => batchEntries.reduce(
                                  (next, [target, sourceKey]) => ({ ...next, [target]: row[sourceKey] ?? '' }),
                                  current
                                ));
                              }
                              fillEntries.forEach(([target, sourceKey]) => {
                                set(target, row[sourceKey] ?? '');
                              });
                              
                              // Handle vendor name display - prioritize supplier object from the row
                              if (row.supplierId) {
                                // If the row includes supplier details, use them directly
                                if (row.supplier && row.supplier.vendorName) {
                                  const vendorName = row.supplier.vendorName;
                                  const vendorCode = row.supplier.vendorNo ? ` (${row.supplier.vendorNo})` : '';
                                  setSelectedOptions((prev) => ({ 
                                    ...prev, 
                                    supplierId: { 
                                      value: String(row.supplierId), 
                                      label: vendorName + vendorCode 
                                    } 
                                  }));
                                } else {
                                  // Otherwise fetch from options API
                                  fetch('/api/options?ref=supplier&business=' + (scope.business || '') + '&location=' + (scope.location || ''))
                                    .then((r) => r.json())
                                    .then((optionsData) => {
                                      const options = optionsData.options || [];
                                      const selectedOption = options.find((opt) => opt.value === String(row.supplierId));
                                      if (selectedOption) {
                                        setSelectedOptions((prev) => ({ ...prev, supplierId: selectedOption }));
                                      }
                                    })
                                    .catch(() => {});
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {card.preview && (
                  <div className="mt-3">
                    <button type="button" className="btn w-full max-w-[380px] justify-center bg-[#7f9fd6] text-white">
                      Preview
                    </button>
                  </div>
                )}
                {card.attachmentButtons && (
                  <div className="mt-3 flex gap-3">
                    {card.attachmentButtons.map((b) => (
                      <button key={b.k} type="button" className="btn border-[#f0a9a4] bg-[#f2a19b] text-white">
                        <Icon name="file" size={14} /> {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (card.type === 'info') return <div className="card" key={i}><div className="card-body"><InfoBox items={card.items} /></div></div>;

        if (card.type === 'voucher') {
          return (
            <VoucherSection
              key={i}
              card={card}
              rows={voucherRows}
              rates={hsnRates}
              freightLocked={freightLocked}
              onChange={updateVoucherRow}
              onAdd={() => setVoucherRows((rows) => [
                ...rows,
                Object.fromEntries(card.fields.map((field) => [field.k, ''])),
              ])}
              onRemove={(index) => setVoucherRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
            />
          );
        }

        if (card.type === 'vendorItems') {
          return <VendorItems key={i} supplierId={data.supplierId} selected={vendorItems} onChange={setVendorItems} scope={scope} />;
        }

        if (card.type === 'scan') {
          return (
            <div className="card" key={i}>
              <div className="card-body">
                <ScanRow onFound={(hit) => setItems((rows) => [...rows, { 'Item Code': hit.itemCode || hit.name, 'Item Name': hit.name }])} />
              </div>
            </div>
          );
        }

        if (card.type === 'source' && card.inlineAfter) return null;
        if (card.type === 'source') {
          return (
            <div className="card" key={i}>
              <div className="card-body">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                  <div className="flex items-end gap-4">
                    <div className="min-w-0 flex-1">
                      <SourceSelect
                        card={card}
                        supplierId={data.supplierId}
                        value={source}
                        onChange={(next) => {
                          setSource(next);
                          if (card.sourceKey) set(card.sourceKey, next);
                        }}
                        onSelect={(selection) => {
                      const selectedRows = Array.isArray(selection) ? selection : [selection];
                      const sourceItems = selectedRows.flatMap((sourceRow) => (Array.isArray(sourceRow?.items) ? sourceRow.items : []).map((item) => {
                        const qty = Number(item.qty) || 0;
                        const rate = Number(item.finalNet || item.purRate) || 0;
                        const beforeTax = qty * rate;
                        const gstAmount = beforeTax * (Number(item.gst) || 0) / 100;
                        return {
                          ...item,
                          'GRT Code': sourceRow.grtNo || '',
                          'Item Code': item.itemCode || '',
                          'Item Name': item.supplierDescription || item.itemName || item.printDescription || '',
                          'HSN': item.hsn || '',
                          'GST Slab': item.gst || 0,
                          'UOM': item.uom || '',
                          'Return Quantity': qty,
                          'Final Rate': rate,
                          'Before Tax': beforeTax,
                          'IGST Amount': 0,
                          'CGST Amount': gstAmount / 2,
                          'SGST Amount': gstAmount / 2,
                          'Net Amount': beforeTax + gstAmount,
                        };
                      }));
                      if (sourceItems.length) setItems(sourceItems);
                      const row = Array.isArray(selection) ? selection[0] : selection;
                      if (!row || !card.populate) return;
                      /* Populate fields from the selected source row.
                         Fields that have `fillFrom` must go through set() so that
                         fillFrom fires (e.g. supplierId → fetch GST No).
                         All other fields are batched into a single setData call. */
                      const fillFromKeys = new Set(
                        allFields.filter((f) => f.fillFrom).map((f) => f.k)
                      );
                      const batchEntries = Object.entries(card.populate)
                        .filter(([target]) => !fillFromKeys.has(target));
                      const fillEntries = Object.entries(card.populate)
                        .filter(([target]) => fillFromKeys.has(target));

                      if (batchEntries.length) {
                        setData((current) => batchEntries.reduce(
                          (next, [target, sourceKey]) => ({ ...next, [target]: row[sourceKey] ?? '' }),
                          current
                        ));
                      }
                      /* call set() for each fillFrom field so the side-effect
                         (API fetch → write dependent field) is triggered */
                      fillEntries.forEach(([target, sourceKey]) => {
                        set(target, row[sourceKey] ?? '');
                      });
                        }}
                      />
                    </div>
                    {savedGrcNumber && (
                      <div className="shrink-0 pb-2 text-[15px] font-bold text-slate-700">
                        GRC Number: {savedGrcNumber}
                      </div>
                    )}
                  </div>
                  {/* Inline validation error for required source fields
                      (e.g. LR / Transaction Number on GRC Add) */}
                  {card.sourceKey && errors[card.sourceKey] && (
                    <p className="mt-1 text-[12px] text-red-600">{errors[card.sourceKey]}</p>
                  )}
                  </div>
                  {card.info && <InfoBox items={card.info} />}
                </div>
              </div>
            </div>
          );
        }

        if (card.type === 'scanTabs') {
          return (
            <div className="card" key={i}>
              <div className="card-head"><span className="card-title">{card.title}</span></div>
              <div className="card-body">
                <ScanTabs
                  card={card}
                  tab={tab}
                  setTab={setTab}
                  rows={items.filter((r) => !r.__tab || r.__tab === tab)}
                  onFound={(hit) => setItems((rows) => [...rows, {
                    __tab: tab,
                    'Item Code': hit.itemCode || hit.name,
                    'Item Name': hit.name,
                  }])}
                  onRemove={(ri) => setItems((rows) => rows.filter((_, x) => x !== ri))}
                />
              </div>
            </div>
          );
        }

        if (card.type === 'sourceTable') {
          return (
            <div className="card" key={i}>
              <div className="card-body">
                <SourceTable
                  card={card}
                  partyId={data.customerId || data.supplierId}
                  selected={Array.isArray(source) ? source : (source ? [source] : [])}
                  onToggle={(rid) => setSource((cur) => {
                    const list = Array.isArray(cur) ? cur : (cur ? [cur] : []);
                    return list.includes(rid) ? list.filter((x) => x !== rid) : [...list, rid];
                  })}
                />
              </div>
            </div>
          );
        }

        if (card.type === 'totals') {
          return (
            <div className="card" key={i}>
              <div className="card-body">
                <Totals card={card} data={data} onChange={set} />
              </div>
            </div>
          );
        }

        if (card.type === 'grid') {
          return (
            <div className="card" key={i}>
              <div className="card-body">
                <Grid card={card} rows={items} onRemove={(ri) => setItems((rows) => rows.filter((_, x) => x !== ri))} />
                {card.paginated && (
                  <div className="flex items-center pt-3 text-[13px] text-cell">
                    <span>Page <b className="text-brand-link">{items.length ? 1 : 0}</b> of {items.length ? 1 : 0}</span>
                    <span className="flex-1" />
                    <span className="flex gap-2">
                      <button className="btn" disabled>Previous</button>
                      <button className="btn" disabled>Next</button>
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}

      {quickAddOpen && (cfg.quickAdds?.[quickAddTarget] || cfg.quickAdd) && (
        <ModalForm
          cfg={(() => {
            const quickAdd = cfg.quickAdds?.[quickAddTarget] || cfg.quickAdd;
            return { addTitle: quickAdd.title, endpoint: quickAdd.endpoint, fields: quickAdd.fields, modalWide: true };
          })()}
          slug={(cfg.quickAdds?.[quickAddTarget] || cfg.quickAdd).slug}
          onClose={() => { setQuickAddOpen(false); setQuickAddTarget(null); }}
          onSaved={() => {
            /* same reason as DeliveryView: a remount alone would be answered
               from the browser cache, so the new record has to be announced */
            const spec = cfg.quickAdds?.[quickAddTarget] || cfg.quickAdd;
            const target = allFields.find((f) => f.k === (spec?.field || quickAddTarget));
            if (target?.ref) refreshOptions(target.ref);
            setQuickAddOpen(false); setQuickAddTarget(null); setQuickAddNonce((nonce) => nonce + 1);
          }}
        />
      )}

      <button type="button" className="btn btn-primary mx-auto mt-2 flex h-[38px] w-full max-w-[390px] justify-center" onClick={submit} disabled={saving}>
        {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Submit
      </button>
      {cfg.afterSaveBarcode && savedId && (
        <button type="button" className="btn mx-auto mt-2 flex h-[38px] w-full max-w-[390px] justify-center bg-indigo-600 text-white" onClick={() => router.push((cfg.barcodePath || '') + savedId + (cfg.barcodeSuffix || ''))}>
          <Icon name="barcode" size={14} /> Barcode Generation
        </button>
      )}
    </>
  );
}
