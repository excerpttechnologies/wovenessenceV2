'use client';
import { useState } from 'react';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import { useOptions } from './useOptions';
import { LuUpload } from 'react-icons/lu';

/* Stock Adjustment Excel Import Component
   Allows users to upload Excel/CSV files to perform stock adjustments
*/

function Modal({ title, onClose, children, size = 'md' }) {
  const width = size === 'lg' ? 'max-w-[1120px]' : size === 'sm' ? 'max-w-[460px]' : 'max-w-[760px]';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className={'flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-lg bg-white shadow-xl ' + width}>
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[15px] font-bold uppercase tracking-wide">{title}</span>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-inkmuted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StockAdjustmentImportComponent({ api }) {
  const { business: scopeBusiness, location: scopeLocation, finYear: scopeFinYear } = useScope();
  const { options: locations } = useOptions('companylocations');
  const { options: businesses } = useOptions('business');
  
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [business, setBusiness] = useState(scopeBusiness || '');
  const [targetLocation, setTargetLocation] = useState(scopeLocation || '');
  const [finYear, setFinYear] = useState(scopeFinYear || '');
  const [analysis, setAnalysis] = useState(null);
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
    setError('');
    setResult(null);
    setBusiness(scopeBusiness || '');
    setTargetLocation(scopeLocation || '');
    setFinYear(scopeFinYear || '');
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
      formData.append('business', business || '');
      formData.append('location', target || '');
      formData.append('finYear', finYear || '');
      formData.append('fileName', file.name);

      console.log('Sending to API:', {
        business: business || '',
        location: target || '',
        finYear: finYear || '',
      });

      const response = await fetch('/api/stock-adjustment-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysis(data);
      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('upload');
    } finally {
      setBusy(false);
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
      formData.append('finYear', finYear);
      formData.append('dryRun', dryRun);

      const response = await fetch('/api/stock-adjustment-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStep('complete');
      
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
      <button type="button" className="btn btn-primary" onClick={start}>
        <LuUpload size={14} /> Excel Import
      </button>

      {open && (
        <Modal title="Stock Adjustment Excel Import" onClose={close} size="lg">
          <div className="flex-1 overflow-y-auto p-5">
            {step === 'upload' && (
              <div>
                <p className="mb-3 text-[13px] text-inkmuted">
                  Upload your Excel or CSV file to perform stock adjustments. The file should contain Item Code, Quantity, and Adjustment Type (ADD or REMOVE).
                </p>

                <label htmlFor="stock-business" className="mb-1 block text-[13px] text-ink">
                  Business <span className="text-[12px] text-inkmuted"> (optional)</span>
                </label>
                <select
                  id="stock-business"
                  value={business}
                  disabled={busy}
                  onChange={(e) => { setBusiness(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                >
                  <option value="">Select Business (optional)</option>
                  {businesses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <label htmlFor="stock-target-location" className="mb-1 block text-[13px] text-ink">
                  Target Warehouse <span className="f-req">*</span>
                </label>
                <select
                  id="stock-target-location"
                  value={target}
                  disabled={busy}
                  onChange={(e) => { setTargetLocation(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                >
                  <option value="">Select Target Warehouse</option>
                  {locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <label htmlFor="stock-fin-year" className="mb-1 block text-[13px] text-ink">
                  Financial Year <span className="f-req">*</span>
                </label>
                <input
                  id="stock-fin-year"
                  type="text"
                  value={finYear}
                  disabled={busy}
                  onChange={(e) => { setFinYear(e.target.value); setError(''); }}
                  className="f-input mb-3 w-full"
                  placeholder="e.g. 2024-25"
                />

                <label htmlFor="stock-file" className="mb-1 block text-[13px] text-ink">
                  Excel or CSV File <span className="f-req">*</span>
                </label>
                <input
                  id="stock-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  disabled={busy}
                  className="f-input mb-3 w-full"
                />

                <div className="mt-4 p-4 bg-[#f7f9fc] rounded border border-line">
                  <h4 className="font-semibold text-ink mb-2">Expected Columns:</h4>
                  <ul className="text-[12px] text-inkmuted ml-4">
                    <li><strong>Item Code</strong> - Item code (required)</li>
                    <li><strong>Barcode Number</strong> - Barcode number (optional)</li>
                    <li><strong>Quantity</strong> - Quantity to adjust (required)</li>
                    <li><strong>Adjustment Type</strong> - ADD or REMOVE (required)</li>
                    <li><strong>Reason</strong> - Reason for adjustment (optional)</li>
                  </ul>
                </div>

                {error && <div className="flash flash-err mt-3">{error}</div>}
              </div>
            )}

            {step === 'analyzing' && (
              <div className="text-center py-8">
                <div className="inline-block spin text-2xl text-brand mb-2"></div>
                <p className="text-inkmuted">Analyzing workbook...</p>
              </div>
            )}

            {step === 'preview' && analysis && (
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

                <h3 className="text-[15px] font-bold uppercase tracking-wide mb-4">Sample Records</h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[#f7f9fc]">
                        <th className="px-3 py-2 text-left">Line</th>
                        <th className="px-3 py-2 text-left">Item Code</th>
                        <th className="px-3 py-2 text-left">Barcode</th>
                        <th className="px-3 py-2 text-left">Qty</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.records.sample.map((r, i) => (
                        <tr key={i} className="border-b border-line">
                          <td className="px-3 py-2">{r.line}</td>
                          <td className="px-3 py-2">{r.itemCode || '-'}</td>
                          <td className="px-3 py-2">{r.barcodeNo || '-'}</td>
                          <td className="px-3 py-2">{r.qty || '-'}</td>
                          <td className="px-3 py-2">{r.adjustmentType || '-'}</td>
                          <td className="px-3 py-2">{r.reason || '-'}</td>
                          <td className="px-3 py-2">
                            {r.hasProblems ? (
                              <span className="text-danger">Invalid</span>
                            ) : (
                              <span className="text-okgreen">Valid</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {error && <div className="flash flash-err mt-3">{error}</div>}
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
                      <div>Processed: {result.result.processed || 0}</div>
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

            {step === 'preview' && (
              <>
                <button type="button" className="btn" onClick={() => setStep('upload')} disabled={busy}>
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
