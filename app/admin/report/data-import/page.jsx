'use client';
import Link from 'next/link';
import { useState } from 'react';
import { LuArrowRight, LuBarcode, LuClipboardList, LuUpload } from 'react-icons/lu';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import HsrImportButton from '@/components/HsrImport';
import StockAdjustmentImportButton from '@/components/StockAdjustmentImport';

const workflows = [
  {
    title: 'Stock Update',
    description: 'Open the existing Stock Adjustment screen to review and record stock changes.',
    href: '/admin/inventory/stock-adjustment',
    icon: LuClipboardList,
    hasExcelImport: true,
  },
  {
    title: 'Mass Barcode Import',
    description: 'Open Barcode Report and use its existing Import Barcodes workflow.',
    href: '/admin/reports/barcode-report',
    icon: LuBarcode,
    hasExcelImport: true,
  },
];

export default function MainReportDataImportPage() {
  const { business, location, finYear } = useScope();
  const [activeImport, setActiveImport] = useState(null); // 'stock' or 'barcode'

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body">
          <h1 className="text-lg font-bold text-ink">Excel / Data Import</h1>
          <p className="mt-1 text-sm text-inkmuted">
            Choose an existing stock or barcode workflow, or use the Excel import buttons below.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {workflows.map(({ title, description, href, icon: Icon, hasExcelImport }) => (
          <div key={href} className="card">
            <div className="card-body">
              <div className="flex items-start gap-3 mb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#eef4ff] text-brand">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="mt-1 block text-sm text-inkmuted">{description}</span>
                </span>
              </div>
              
              <div className="flex gap-2 mt-3">
                <Link href={href} className="btn flex-1">
                  <LuArrowRight size={14} /> Open Workflow
                </Link>
                {hasExcelImport && (
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => setActiveImport(title === 'Stock Update' ? 'stock' : 'barcode')}
                  >
                    <LuUpload size={14} /> Excel Import
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* HSR Import Modal for Barcode Import */}
      {activeImport === 'barcode' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
              <span className="text-[15px] font-bold uppercase tracking-wide">Mass Barcode Excel Import</span>
              <button
                type="button"
                onClick={() => setActiveImport(null)}
                className="text-2xl leading-none text-inkmuted"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <HsrImportButton api={{ searchFor: () => {} }} />
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Excel Import Modal */}
      {activeImport === 'stock' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col rounded-lg bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
              <span className="text-[15px] font-bold uppercase tracking-wide">Stock Update Excel Import</span>
              <button
                type="button"
                onClick={() => setActiveImport(null)}
                className="text-2xl leading-none text-inkmuted"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <StockAdjustmentImportButton api={{ searchFor: () => {} }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
