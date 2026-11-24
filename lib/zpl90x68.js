/* ==========================================================================
   90x68 MM ZPL PRINTER CONFIGURATION & GENERATOR
   Reference Baseline: 90x68 PRN FILE (2).prn
   Target Printer: Box XP / BOXP BP 4304e (300 DPI) — ZPL compatible
   ========================================================================== */

import { formatLabelPrice, toLabelData } from '@/lib/barcodeLabelPrint';
import { canonicalBarcodeValue } from '@/lib/barcodeValue';

export const REFERENCE_PRN_CONFIG = {
  labelWidthMm: 90,
  labelHeightMm: 68,
  dpi: 300,
  printWidth: 1033, // ^PW1033 (from master_file.prn)
  labelLength: 803, // 68mm at 300 DPI
  printDarkness: 10,
  printSpeed: null,
  barcodeType: 'Code 128',
  barcodeHeight: 105, // 105 dots — from master_file.prn
  barcodeModuleWidth: 4, // ^BY4 — from master_file.prn
  barcodeOrientation: 'R', // 90° Rotated clockwise — from master_file.prn
  rateFontH: 50, // ^A0R,50,54 — from master_file.prn
  rateFontW: 54,
  barcodeTextH: 38, // ^A0R,38,51 — from master_file.prn
  barcodeTextW: 51,
  idSpacing: 8, // mm — horizontal spacing between barcode number and reference
  printerModel: 'BOXP BP 4304e (300 dpi) - ZPL',
  connectionMode: 'browser_print', // 'browser_print' | 'download_prn' | 'visual_print'
  networkIp: '192.168.1.100',
  networkPort: 9100,
  defaultCopies: 1,
  layoutMode: 'exact_prn', // default to the reference PRN layout
};

export const DEFAULT_ZPL_CONFIG = {
  ...REFERENCE_PRN_CONFIG,
  layoutMode: 'exact_prn',
};

const STORAGE_KEY = 'groo_zpl_printer_config_90x68';

export function loadZplConfig() {
  if (typeof window === 'undefined') return { ...DEFAULT_ZPL_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ZPL_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ZPL_CONFIG, ...parsed };
  } catch (e) {
    console.warn('Failed to load ZPL printer config from localStorage:', e);
    return { ...DEFAULT_ZPL_CONFIG };
  }
}

export function saveZplConfig(config) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save ZPL printer config:', e);
  }
}

export function resetZplConfigToPrnReference() {
  saveZplConfig(REFERENCE_PRN_CONFIG);
  return { ...REFERENCE_PRN_CONFIG };
}

export function resetZplConfigToOptimized() {
  saveZplConfig(DEFAULT_ZPL_CONFIG);
  return { ...DEFAULT_ZPL_CONFIG };
}

/**
 * Clean strings for safe ZPL output (^ and ~ are control characters in ZPL).
 */
export function zplClean(val, maxLen = 45) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\^~]/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Format Code 128 with subset shifts for optimal encoding.
 *
 * Code 128 subset A: uppercase + control chars
 * Code 128 subset B: full ASCII (upper + lower)
 * Code 128 subset C: pairs of digits (compact)
 *
 * The reference PRN uses: >:AAB>5123456
 *   >: = start/switch to subset A
 *   >5 = switch to subset C
 *
 * This produces fewer bars than encoding everything in subset B,
 * which is what makes the physical barcode look cleaner.
 */
export function formatCode128Zpl(barcodeStr) {
  if (!barcodeStr) return '';
  const clean = String(barcodeStr).replace(/[\^~]/g, '').trim();
  if (!clean) return '';

  // Split into letter prefix and digit suffix for optimal subset switching
  const match = /^([A-Za-z]+)(\d+)$/.exec(clean);
  if (match) {
    const letters = match[1].toUpperCase();
    const digits = match[2];
    // Subset C requires even number of digits — pad with leading zero if odd
    if (digits.length % 2 === 0) {
      // >: starts subset A for letters, >5 switches to subset C for digit pairs
      return `>:${letters}>5${digits}`;
    }
    // Odd digits: use subset A for letters, subset B for digits (no C optimisation)
    return `>:${letters}>6${digits}`;
  }

  // Pure digits — use subset C for maximum compactness
  if (/^\d+$/.test(clean)) {
    if (clean.length % 2 === 0) {
      return `>5${clean}`;
    }
    // Odd number of digits: first digit in B, rest in C
    return `>6${clean[0]}>5${clean.substring(1)}`;
  }

  // Mixed or no pattern match — let the printer auto-select (subset B default)
  return clean;
}

