import { resolveRefLabels } from '@/lib/refLabels';

/* ==========================================================================
   Column-header sorting for list routes (17-10-2026).

   A list screen that opts in (components/ListView.jsx cfg.sortable) sends
   ?sortBy=<column key>&sortDir=asc|desc. A route passes that here together
   with the keys it allows. Returns the page of rows in that order - or NULL
   when no (allowed) sort was asked for, so the route falls through to its own
   query, untouched:

     const rows = (await sortedPage(Model, filter, sp, { page, perPage, keys }))
       ?? await Model.find(filter).sort({ createdAt: -1 })...;

   keys     plain stored fields - sorted by MongoDB, case-insensitively and
            with numbers in natural order ("9" before "10").
   computed { key: (doc) => value } for what the list shows but does not store
            as one sortable value (a count, a list of names) - sorted here.
   refs     stored ids the list shows as a NAME (businessId, ledgerGroupId...)
            - sorted by that name, resolved through lib/refLabels.js exactly
            as the list resolves it.

   computed / refs sort in memory over the filtered set. Master lists are a
   few hundred rows at most, which is what they are used for.
   ========================================================================== */

const COLLATION = { locale: 'en', strength: 2, numericOrdering: true };
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function readSort(sp, allowed) {
  const key = sp.get('sortBy');
  const raw = sp.get('sortDir');
  const dir = raw === 'asc' ? 1 : raw === 'desc' ? -1 : 0;
  if (!key || !dir || !allowed.includes(key)) return null;
  return { key, dir };
}

function compareValues(a, b) {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

export async function sortedPage(Model, filter, sp, {
  page, perPage, keys = [], computed = {}, refs = [], select,
}) {
  const sort = readSort(sp, [...keys, ...Object.keys(computed), ...refs]);
  if (!sort) return null;
  const { key, dir } = sort;

  if (keys.includes(key)) {
    let q = Model.find(filter);
    if (select) q = q.select(select);
    return q
      .sort({ [key]: dir, _id: 1 })
      .collation(COLLATION)
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();
  }

  /* in memory: read just what the order needs, then the page itself.
     A computed entry is either (doc) => value, or
     { select: 'a b', prepare: async (docs) => ctx, value: (doc, ctx) => value }
     to read only those fields and/or look something up once for all rows. */
  const field = refs.includes(key) ? key : null;
  const spec = field ? null : computed[key];
  const fieldsOnly = field ? '_id ' + field : (spec && spec.select ? '_id ' + spec.select : null);
  const docs = fieldsOnly
    ? await Model.find(filter).select(fieldsOnly).lean()
    : await Model.find(filter).lean();
  let valueOf;
  if (field) {
    const labels = await resolveRefLabels(docs);
    valueOf = (d) => (d[field] ? labels[String(d[field])] ?? String(d[field]) : '');
  } else if (typeof spec === 'function') {
    valueOf = spec;
  } else {
    const ctx = spec.prepare ? await spec.prepare(docs) : undefined;
    valueOf = (d) => spec.value(d, ctx);
  }
  const ordered = docs
    .map((d) => ({ id: String(d._id), v: valueOf(d) }))
    .sort((x, y) => {
      const c = compareValues(x.v, y.v);
      /* empties stay last in both directions */
      const emptyX = x.v === null || x.v === undefined || x.v === '';
      const emptyY = y.v === null || y.v === undefined || y.v === '';
      const r = emptyX !== emptyY ? c : c * dir;
      return r || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
  const ids = ordered.slice((page - 1) * perPage, page * perPage).map((o) => o.id);
  if (!ids.length) return [];

  let q = Model.find({ _id: { $in: ids } });
  if (select) q = q.select(select);
  const rows = await q.lean();
  const at = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => at.get(String(a._id)) - at.get(String(b._id)));
}
