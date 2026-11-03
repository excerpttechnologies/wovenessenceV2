// 'use client';
// import { useState } from 'react';
// import Icon from './Icon';

// export default function Toolbar({
//   columns, hidden, onToggleColumn, search, onSearch, onAdd, addLabel = 'ADD',
//   onExportCsv, onExportExcel, onExportPdf, showAdd = true,
//   showCsv = true, showExcel = true, showPdf = true,
//   /* ADD is DISABLED rather than removed when the role may not create here.

//      A button that vanishes leaves the operator wondering whether the screen
//      is broken or they are looking in the wrong place; one that is visibly
//      dead, with the reason beside it, tells them what to ask for. The server
//      refuses the request either way - see lib/screenPermission.js. */
//   addDisabled = false, addDisabledReason = '',
//   /* An export now collects EVERY row the filter matches, which on a big
//      list is many requests and takes a moment. The three buttons go dead
//      while it runs so a second click cannot start a second collection and
//      hand back two files. Defaults false, so callers that have not been
//      told about it behave exactly as before. */
//   exporting = false,
// }) {
//   const [pop, setPop] = useState(false);

//   return (
//     <>
//       <div className="flex flex-wrap items-center gap-2.5">
//         <div className="relative">
//           <button type="button" className="btn" onClick={() => setPop((p) => !p)}>
//             <Icon name="cols" size={14} /> Column visibility
//           </button>
//           {pop && (
//             <div className="absolute z-40 mt-1 max-h-72 min-w-[210px] overflow-auto rounded-md border border-linestrong bg-white p-2 shadow-pop">
//               {columns.map((c, i) => (
//                 <label key={c.t + i} className="flex cursor-pointer gap-2 px-1.5 py-1 text-[13px]">
//                   <input
//                     type="checkbox"
//                     checked={!hidden.includes(c.t)}
//                     onChange={() => onToggleColumn(c.t)}
//                   />
//                   {c.t}
//                 </label>
//               ))}
//             </div>
//           )}
//         </div>

//         <div className="flex-1" />

//         {/* Icon only, with the wording kept in title and aria-label.

//             All three used to draw the SAME "file" icon, which is fine beside a
//             label and useless without one - so each takes an icon that says
//             which format it is: a document for CSV, a grid for the spreadsheet,
//             and a printer for PDF, which is what that export actually does
//             (lib/format prints the table). */}
//         {/* Each export in the colour its format is known by - Excel green,
//             PDF red, CSV a neutral slate - so the three are told apart at a
//             glance now that they carry no words. The wording stays in title and
//             aria-label for the tooltip and for screen readers. */}
//         {showCsv && <button type="button" className="inline-flex h-9 w-10 items-center justify-center rounded bg-[#495464] text-white disabled:opacity-50" title={exporting ? "Collecting rows..." : "Export to CSV"} aria-label="Export to CSV" disabled={exporting} onClick={onExportCsv}><Icon name="file" size={16} /></button>}
//         {showExcel && <button type="button" className="inline-flex h-9 w-10 items-center justify-center rounded bg-[#1d6f42] text-white disabled:opacity-50" title={exporting ? "Collecting rows..." : "Export to Excel"} aria-label="Export to Excel" disabled={exporting} onClick={onExportExcel}><Icon name="grid" size={16} /></button>}
//         {showPdf && <button type="button" className="inline-flex h-9 w-10 items-center justify-center rounded bg-[#b30b00] text-white disabled:opacity-50" title={exporting ? "Collecting rows..." : "Export to PDF"} aria-label="Export to PDF" disabled={exporting} onClick={onExportPdf}><Icon name="printer" size={16} /></button>}
//       </div>

//       <div className="mt-3 flex flex-wrap items-center gap-2.5">
//         <span className="relative">
//           <span className="absolute left-2.5 top-2 text-[#93a0b5]"><Icon name="search" size={15} /></span>
//           <input
//             className="search-input"
//             placeholder="Search"
//             value={search}
//             onChange={(e) => onSearch(e.target.value)}
//           />
//         </span>
//         {showAdd && (
//           <button
//             type="button"
//             className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
//             onClick={onAdd}
//             disabled={addDisabled}
//             title={addDisabled ? addDisabledReason : undefined}
//           >
//             <Icon name="plus" size={14} /> {addLabel}
//           </button>
//         )}
//         {showAdd && addDisabled && addDisabledReason && (
//           <span className="text-[12px] text-danger">{addDisabledReason}</span>
//         )}
//       </div>
//     </>
//   );
// }
















'use client';
import { useState } from 'react';
import Icon from './Icon';
import { FaFileCsv, FaFileExcel, FaFilePdf } from 'react-icons/fa';

