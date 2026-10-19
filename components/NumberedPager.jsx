'use client';
import { useState } from 'react';
import Icon from './Icon';

/* List footer and sortable column header (17-10-2026), shared by
   components/ListView.jsx (cfg.pager / cfg.sortable) and the list screens
   that are not built on it (Barcode Settings).

   NumberedPager - "Showing a - b of N records", a Rows-per-page select, and
   |< < 1 2 3 4 5 > >|. The window of page numbers is at most five wide and
   follows the current page. The screen's own default page size is kept as an
   option, so a list that shows 15 by default can still be set back to 15. */

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function NumberedPager({ page, pages, total, shown, perPage, onPage, onPerPage }) {
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = total ? from + shown - 1 : 0;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const nums = [];
  for (let n = start; n <= end; n += 1) nums.push(n);
  const options = PER_PAGE_OPTIONS.includes(perPage)
    ? PER_PAGE_OPTIONS
    : [...PER_PAGE_OPTIONS, perPage].sort((a, b) => a - b);
  const go = (n) => { if (n >= 1 && n <= pages && n !== page) onPage(n); };
  const navBtn = "btn !px-2 !h-8 min-w-8 justify-center";
  return (
    <div className="flex flex-wrap items-center gap-3 pt-3 text-[13px] text-cell">
      <span className="uppercase">
        Showing <b className="text-brand-link">{from} - {to}</b> of <b className="text-brand-link">{total}</b> records
      </span>
      <span className="inline-flex items-center gap-2 uppercase">
        Rows
        <select
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-[13px] font-semibold text-brand-link outline-none focus:border-brand"
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-1.5">
        <button className={navBtn} title="First page" aria-label="First page" disabled={page <= 1} onClick={() => go(1)}>
          <span className="inline-flex items-center"><span className="h-3 border-l-2 border-current" /><Icon name="chevL" size={14} /></span>
        </button>
        <button className={navBtn} title="Previous" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
          <Icon name="chevL" size={14} />
        </button>
        {nums.map((n) => (
          <button
            key={n}
            className={navBtn + (n === page ? " !border-brand !bg-brand !text-white" : "")}
            aria-current={n === page ? "page" : undefined}
            onClick={() => go(n)}
          >
            {n}
          </button>
        ))}
        <button className={navBtn} title="Next" aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)}>
          <Icon name="chevR" size={14} />
        </button>
        <button className={navBtn} title="Last page" aria-label="Last page" disabled={page >= pages} onClick={() => go(pages)}>
          <span className="inline-flex items-center"><Icon name="chevR" size={14} /><span className="h-3 border-l-2 border-current" /></span>
        </button>
      </span>
    </div>
  );
}

/* A header cell that sorts the list: neutral arrow until clicked, then
   ascending, then toggles. `sort` is { key, dir }; `onSort(nextSort)`. */
export function SortHeader({ label, sortKey, sort, onSort, className, style }) {
  const active = sort.key === sortKey;
  return (
    <th className={className} style={style}>
      <button
        type="button"
        className="inline-flex items-center gap-1"
        style={{ font: "inherit", color: "inherit", textTransform: "inherit", letterSpacing: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer" }}
        title={"Sort by " + label}
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      >
        {label}
        <span className="text-[10px] leading-none opacity-70" aria-hidden="true">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

/* Sorting and paging for a screen that already holds its whole list in the
   browser (the Inter Company Sell screens read theirs in one request and
   draw every row). Nothing is re-fetched: the rows on hand are ordered and
   sliced, so the screen's own loading, buttons and actions are untouched.

     const view = useClientTable(rows, (row, key) => value shown for key);
     view.rows    - this page's rows, in order
     view.offset  - index of the first one, for a running # column
     view.th(label, key, className, style) - a sortable header cell
     view.pager   - the footer
     view.firstPage() - back to page 1 (after a search)

   Empties go last in both directions; numbers and dates compare as such,
   text case-insensitively with digits in natural order. */
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const isEmpty = (v) => v === null || v === undefined || v === '';
function compareShown(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a - b;
  return collator.compare(String(a), String(b));
}

export function useClientTable(list, valueOf) {
  const [sort, setSort] = useState({ key: null, dir: null });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const all = Array.isArray(list) ? list : [];
  let ordered = all;
  if (sort.key && sort.dir) {
    const dir = sort.dir === 'desc' ? -1 : 1;
    ordered = all
      .map((row, i) => ({ row, i, v: valueOf(row, sort.key) }))
      .sort((x, y) => {
        const ex = isEmpty(x.v);
        const ey = isEmpty(y.v);
        if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1;
        return compareShown(x.v, y.v) * dir || x.i - y.i;
      })
      .map((o) => o.row);
  }

  const pages = Math.max(1, Math.ceil(ordered.length / perPage));
  const current = Math.min(page, pages);
  const offset = (current - 1) * perPage;
  const rows = ordered.slice(offset, offset + perPage);
  const onSort = (next) => { setSort(next); setPage(1); };

  return {
    rows,
    offset,
    /* back to page 1 - for a screen whose own search narrows the list */
    firstPage: () => setPage(1),
    th: (label, key, className, style) => (
      <SortHeader key={key} label={label} sortKey={key} sort={sort} onSort={onSort} className={className} style={style} />
    ),
    pager: (
      <NumberedPager
        page={current}
        pages={pages}
        total={ordered.length}
        shown={rows.length}
        perPage={perPage}
        onPage={setPage}
        onPerPage={(n) => { setPerPage(n); setPage(1); }}
      />
    ),
  };
}
