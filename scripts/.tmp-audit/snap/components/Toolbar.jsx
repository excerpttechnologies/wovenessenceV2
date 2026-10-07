'use client';
import { useState } from 'react';
import Icon from './Icon';

export default function Toolbar({
  columns, hidden, onToggleColumn, search, onSearch, onAdd, addLabel = 'ADD',
  onExportCsv, onExportExcel, onExportPdf, showAdd = true,
  showCsv = true, showExcel = true, showPdf = true,
}) {
  const [pop, setPop] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <button type="button" className="btn" onClick={() => setPop((p) => !p)}>
            <Icon name="cols" size={14} /> Column visibility
          </button>
          {pop && (
            <div className="absolute z-40 mt-1 max-h-72 min-w-[210px] overflow-auto rounded-md border border-linestrong bg-white p-2 shadow-pop">
              {columns.map((c, i) => (
                <label key={c.t + i} className="flex cursor-pointer gap-2 px-1.5 py-1 text-[13px]">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(c.t)}
                    onChange={() => onToggleColumn(c.t)}
                  />
                  {c.t}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {showCsv && <button type="button" className="btn" onClick={onExportCsv}><Icon name="file" size={14} /> Export to CSV</button>}
        {showExcel && <button type="button" className="btn" onClick={onExportExcel}><Icon name="file" size={14} /> Export to Excel</button>}
        {showPdf && <button type="button" className="btn" onClick={onExportPdf}><Icon name="file" size={14} /> Export to PDF</button>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <span className="relative">
          <span className="absolute left-2.5 top-2 text-[#93a0b5]"><Icon name="search" size={15} /></span>
          <input
            className="search-input"
            placeholder="Search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </span>
        {showAdd && (
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <Icon name="plus" size={14} /> {addLabel}
          </button>
        )}
      </div>
    </>
  );
}