/**
 * Extract label data for the ZPL template from a barcode row.
 * Returns all the fields the ZPL templates need.
 */
function extractLabelFields(row, config) {
  const label = toLabelData(row);

  // Barcode number — the unit's own number, e.g. "11A1833"
  const barcodeNo = zplClean(label.barcodeNo || row.barcodeNo || label.barcode || '');

  // Barcode generated reference — e.g. "G1333*05393*1*1"
  let barcodeGenerated = zplClean(label.barcodeGenerated || row.barcodeGenerated || barcodeNo);
  if (barcodeGenerated.includes('*')) {
    const parts = barcodeGenerated.split('*');
    if (parts.length === 3) {
      const unitPart = String(row.qty || row.serialNo || row.billSlNo || row.seq || '1').trim();
      barcodeGenerated = `${parts[0]}*${parts[1]}*${parts[2]}*${unitPart}`;
    }
  }

  // Barcode reference — the composed value for display under the barcode
  const barcodeReference = zplClean(
    canonicalBarcodeValue(label.barcodeReference || label.barcodeGenerated || row.barcodeGenerated || ''),
    45
  );

  // The barcode PAYLOAD — what the scanner reads.
  // MUST be the barcodeNo (e.g. "11A1833") so scanning returns the barcode number.
  const barcodeData = formatCode128Zpl(barcodeNo || barcodeGenerated);

  const description = zplClean(
    row.printDescription || row.supplierDescription || row.itemName || label.description || 'ITEM',
    42
  );
  const category = zplClean(row.subGroupName || row.groupName || row.category || '', 20);

  // Detail Row 1: HSN | Item Code | Cost Code
  const hsn = zplClean(row.hsn || label.hsn || '', 14);
  const itemCode = zplClean(row.itemCode || label.itemCode || '', 16);
  const encodedCostPrice = zplClean(row.encodedCostPrice || label.encodedCostPrice || row.purRateCode || '', 12);

  // Detail Row 2: Supplier Code | Qty | Serial / Offer
  const supplierCode = zplClean(row.supplierCode || row.batchUnique || '', 12);
  const qty = String(row.qty ?? label.quantity ?? 1);
  const uom = String(row.uom || row.uomType || label.unit || 'PC(S)').toUpperCase();
  const qtyText = zplClean(`${qty} ${uom}`, 14);
  const offerPrice = row.offerPrice ? formatLabelPrice(row.offerPrice) : '';
  const serialNo = zplClean(offerPrice || row.serialNo || row.billSlNo || '', 10);

  // RATE line
  const retailPrice = formatLabelPrice(row.retailPrice || row.rsp || label.retailPrice || 0);
  const rateText = `RATE:${retailPrice}/-`;

  return {
    barcodeNo, barcodeGenerated, barcodeReference, barcodeData,
    description, category,
    hsn, itemCode, encodedCostPrice,
    supplierCode, qtyText, serialNo,
    rateText,
  };
}

/**
 * Generate ZPL commands for one label.
 *
 * Layout modes:
 *   exact_prn      — matches the reference PRN file coordinates exactly (rotated 90°)
 *   rotated_full   — rotated 90° with coordinates distributed across full width
 *   preview_match  — horizontal layout matching the browser preview
 */