export default function Toolbar({
  columns, hidden, onToggleColumn, search, onSearch, onAdd, addLabel = 'ADD',
  onExportCsv, onExportExcel, onExportPdf, showAdd = true,
  showCsv = true, showExcel = true, showPdf = true,
  /* ADD is DISABLED rather than removed when the role may not create here.

     A button that vanishes leaves the operator wondering whether the screen
     is broken or they are looking in the wrong place; one that is visibly
     dead, with the reason beside it, tells them what to ask for. The server
     refuses the request either way - see lib/screenPermission.js. */
  addDisabled = false, addDisabledReason = '',
  /* An export now collects EVERY row the filter matches, which on a big
     list is many requests and takes a moment. The three buttons go dead
     while it runs so a second click cannot start a second collection and
     hand back two files. Defaults false, so callers that have not been
     told about it behave exactly as before. */
  exporting = false,
  /* Full-database export. When a screen passes onExportFull, a "Full export"
     control sits beside the existing Excel button and offers the four choices
     the export system supports. The Excel button itself is untouched, so a
     screen that does not pass the new props behaves exactly as before.
       onExportFull(mode)  mode = 'filtered' | 'all' | 'selected'
       showSelectedExport  true only where the list can actually select rows
       selectedCount       rows ticked on screen
       exportingLabel      progress wording shown beside the control */
  onExportFull = null,
  showSelectedExport = false,
  selectedCount = 0,
  exportingLabel = '',
}) {
  const [pop, setPop] = useState(false);
  const [exportPop, setExportPop] = useState(false);

  function chooseExport(mode) {
    setExportPop(false);
    if (mode === 'view') {
      if (onExportExcel) onExportExcel();
      return;
    }
    if (onExportFull) onExportFull(mode);
  }

  return (
    <>
      {/* One row, two groups: what acts on the table as a whole sits left,
          what finds or adds a row sits right. They are nested containers
          rather than a spacer, so on a narrow screen the two groups stack
          instead of a flex filler pushing one of them off on its own. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-3">
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

          {/* All three used to draw the SAME "file" icon, which is fine beside
              a label and useless without one - so each takes an icon that says
              which format it is: a document for CSV, a grid for the spreadsheet,
              and a printer for PDF, which is what that export actually does
              (lib/format prints the table). Each is also in the colour its
              format is known by - Excel green, PDF red, CSV a neutral slate.
              title and aria-label carry the full wording for the tooltip and
              for screen readers. */}
          {showCsv && <button type="button" className="exp-btn exp-csv" title={exporting ? "Collecting rows..." : "Export to CSV"} aria-label="Export to CSV" disabled={exporting} onClick={onExportCsv}><FaFileCsv size={18} /></button>}
          {showExcel && <button type="button" className="exp-btn exp-xls" title={exporting ? "Collecting rows..." : "Export to Excel"} aria-label="Export to Excel" disabled={exporting} onClick={onExportExcel}><FaFileExcel size={18} /></button>}
          {onExportFull && (
            <div className="relative">
              <button
                type="button"
                className="btn"
                onClick={() => setExportPop((open) => !open)}
                disabled={exporting}
                aria-haspopup="menu"
                aria-expanded={exportPop}
                title={exporting ? (exportingLabel || 'Building the full export...') : 'Export every field, not just the visible columns'}
              >
                <FaFileExcel size={14} />
                <span>Full export</span>
                <span aria-hidden="true" className="text-[10px] leading-none">▾</span>
              </button>
              {exportPop && (
                <div
                  role="menu"
                  className="absolute left-0 z-50 mt-1 w-[300px] rounded-md border border-linestrong bg-white p-1.5 shadow-pop"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-inkmuted">Export</div>
                  <button type="button" role="menuitem" className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-canvas" onClick={() => chooseExport('view')}>
                    Export Current View
                    <span className="block text-[11px] text-inkmuted">The columns on this screen, as before.</span>
                  </button>
                  <div className="my-1 border-t border-line" />
                  <button type="button" role="menuitem" className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-canvas" onClick={() => chooseExport('filtered')}>
                    Export Filtered Data - All Fields
                    <span className="block text-[11px] text-inkmuted">Every matching record, every MongoDB field.</span>
                  </button>
                  <button type="button" role="menuitem" className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-canvas" onClick={() => chooseExport('all')}>
                    Export All Accessible Records - All Fields
                    <span className="block text-[11px] text-inkmuted">Ignores search and filters; keeps company/location scope.</span>
                  </button>
                  {showSelectedExport && (
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => chooseExport('selected')}
                      disabled={exporting || selectedCount === 0}
                    >
                      Export Selected Records - All Fields
                      <span className="block text-[11px] text-inkmuted">
                        {selectedCount ? `${selectedCount} selected` : 'Tick rows in the list first.'}
                      </span>
                    </button>
                  )}
                  <p className="mt-1 border-t border-line px-2 py-1 text-[11px] text-inkmuted">
                    Written as a real .xlsx with a frozen header, filters and all fields.
                  </p>
                </div>
              )}
            </div>
          )}
          {exporting && exportingLabel && (
            <span className="text-[12px] text-inkmuted">{exportingLabel}</span>
          )}
          {showPdf && <button type="button" className="exp-btn exp-pdf" title={exporting ? "Collecting rows..." : "Export to PDF"} aria-label="Export to PDF" disabled={exporting} onClick={onExportPdf}><FaFilePdf size={18} /></button>}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            <button
              type="button"
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onAdd}
              disabled={addDisabled}
              title={addDisabled ? addDisabledReason : undefined}
            >
              <Icon name="plus" size={14} /> {addLabel}
            </button>
          )}
          {showAdd && addDisabled && addDisabledReason && (
            <span className="text-[12px] text-danger">{addDisabledReason}</span>
          )}
        </div>
      </div>
    </>
  );
}
