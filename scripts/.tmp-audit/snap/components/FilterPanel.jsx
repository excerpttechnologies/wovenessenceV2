'use client';
import { useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import { useOptions } from './useOptions';

function RefFilter({ f, value, onChange }) {
  const { options, loading } = useOptions(f.ref);
  return (
    <MultiSelect
      mode="single" options={options} loading={loading}
      value={value || ''} placeholder={f.placeholder || 'Select...'} onChange={onChange}
    />
  );
}

/* The Filter card that sits ABOVE the list card on every transaction page.
   Values are held locally and only applied when Search is pressed, which is
   how the original behaves. */
export default function FilterPanel({ filters, onSearch }) {
  const [draft, setDraft] = useState({});
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title"><Icon name="filter" size={15} /> Filter</span>
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 items-end gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-4">
          {filters.map((f) => (
            <div key={f.k}>
              <label className="f-label">{f.label}</label>
              {f.type === 'ref'
                ? <RefFilter f={f} value={draft[f.k]} onChange={(v) => set(f.k, v)} />
                : (
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    className="f-input"
                    placeholder={f.type === 'date' ? 'dd-mm-yyyy' : ''}
                    value={draft[f.k] || ''}
                    onChange={(e) => set(f.k, e.target.value)}
                  />
                )}
            </div>
          ))}
          <button type="button" className="btn btn-primary h-9 justify-center" onClick={() => onSearch(draft)}>
            Search
          </button>
        </div>
      </div>
    </div>
  );
}
