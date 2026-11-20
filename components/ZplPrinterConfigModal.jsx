'use client';
import { useState, useEffect } from 'react';
import Icon from './Icon';
import {
  DEFAULT_ZPL_CONFIG,
  REFERENCE_PRN_CONFIG,
  loadZplConfig,
  saveZplConfig,
  resetZplConfigToPrnReference,
  resetZplConfigToOptimized,
  generateTestPrn,
  downloadPrnFile,
  sendToZebraBrowserPrint,
} from '@/lib/zpl90x68';

export default function ZplPrinterConfigModal({ open, onClose, onSave }) {
  const [cfg, setCfg] = useState(DEFAULT_ZPL_CONFIG);
  const [testStatus, setTestStatus] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [installedPrinters, setInstalledPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  useEffect(() => {
    if (open) {
      setCfg(loadZplConfig());
      setTestStatus('');
      setSavedSuccess(false);

      // Query installed Windows printers
      setLoadingPrinters(true);
      fetch('/api/zpl/printers')
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.printers)) {
            setInstalledPrinters(d.printers);
            // If current model is generic or not set, default to detected printer
            if (!cfg.printerModel || cfg.printerModel.includes('Zebra Thermal')) {
              if (d.recommended) {
                setCfg((prev) => ({ ...prev, printerModel: d.recommended }));
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingPrinters(false));
    }
  }, [open]);

  if (!open) return null;

  const handleChange = (field, val) => {
    setCfg((prev) => ({ ...prev, [field]: val }));
    setSavedSuccess(false);
  };

  const handleSave = () => {
    saveZplConfig(cfg);
    setSavedSuccess(true);
    if (onSave) onSave(cfg);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleResetToPrn = () => {
    const ref = resetZplConfigToPrnReference();
    setCfg(ref);
    if (onSave) onSave(ref);
  };

  const handleResetToOptimized = () => {
    const opt = resetZplConfigToOptimized();
    setCfg(opt);
    if (onSave) onSave(opt);
  };

  const handleDownloadTestPrn = (count = 1) => {
    const zpl = generateTestPrn(count, cfg);
    downloadPrnFile(zpl, `test_${count}_labels_90x68.prn`);
    setTestStatus(`Downloaded ${count} label test PRN file.`);
  };

  const handleDirectTestPrint = async (count = 1) => {
    setTestStatus(`Connecting to Zebra printer for ${count} test label...`);
    const zpl = generateTestPrn(count, cfg);
    const res = await sendToZebraBrowserPrint(zpl);
    if (res.success) {
      setTestStatus(`Sent to printer "${res.printerName}" successfully!`);
    } else {
      setTestStatus(
        `Direct print failed: ${res.error}. (Tip: Ensure Zebra Browser Print is running, or use "Download .PRN File")`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[650px] flex-col rounded-xl bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-brand/10 text-brand">
              <Icon name="printer" size={16} />
            </span>
            <h3 className="text-[16px] font-bold text-slate-900">
              90×68 MM ZPL Printer Configuration
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[13px]">
          {savedSuccess && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">
              Printer configuration saved successfully!
            </div>
          )}

          {/* Section 1: Media & Dimensions */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <h4 className="font-semibold text-slate-800 mb-2.5">
              1. Physical Label &amp; Printhead Dimensions
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Label Width (mm)
                </label>
                <input
                  type="number"
                  value={cfg.labelWidthMm}
                  readOnly
                  className="w-full rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Label Height (mm)
                </label>
                <input
                  type="number"
                  value={cfg.labelHeightMm}
                  readOnly
                  className="w-full rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Printer DPI
                </label>
                <select
                  value={cfg.dpi}
                  onChange={(e) => {
                    const dpi = Number(e.target.value);
                    const printWidth = dpi === 203 ? 720 : 1063;
                    setCfg((prev) => ({ ...prev, dpi, printWidth }));
                  }}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800"
                >
                  <option value={300}>300 DPI (11.8 dpmm) - Recommended</option>
                  <option value={203}>203 DPI (8.0 dpmm)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Print Width (^PW dots)
                </label>
                <input
                  type="number"
                  value={cfg.printWidth}
                  onChange={(e) => handleChange('printWidth', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Darkness (^MD 0-30)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={cfg.printDarkness}
                  onChange={(e) => handleChange('printDarkness', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Speed (^PR in/sec)
                </label>
                <select
                  value={cfg.printSpeed}
                  onChange={(e) => handleChange('printSpeed', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800"
                >
                  <option value={2}>2 ips (High Quality)</option>
                  <option value={3}>3 ips</option>
                  <option value={4}>4 ips (Standard)</option>
                  <option value={5}>5 ips</option>
                  <option value={6}>6 ips (Fast)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Barcode Configuration */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <h4 className="font-semibold text-slate-800 mb-2.5">
              2. Barcode &amp; Text Sizing
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Barcode Type
                </label>
                <input
                  type="text"
                  value={cfg.barcodeType}
                  readOnly
                  className="w-full rounded border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Module Width (^BY)
                </label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={cfg.barcodeModuleWidth}
                  onChange={(e) => handleChange('barcodeModuleWidth', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Barcode Height
                </label>
                <input
                  type="number"
                  min="40"
                  max="200"
                  value={cfg.barcodeHeight}
                  onChange={(e) => handleChange('barcodeHeight', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Layout &amp; Orientation
                </label>
                <select
                  value={cfg.layoutMode || 'preview_match'}
                  onChange={(e) => {
                    const mode = e.target.value;
                    const barcodeOrientation = mode === 'preview_match' ? 'N' : 'R';
                    setCfg((prev) => ({ ...prev, layoutMode: mode, barcodeOrientation }));
                  }}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800"
                >
                  <option value="preview_match">Horizontal (Matches Preview 1:1) - Recommended</option>
                  <option value="rotated_full">90° Rotated (Distributed Full Width)</option>
                  <option value="exact_prn">Exact PRN Baseline (Unscaled)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  RATE Font Height
                </label>
                <input
                  type="number"
                  value={cfg.rateFontH}
                  onChange={(e) => handleChange('rateFontH', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  RATE Font Width
                </label>
                <input
                  type="number"
                  value={cfg.rateFontW}
                  onChange={(e) => handleChange('rateFontW', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Code Text Font H
                </label>
                <input
                  type="number"
                  value={cfg.barcodeTextH}
                  onChange={(e) => handleChange('barcodeTextH', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Code Text Font W
                </label>
                <input
                  type="number"
                  value={cfg.barcodeTextW}
                  onChange={(e) => handleChange('barcodeTextW', Number(e.target.value))}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Printer Model & Connection Method */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
            <h4 className="font-semibold text-slate-800 mb-2.5">
              3. Printer Model &amp; Communication Method
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Target Windows Printer {loadingPrinters ? '(Detecting...)' : ''}
                </label>
                {installedPrinters.length > 0 ? (
                  <select
                    value={cfg.printerModel}
                    onChange={(e) => handleChange('printerModel', e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800"
                  >
                    {installedPrinters.map((p) => (
                      <option key={p.Name} value={p.Name}>
                        {p.Name} {p.PortName ? `(${p.PortName})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={cfg.printerModel}
                    onChange={(e) => handleChange('printerModel', e.target.value)}
                    placeholder="e.g. BOXP BP 4304e (300 dpi) - ZPL"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                )}
                <div className="mt-1 text-[11px] text-slate-500">
                  Detected USB Printer: <span className="font-semibold text-brand">BOXP BP 4304e (300 dpi) - ZPL</span> on USB004
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-slate-600 mb-1">
                  Default Print Method
                </label>
                <select
                  value={cfg.connectionMode}
                  onChange={(e) => handleChange('connectionMode', e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-medium text-slate-800"
                >
                  <option value="browser_print">Direct Print to USB Spooler (Recommended)</option>
                  <option value="download_prn">Download .PRN File</option>
                  <option value="visual_print">Visual 90×68 mm High-Res PDF Print</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Testing & Presets */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3.5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-amber-900">
                4. Test Printer Output &amp; Presets
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleResetToPrn}
                  className="text-[11.5px] text-slate-600 underline hover:text-slate-900"
                  title="Restore exact values from 90x68 PRN FILE.prn"
                >
                  Load PRN File Defaults
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={handleResetToOptimized}
                  className="text-[11.5px] text-brand font-medium underline hover:text-brand-dark"
                  title="Apply optimized font and barcode sizing"
                >
                  Load Optimized Sizing
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => handleDownloadTestPrn(1)}
                className="btn btn-sm bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Download Test PRN (1 Label)
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTestPrn(2)}
                className="btn btn-sm bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Download Test PRN (2 Labels)
              </button>
              <button
                type="button"
                onClick={() => handleDirectTestPrint(1)}
                className="btn btn-sm border-brand text-brand bg-brand/5 hover:bg-brand hover:text-white"
              >
                Test Direct Print (Zebra USB)
              </button>
            </div>

            {testStatus && (
              <div className="mt-2.5 text-[12px] font-medium text-slate-700 bg-white/80 p-2 rounded border border-amber-200">
                {testStatus}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="btn bg-white border-slate-300 text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary px-5"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
