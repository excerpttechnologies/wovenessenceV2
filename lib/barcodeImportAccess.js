import { ImportServiceError } from '@/lib/barcodeMasterImportService';

/* Import sessions hold a business's workbook and its preview. They are
   private to the person who uploaded them: the token is unguessable, but an
   operator who was shown a token by someone else must still not be able to
   execute or download another user's file. */
export function assertSessionOwner(meta, session) {
  if (!meta?.userId) return;
  if (String(meta.userId) !== String(session?.id || '')) {
    throw new ImportServiceError(
      'FORBIDDEN_SESSION',
      'This import session belongs to another user. Upload your own workbook.',
      { status: 403 },
    );
  }
}

export function workbookFileName(prefix, fallback = 'import') {
  const safe = String(prefix || fallback)
    .replace(/\.(xlsx|xlsm|xls)$/i, '')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .trim()
    .slice(0, 80) || fallback;
  return `${safe}.xlsx`;
}