export function generateSingleLabelZpl(row, cfg = DEFAULT_ZPL_CONFIG, copies = 1) {
  const config = { ...DEFAULT_ZPL_CONFIG, ...cfg };
  const f = extractLabelFields(row, config);
  const numCopies = Math.max(1, Number(copies) || Number(row.copies) || config.defaultCopies || 1);
  const mode = config.layoutMode || 'exact_prn';

  // ── 1. EXACT PRN FILE BASELINE ──────────────────────────────────────────
  // Preserves exact coordinates from "master_file.prn"
  // All text rotated 90° (^A0R), barcode rotated (^BCR)
  // This is the reference layout the Box XP / BOXP BP 4304e printer was tested with.
  if (mode === 'exact_prn') {
    return `^XA
^FO333,177
^BY${config.barcodeModuleWidth || 4}^BCR,${config.barcodeHeight || 105},N,N^FD${f.barcodeData}^FS
^FT295,177
^CI0
^A0R,${config.barcodeTextH || 38},${config.barcodeTextW || 51}^FD${f.barcodeNo}^FS
^FT239,177
^A0R,33,35^FD${f.description}^FS
^FT206,177
^A0R,29,39^FD${f.category}^FS
^FT171,177
^A0R,29,39^FD${f.hsn}^FS
^FT135,177
^A0R,29,39^FD${f.supplierCode}^FS
^FT46,177
^A0R,25,34^FD(Inclusive all taxes)^FS
^FT10,177
^A0R,25,38^FDNo exchange,No Guarantee,,No Return^FS
^FT135,401
^A0R,29,39^FD${f.qtyText}^FS
^FT171,401
^A0R,29,39^FD${f.itemCode}^FS
^FT135,626
^A0R,29,39^FD${f.serialNo}^FS
^FT171,626
^A0R,29,39^FD${f.encodedCostPrice}^FS
^FT77,177
^A0R,${config.rateFontH || 50},${config.rateFontW || 54}^FD${f.rateText}^FS
^FT41,496
^A0R,29,39^FDDRY WASH ONLY ^FS
^FT292,472
^A0R,25,34^FD${f.barcodeGenerated}^FS
^PQ${numCopies},0,1,Y
^XZ`;
  }

  // ── 2. ROTATED FULL MODE ────────────────────────────────────────────────
  // Rotated 90° with coordinates distributed across the full 1063 dot width
  if (mode === 'rotated_full') {
    return `^XA
^PW${config.printWidth || 1063}
^LL${config.labelLength || 803}
^LH0,0
^CI0
^FT850,532^A0R,38,48^FD${f.barcodeGenerated}^FS
^FO920,177^BY${config.barcodeModuleWidth || 4}^BCR,${config.barcodeHeight || 113},N,N^FD${f.barcodeData}^FS
^FT850,177^A0R,${config.barcodeTextH || 42},${config.barcodeTextW || 57}^FD${f.barcodeNo}^FS
^FT690,177^A0R,28,36^FD${f.description}^FS
^FT600,177^A0R,26,34^FD${f.category}^FS
^FT500,177^A0R,26,34^FD${f.hsn}^FS
^FT500,437^A0R,26,34^FD${f.itemCode}^FS
^FT500,673^A0R,26,34^FD${f.encodedCostPrice}^FS
^FT410,177^A0R,26,34^FD${f.supplierCode}^FS
^FT410,461^A0R,26,34^FD${f.qtyText}^FS
^FT410,673^A0R,26,34^FD${f.serialNo}^FS
^FT270,177^A0R,${config.rateFontH || 50},${config.rateFontW || 68}^FD${f.rateText}^FS
^FT200,177^A0R,26,34^FD(Inclusive all taxes)^FS
^FT190,485^A0R,29,39^FDDRY WASH ONLY^FS
^FT90,177^A0R,33,35^FDNo exchange,No Guarantee,No Return^FS
^PQ${numCopies},0,1,Y
^XZ`;
  }

  // ── 3. HORIZONTAL / PREVIEW MATCH MODE ──────────────────────────────────
  // Orientation N (0°), matches the Print Label Picker preview
  const idFontH = config.barcodeTextH || 42;
  const idFontW = config.barcodeTextW || 57;
  const noFontH = idFontH + 8;
  const noFontW = idFontW + 8;
  return `^XA
^PW${config.printWidth || 1063}
^LL${config.labelLength || 803}
^LH0,0
^CI0
^FO860,40^A0N,22,22^FD90x68MM^FS
^FO220,85^BY${config.barcodeModuleWidth || 4}^BCN,${config.barcodeHeight || 113},N,N,N^FD${f.barcodeData}^FS
^FO35,225^FB993,1,0,C^A0N,${idFontH},${idFontW}^FD${f.itemCode}^FS
^FO35,282^FB993,1,0,C^A0N,${noFontH},${noFontW}^FD${f.barcodeNo}^FS
^FO35,338^FB993,1,0,C^A0N,${idFontH},${idFontW}^FD${f.barcodeReference}^FS
^FO35,394^GB993,1,1^FS
^FO35,406^FB993,1,0,L^A0N,32,32^FD${f.description}^FS
^FO35,446^FB993,1,0,L^A0N,28,28^FD${f.category}^FS
^FO35,486^A0N,28,28^FD${f.hsn}^FS
^FO380,486^FB300,1,0,C^A0N,28,28^FD${f.itemCode}^FS
^FO750,486^FB275,1,0,R^A0N,28,28^FD${f.encodedCostPrice}^FS
^FO35,524^A0N,28,28^FD${f.supplierCode}^FS
^FO380,524^FB300,1,0,C^A0N,28,28^FD${f.qtyText}^FS
^FO750,524^FB275,1,0,R^A0N,28,28^FD${f.serialNo}^FS
^FO35,554^GB993,3,3^FS
^FO35,572^A0N,${config.rateFontH || 50},${config.rateFontW || 68}^FD${f.rateText}^FS
^FO650,604^FB375,1,0,R^A0N,26,26^FD(Inclusive all taxes)^FS
^FO35,658^GB993,3,3^FS
^FO35,682^A0N,28,28^FDDRY WASH ONLY^FS
^FO400,682^FB625,1,0,R^A0N,26,26^FDNo exchange,No Guarantee,No Return^FS
^PQ${numCopies},0,1,Y
^XZ`;
}

