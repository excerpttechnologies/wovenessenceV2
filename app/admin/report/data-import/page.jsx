'use client';
import ItemWiseSummaryImport from '@/components/ItemWiseSummaryImport';
import BarcodeMasterImport from '@/components/BarcodeMasterImport';

export default function MainReportDataImportPage() {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink">Excel / Data Import</h1>
            <p className="mt-1 text-sm text-inkmuted">
              Import barcodes, opening stock and master data from a validated Excel workbook, or use the item-wise
              summary workflow. Download the matching template, preview every row, then confirm the write.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ItemWiseSummaryImport />
            <BarcodeMasterImport />
          </div>
        </div>
      </div>
    </div>
  );
}
