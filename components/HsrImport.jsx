'use client';
import { useState } from 'react';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { useOptions } from './useOptions';
import { IMPORT_OPERATIONS, IMPORT_OPERATION_LABELS, IMPORT_OPERATION_DESCRIPTIONS } from '@/lib/hsrImportConstants';

/* HSR Import Component
   Extends the existing Barcode Report Import functionality to support HSR opening stock
   with operation selection, warehouse reconciliation, and detailed preview.
*/

const STATUS = {
  pending: { label: 'READY TO ANALYZE', tone: 'bg-okgreenbg text-okgreen' },
  analyzing: { label: 'ANALYZING...', tone: 'bg-[#eef2f8] text-inkmuted' },
  ready: { label: 'READY TO IMPORT', tone: 'bg-okgreenbg text-okgreen' },
  completed: { label: 'IMPORT COMPLETED', tone: 'bg-okgreenbg text-okgreen' },
  error: { label: 'ERROR', tone: 'bg-[#fdecec] text-danger' },
};

function Modal({ title, onClose, children, size = 'md', headerAction }) {
  const width = size === 'lg' ? 'max-w-[1120px]' : size === 'sm' ? 'max-w-[460px]' : 'max-w-[760px]';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className={'flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-lg bg-white shadow-xl ' + width}>
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[15px] font-bold uppercase tracking-wide">{title}</span>
          <div className="flex items-center gap-1">
            {headerAction}
            <button type="button" onClick={onClose} className="text-2xl leading-none text-inkmuted" aria-label="Close">×</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function HsrImportComponent({ api }) {
  const { business: scopeBusiness, location: scopeLocation, finYear: scopeFinYear } = useScope();
  const { options: locations } = useOptions('companylocations');
  const { options: stockPoints } = useOptions('stockpoints');
  const { options: businesses } = useOptions('business');
  
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload'); // upload, select-operation, preview, complete
  const [selectedFile, setSelectedFile] = useState(null);
  const [business, setBusiness] = useState(scopeBusiness || '');
  const [targetLocation, setTargetLocation] = useState(scopeLocation || '');
  const [sourceLocation, setSourceLocation] = useState('');
  const [finYear, setFinYear] = useState(scopeFinYear || '');
  const [selectedOperation, setSelectedOperation] = useState(IMPORT_OPERATIONS.ADD_STOCK);
  const [analysis, setAnalysis] = useState(null);
  const [masterResolution, setMasterResolution] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const target = targetLocation || scopeLocation || '';

  function start() {
    setOpen(true);
    setStep('upload');
    setSelectedFile(null);
    setAnalysis(null);
    setMasterResolution(null);
    setReconciliation(null);
    setError('');
    setResult(null);
    setBusiness(scopeBusiness || '');
    setTargetLocation(scopeLocation || '');
    setSourceLocation('');
    setFinYear(scopeFinYear || '');
    setSelectedOperation(IMPORT_OPERATIONS.ADD_STOCK);
    setDryRun(true);
  }

  const close = () => {
    if (!busy) setOpen(false);
  };

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSelectedFile(file);
    setError('');
    await analyzeWorkbook(file);
  }

  async function analyzeWorkbook(file) {
    setBusy(true);
    setStep('analyzing');
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'analyze');
      formData.append('business', business);
      formData.append('location', target);
      formData.append('sourceLocation', sourceLocation);
      formData.append('finYear', finYear);
      formData.append('operation', selectedOperation);
      formData.append('fileName', file.name);

      const response = await fetch('/api/hsr-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysis(data);
      setMasterResolution(data.masters);
      setReconciliation(data.reconciliation);
      setStep('select-operation');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    } finally {
      setBusy(false);
    }
  }

  async function handleOperationChange(newOperation) {
    setSelectedOperation(newOperation);
    if (selectedFile) {
      await analyzeWorkbook(selectedFile);
    }
  }

  async function handleImport() {
    setBusy(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', 'execute');
      formData.append('business', business);
      formData.append('location', target);
      formData.append('sourceLocation', sourceLocation);
      formData.append('finYear', finYear);
      formData.append('operation', selectedOperation);
      formData.append('dryRun', dryRun);

      const response = await fetch('/api/hsr-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep('complete');
      
      // Refresh the report if not dry run
      if (!dryRun && data.result) {
        api?.searchFor({});
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={start}>
        <Icon name="upload" size={14} /> HSR Import
      </button>

      {open && (
        <Modal title="HSR Opening Stock Import" onClose={close} size="lg">
          <div className="flex-1 overflow-y-auto p-5">
            {step === 'upload' && (
              <div>
                <p className="mb-3 text-[13px] text-inkmuted">
                  Upload your HSR opening stock Excel file to analyze and import. The system will validate the workbook,
                  resolve master data, and show you a detailed preview before any changes are made to the database.
                </p>

                <label htmlFor="hsr-business" className="mb-1 block text-[13px] text-ink">
                  Business <span className="text-[12px] text-inkmuted"> (optional)</span>
                </label>
                <select
                  id="hsr-business"
                  value={business}
                  disabled={busy}
                  onChange={(e) => { setBusiness(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                >
                  <option value="">Select Business (optional)</option>
                  {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <label htmlFor="hsr-target-location" className="mb-1 block text-[13px] text-ink">
                  Target Warehouse <span className="f-req">*</span>
                </label>
                <select
                  id="hsr-target-location"
                  value={target}
                  disabled={busy}
                  onChange={(e) => { setTargetLocation(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                >
                  <option value="">Select Target Warehouse</option>
                  {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <label htmlFor="hsr-source-location" className="mb-1 block text-[13px] text-ink">
                  Source Warehouse <span className="text-[12px] text-inkmuted"> (for transfer operation only)</span>
                </label>
                <select
                  id="hsr-source-location"
                  value={sourceLocation}
                  disabled={busy}
                  onChange={(e) => { setSourceLocation(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                >
                  <option value="">Select Source Warehouse (optional)</option>
                  {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <label htmlFor="hsr-fin-year" className="mb-1 block text-[13px text-ink">
                  Financial Year <span className="f-req">*</span>
                </label>
                <input
                  id="hsr-fin-year"
                  type="text"
                  value={finYear}
                  disabled={busy}
                  onChange={(e) => { setFinYear(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                  placeholder="e.g. 2024-25"
                />

                <label htmlFor="hsr-file" className="mb-1 block text-[13px] text-ink">
                  Excel or CSV File <span className="f-req">*</span>
                </label>
                <input
                  id="hsr-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  disabled={busy}
                  className="f-input mb-3 w-full"
                />

                {error && <div className="flash flash-err mt-3">{error}</div>}
              </div>
            )}

            {step === 'analyzing' && (
              <div className="text-center py-8">
                <div className="inline-block spin text-2xl text-brand mb-2"></div>
                <p className="text-inkmuted">Analyzing workbook...</p>
              </div>
            )}

            {step === 'select-operation' && analysis && (
              <div>
                <h3 className="text-[15px] font-bold uppercase tracking-wide mb-4">Workbook Analysis</h3>
                
                <div className="mb-4 p-4 bg-[#f7f9fc] rounded border border-line">
                  <div className="grid grid-cols-2 gap-4 text-[13px]">
                    <div>
                      <span className="text-inkmuted">File:</span>
                      <div className="font-semibold text-ink">{analysis.workbook.fileName}</div>
                    </div>
                    <div>
                      <span className="text-inkmuted">Sheet:</span>
                      <div className="font-semibold text-ink">{analysis.workbook.sheetName}</div>
                    </div>
                    <div>
                      <span className="text-inkmuted">Total Rows:</span>
                      <div className="font-semibold text-ink">{analysis.workbook.totalRows.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-inkmuted">Valid Rows:</span>
                      <div className="font-semibold text-okgreen">{analysis.workbook.validRows.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-inkmuted">Invalid Rows:</span>
                      <div className="font-semibold text-danger">{analysis.workbook.invalidRows.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-inkmuted">Ignored:</span>
                      <div className="font-semibold text-inkmuted">{analysis.workbook.ignored.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <h3 className="text-[15px] font-bold uppercase tracking-wide mb-4">Master Data Resolution</h3>
                
                {masterResolution && (
                  <div className="mb-4 p-4 bg-[#f7f9fc] rounded border border-line">
                    <div className="text-[13px] mb-2">
                      <span className="text-inkmuted">Masters Matched:</span>
                      <span className="font-semibold text-okgreen ml-2">{masterResolution.matched.toLocaleString()}</span>
                    </div>
                    
                    {masterResolution.unmatched.length > 0 && (
                      <div className="text-[13px] text-danger">
                        <span className="font-semibold">Missing Masters:</span>
                        <ul className="mt-2 ml-4">
                          {masterResolution.unmatched.slice(0, 10).map((u, i) => (
                            <li key={i}>
                              {u.type}: {u.name} ({u.rows.length} rows)
                            </li>
                          ))}
                          {masterResolution.unmatched.length > 10 && (
                            <li>... and {masterResolution.unmatched.length - 10} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <h3 className="text-[15px font-bold uppercase tracking-wide mb-4">Select Import Operation</h3>
                
                <div className="space-y-2 mb-4">
                  {Object.entries(IMPORT_OPERATIONS).map(([key, label]) => (
                    <label key={key} className="flex items-start gap-3 p-3 border border-line rounded hover:bg-[#f7f9fc] cursor-pointer">
                      <input
                        type="radio"
                        name="hsr-operation"
                        value={key}
                        checked={selectedOperation === key}
                        onChange={(e) => handleOperationChange(e.target.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-ink">{IMPORT_OPERATION_LABELS[key]}</div>
                        <div className="text-[12px] text-inkmuted mt-1">{IMPORT_OPERATION_DESCRIPTIONS[key]}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {reconciliation && reconciliation.summary.warnings.length > 0 && (
                  <div className="mb-4 p-4 bg-[#fff8e6] border border-[#e7c96b] rounded">
                    <div className="font-semibold text-[#8a5a00] mb-2">Warnings:</div>
                    <ul className="text-[12px] text-[#8a5a00] ml-4">
                      {reconciliation.summary.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && <div className="flash flash-err mt-3">{error}</div>}
              </div>
            )}

            {step === 'preview' && (
              <div>
                <h3 className="text-mb-4">Import Preview</h3>
                {/* Preview table would go here */}
                <p className="text-inkmuted">Preview functionality coming soon...</p>
              </div>
            )}

            {step === 'complete' && result && (
              <div>
                <div className="p-4 bg-okgreenbg text-okgreen rounded mb-4">
                  <div className="font-semibold text-lg mb-2">
                    {result.dryRun ? 'Dry Run Complete' : 'Import Complete'}
                  </div>
                  {result.dryRun && (
                    <p className="text-sm">No changes were made to the database. Uncheck "Dry Run" to execute the actual import.</p>
                  )}
                </div>

                {result.result && (
                  <div className="p-4 bg-[#f7f9fc] rounded border border-line">
                    <h4 className="font-semibold mb-2">Results:</h4>
                    <div className="text-[13px] space-y-1">
                      <div>Total Records: {result.result.total || 0}</div>
                      <div>Inserted: {result.result.inserted || 0}</div>
                      <div>Updated: {result.result.updated || 0}</div>
                      <div>Replaced: {result.result.replaced || 0}</div>
                      <div>Added: {result.result.added || 0}</div>
                      <div>Transferred: {result.result.transferred || 0}</div>
                      <div>Skipped: {result.result.skipped || 0}</div>
                      <div>Failed: {result.result.failed || 0}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
            {step === 'upload' && (
              <>
                <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => selectedFile ? handleImport() : setError('Please select a file first')}
                  disabled={busy || !selectedFile}
                >
                  {busy ? <span className="spin" /> : <Icon name="check" size={14} />} Analyze
                </button>
              </>
            )}

            {step === 'select-operation' && (
              <>
                <button type="button" className="btn" onClick={() => setStep('upload')} disabled={busy}>
                  <Icon name="back" size={14} /> Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStep('preview')}
                  disabled={busy}
                >
                  <Icon name="arrow-right" size={14} /> Preview
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                <button type="button" className="btn" onClick={() => setStep('select-operation')} disabled={busy}>
                  <Icon name="back" size={14} /> Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={busy}
                >
                  {busy ? <span className="spin" /> : <Icon name="check" size={14} />} {dryRun ? 'Dry Run' : 'Import'}
                </button>
              </>
            )}

            {step === 'complete' && (
              <button type="button" className="btn btn-primary" onClick={close}>
                Close
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
