'use client';
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
export function SortHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th>
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