/**
 * Generate a complete ZPL string for a single label including the setup header.
 * Used for single label preview rendering so Labelary or printer knows the width (^PW1033).
 */
export function getSingleLabelZplWithHeader(row, cfg = DEFAULT_ZPL_CONFIG) {
  const config = { ...DEFAULT_ZPL_CONFIG, ...cfg };
  const speedLine = config.printSpeed ? `^PR${config.printSpeed}\n` : '';
  const headerBlock = `^XA
^SZ2^JMA
^MCY^PMN
^PW${config.printWidth || 1033}^MTT
${speedLine ? speedLine : ''}^JZY
^LH0,0^LRN
^XZ`;
  const label = generateSingleLabelZpl(row, config, 1);
  return `${headerBlock}\n${label}`;
}

/**
 * Generate complete ZPL stream with header configuration and multiple labels.
 */
export function generateBatchZpl90x68(rows, cfg = DEFAULT_ZPL_CONFIG, options = {}) {
  const config = { ...DEFAULT_ZPL_CONFIG, ...cfg };
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return '';

  // Setup header matching reference PRN file
  const speedLine = config.printSpeed ? `^PR${config.printSpeed}\n` : '';
  const headerBlock = `^XA
^SZ2^JMA
^MCY^PMN
^PW${config.printWidth || 1033}^MTT
${speedLine ? speedLine : ''}^JZY
^LH0,0^LRN
^XZ`;

  const labelsBlocks = list.map((row) => {
    const copies = options.copiesMap?.[row.barcodeNo || row._id] || row.copies || config.defaultCopies || 1;
    return generateSingleLabelZpl(row, config, copies);
  });

  return `${headerBlock}\n${labelsBlocks.join('\n')}\n`;
}

/**
 * Trigger client-side browser download of .prn / .zpl file.
 */
