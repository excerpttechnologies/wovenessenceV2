/* ==========================================================================
   Release note validation and the shape the browser is allowed to see.

   Kept out of the route files so the create route, the edit route and the
   dashboard all agree on what a release is. Nothing here reads the database;
   it only turns a request body into a clean document and a stored document
   into a safe response.
   ========================================================================== */

export const ENTRY_KEYS = ['features', 'fixes', 'security', 'improvements'];

const ENTRY_LIMIT = 100;
const MODULE_LIMIT = 80;
const TEXT_LIMIT = 500;

export function releaseError(message) {
  const err = new Error(message);
  err.status = 422;
  err.code = 'VALIDATION';
  return err;
}

function text(value, fallback = '', limit = TEXT_LIMIT) {
  return String(value ?? fallback).trim().slice(0, limit);
}

/* Accepts both shapes the screen and an API client might send:

     { module: 'Sidebar', text: 'Added frequently visited pages.' }
     'Sidebar: Added frequently visited pages.'

   A line with no module falls under General rather than being rejected - a
   release note is prose, and forcing a module on the author would make the
   form harder to use than the feature is worth. */
function parseEntry(value) {
  if (typeof value === 'string') {
    const line = value.trim();
    if (!line) return null;
    const colon = line.indexOf(':');
    if (colon > 0 && colon <= MODULE_LIMIT) {
      return {
        module: text(line.slice(0, colon), 'General', MODULE_LIMIT),
        text: text(line.slice(colon + 1), '', TEXT_LIMIT),
      };
    }
    return { module: 'General', text: text(line, '', TEXT_LIMIT) };
  }

  if (value && typeof value === 'object') {
    return {
      module: text(value.module, 'General', MODULE_LIMIT) || 'General',
      text: text(value.text, '', TEXT_LIMIT),
    };
  }

  return null;
}

export function normaliseEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];

  raw.forEach((value) => {
    const entry = parseEntry(value);
    if (!entry || !entry.text) return;
    const key = entry.module.toLowerCase() + '\u0000' + entry.text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  });

  return out.slice(0, ENTRY_LIMIT);
}

function normaliseVersion(raw) {
  const value = String(raw || '').trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+){1,3}$/.test(value)) {
    throw releaseError('Enter a version such as 1.0.0 or 1.09.');
  }
  return value;
}

function normaliseDate(raw) {
  if (!raw) return new Date();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw releaseError('Enter a valid release date.');
  }
  return date;
}

export function normaliseRelease(body) {
  const version = normaliseVersion(body?.version);
  const title = text(body?.title, '', 240);
  if (!title) throw releaseError('A release title is required.');

  const description = text(body?.description, '', 2000);
  const status = body?.status === 'draft' ? 'draft' : 'published';

  const out = {
    version,
    title,
    description,
    releaseDate: normaliseDate(body?.releaseDate),
    status,
    isLatest: Boolean(body?.isLatest),
  };

  ENTRY_KEYS.forEach((key) => {
    out[key] = normaliseEntries(body?.[key]);
  });

  return out;
}

function iso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function releaseCounts(doc) {
  return ENTRY_KEYS.reduce((acc, key) => {
    acc[key] = Array.isArray(doc?.[key]) ? doc[key].length : 0;
    return acc;
  }, {});
}

/* The public shape. No createdBy / updatedBy, no database metadata beyond the
   id the screen needs to address a row. */
export function publicRelease(doc) {
  if (!doc) return null;
  const entries = {};
  ENTRY_KEYS.forEach((key) => {
    entries[key] = (Array.isArray(doc[key]) ? doc[key] : []).map((entry) => ({
      module: text(entry?.module, 'General', MODULE_LIMIT) || 'General',
      text: text(entry?.text, '', TEXT_LIMIT),
    }));
  });

  return {
    id: String(doc._id || ''),
    version: text(doc.version, '', 40),
    title: text(doc.title, '', 240),
    description: text(doc.description, '', 2000),
    releaseDate: iso(doc.releaseDate),
    status: doc.status === 'draft' ? 'draft' : 'published',
    isLatest: Boolean(doc.isLatest),
    ...entries,
    counts: releaseCounts(doc),
  };
}
