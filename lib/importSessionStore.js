import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/* ==========================================================================
   UPLOAD SESSIONS FOR THE BARCODE + MASTER DATA IMPORT

   The workbook is parsed once on upload; the preview, the master-resolution
   step and the execution all read the SAME stored file instead of trusting
   rows the browser sends back. A browser could otherwise POST a preview full
   of valid rows and then ask the server to import something else.

   One token = one workbook + one analysis. Files live under the OS temp
   directory, not in the repository, and expire after two hours. The token is
   48 hex characters and is checked against that shape before it is ever used
   as a file name, so a crafted token cannot walk out of the directory.

   The store is deliberately small: no database table, no background worker.
   An import is a short interactive session, and a stale temp file is cheaper
   than a collection that needs its own cleanup job.
   ========================================================================== */

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // two hours
const TOKEN_RX = /^[a-f0-9]{48}$/;

function rootDir() {
  return process.env.BARCODE_IMPORT_TMP_DIR
    || path.join(os.tmpdir(), 'orbit-barcode-import');
}

function tokenPath(token, extension) {
  if (!TOKEN_RX.test(String(token || ''))) {
    const err = new Error('This import session is not valid. Upload the workbook again.');
    err.code = 'BAD_IMPORT_TOKEN';
    err.status = 410;
    throw err;
  }
  return path.join(rootDir(), `${token}.${extension}`);
}

function ttlMs() {
  const configured = Number(process.env.BARCODE_IMPORT_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_MS;
}

async function ensureRoot() {
  await fs.mkdir(rootDir(), { recursive: true });
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, data);
  try {
    await fs.rename(tmp, file);
  } catch {
    /* Windows cannot always replace an existing file with rename(). */
    await fs.rm(file, { force: true });
    await fs.rename(tmp, file);
  }
}

/* Delete sessions older than the TTL. Called on every create; the directory
   holds at most the workbooks of imports somebody is actually reviewing. */
export async function pruneExpiredImportSessions(now = Date.now()) {
  await ensureRoot();
  let names = [];
  try {
    names = await fs.readdir(rootDir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const file = path.join(rootDir(), name);
    try {
      const stat = await fs.stat(file);
      if (stat.isFile() && now - stat.mtimeMs > ttlMs()) {
        await fs.rm(file, { force: true });
        removed += 1;
      }
    } catch {
      /* a concurrent cleanup already removed it */
    }
  }
  return removed;
}

export async function createImportSession({
  buffer,
  fileName = '',
  scope,
  businessId,
  locationId,
  finYear = '',
  userId = '',
  userName = '',
  userEmail = '',
  fileHash = '',
  analysis = null,
  masterMappings = [],
  masterCreations = [],
}) {
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('No workbook buffer was supplied.');
  await pruneExpiredImportSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const now = new Date().toISOString();
  const meta = {
    token,
    fileName,
    scope,
    businessId: String(businessId || ''),
    locationId: String(locationId || ''),
    finYear,
    userId: String(userId || ''),
    userName,
    userEmail,
    fileHash,
    analysis,
    masterMappings: Array.isArray(masterMappings) ? masterMappings : [],
    masterCreations: Array.isArray(masterCreations) ? masterCreations : [],
    execution: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeAtomic(tokenPath(token, 'xlsx'), buffer);
  await writeAtomic(tokenPath(token, 'json'), JSON.stringify(meta));
  return meta;
}

export async function readImportSessionMeta(token) {
  const file = tokenPath(token, 'json');
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    const err = new Error('This import session has expired. Upload the workbook again.');
    err.code = 'IMPORT_SESSION_EXPIRED';
    err.status = 410;
    throw err;
  }
  let meta;
  try {
    meta = JSON.parse(raw);
  } catch {
    const err = new Error('This import session is corrupt. Upload the workbook again.');
    err.code = 'IMPORT_SESSION_CORRUPT';
    err.status = 410;
    throw err;
  }
  const age = Date.now() - new Date(meta.updatedAt || meta.createdAt || 0).getTime();
  if (!Number.isFinite(age) || age > ttlMs()) {
    await deleteImportSession(token);
    const err = new Error('This import session has expired. Upload the workbook again.');
    err.code = 'IMPORT_SESSION_EXPIRED';
    err.status = 410;
    throw err;
  }
  return meta;
}

export async function readImportSessionWorkbook(token) {
  try {
    return await fs.readFile(tokenPath(token, 'xlsx'));
  } catch {
    const err = new Error('The uploaded workbook is no longer available. Upload it again.');
    err.code = 'IMPORT_WORKBOOK_EXPIRED';
    err.status = 410;
    throw err;
  }
}

export async function updateImportSession(token, patch = {}) {
  const meta = await readImportSessionMeta(token);
  const next = {
    ...meta,
    ...patch,
    token,
    updatedAt: new Date().toISOString(),
  };
  await writeAtomic(tokenPath(token, 'json'), JSON.stringify(next));
  return next;
}

export async function deleteImportSession(token) {
  await Promise.all([
    fs.rm(tokenPath(token, 'xlsx'), { force: true }).catch(() => {}),
    fs.rm(tokenPath(token, 'json'), { force: true }).catch(() => {}),
  ]);
}

export default {
  createImportSession,
  readImportSessionMeta,
  readImportSessionWorkbook,
  updateImportSession,
  deleteImportSession,
  pruneExpiredImportSessions,
};