export function downloadPrnFile(zplContent, filename = '90x68_barcode_labels.prn') {
  if (typeof window === 'undefined') return;
  const blob = new Blob([zplContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.prn') || filename.endsWith('.zpl') ? filename : `${filename}.prn`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Send raw ZPL to the printer.
 * 1. First tries the local Windows Spooler API (/api/zpl/print) which writes directly
 *    to the connected USB printer (e.g. "BOXP BP 4304e (300 dpi) - ZPL" on USB004).
 * 2. Falls back to Zebra Browser Print service (Port 9100 / 9101) if available.
 */
export async function sendToZebraBrowserPrint(zplContent, targetPrinter = null) {
  if (typeof window === 'undefined') return { success: false, error: 'Browser only' };

  let localSpoolerErr = '';
  const isLocalHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0';

  // 1. Direct print via Windows Spooler API (ONLY when running on local Windows machine)
  if (isLocalHost) {
    try {
      const config = loadZplConfig();
      const printerToUse = targetPrinter || config.printerModel || 'BOXP BP 4304e (300 dpi) - ZPL';

      const res = await fetch('/api/zpl/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zpl: zplContent,
          printerName: printerToUse,
        }),
      });

      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        return { success: true, printerName: d.printerName || printerToUse, method: 'windows_spooler' };
      }
      if (d && d.error) {
        localSpoolerErr = d.error;
      }
    } catch (err) {
      localSpoolerErr = err.message || '';
      console.warn('Local print API failed, trying Zebra daemon:', err);
    }
  }

  // 2. Fallback: Zebra Browser Print Daemon on localhost:9100 / 9101 (HTTP & HTTPS)
  const tryEndpoint = async (baseUrl) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const defaultRes = await fetch(`${baseUrl}/default?type=printer`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!defaultRes.ok) throw new Error('No default printer found');
      const printer = await defaultRes.json();
      if (!printer || !printer.name) throw new Error('Invalid printer object');

      const printRes = await fetch(`${baseUrl}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          device: printer,
          data: zplContent,
        }),
      });

      if (!printRes.ok) throw new Error(`Status ${printRes.status}`);
      return { success: true, printerName: printer.name, method: 'zebra_browser_print' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const endpoints = [
    'http://127.0.0.1:9100',
    'https://127.0.0.1:9101',
    'http://localhost:9100',
    'https://localhost:9101',
  ];

  for (const ep of endpoints) {
    const result = await tryEndpoint(ep);
    if (result.success) {
      return result;
    }
  }

  // 3. Fallback error message - clean, clear and actionable:
  let finalErr = 'Direct print is unavailable.';
  if (localSpoolerErr.includes('not physically connected') || localSpoolerErr.includes('Offline')) {
    finalErr = localSpoolerErr;
  } else if (localSpoolerErr.includes('not installed')) {
    finalErr = localSpoolerErr;
  } else if (localSpoolerErr && !localSpoolerErr.includes('ENOENT') && !localSpoolerErr.includes('powershell') && !localSpoolerErr.includes('Windows Print Spooler is only available')) {
    finalErr = localSpoolerErr;
  } else if (!isLocalHost) {
    finalErr = 'Direct RAW printing from a hosted Linux server requires Zebra Browser Print running on your PC. Alternatively, use "Print (90×68 mm)" for instant browser printing or "Download .PRN File".';
  } else {
    finalErr = 'Direct print service is unavailable. (Tip: Ensure Zebra Browser Print is running, or use "Download .PRN File")';
  }

  return { success: false, error: finalErr, canDownloadPrn: true };
}

export const sendDirectZplPrint = sendToZebraBrowserPrint;

/**
 * Generate a sample PRN string for testing.
 */
export function generateTestPrn(count = 1, cfg = DEFAULT_ZPL_CONFIG) {
  const sampleItems = [
    {
      barcodeNo: 'AAB123456',
      barcodeGenerated: 'G126*4595*1*99',
      printDescription: '(SM)PURE SILK CREPE WITH ZARI DETAIL',
      subGroupName: 'SAREE',
      hsn: '601',
      itemCode: '15 PCRP',
      purRateCode: 'HIWBB',
      supplierCode: 'AMTFT',
      qty: 1,
      uom: 'PC(S)',
      retailPrice: 29450,
      serialNo: '26532',
      copies: 1,
    },
    {
      barcodeNo: 'AAB123457',
      barcodeGenerated: 'G126*4595*1*2302',
      printDescription: 'KANJIVARAM SILK SAREE EMBROIDERY',
      subGroupName: 'SAREE',
      hsn: '50072090',
      itemCode: '16-KNJV',
      purRateCode: 'HJXCC',
      supplierCode: 'AMTFT',
      qty: 1,
      uom: 'PC(S)',
      retailPrice: 34500,
      serialNo: '26533',
      copies: 1,
    },
  ];

  const rows = [];
  for (let i = 0; i < count; i++) {
    const base = sampleItems[i % sampleItems.length];
    rows.push({
      ...base,
      barcodeNo: `AAB${String(123456 + i).padStart(6, '0')}`,
      barcodeGenerated: i === 0 ? 'G126*4595*1*99' : `G126*4595*1*${2301 + i}`,
      serialNo: String(26532 + i),
    });
  }

  return generateBatchZpl90x68(rows, cfg);
}
