/* ==========================================================================
   90x68 MM ZPL PRINTER CONFIGURATION & GENERATOR
   Reference Baseline: 90x68 PRN FILE.prn
   Target Printer: Zebra ZPL Thermal Transfer / Direct Thermal (300 DPI / 203 DPI)
   ========================================================================== */

import { formatLabelPrice, toLabelData } from '@/lib/barcodeLabelPrint';

export const REFERENCE_PRN_CONFIG = {
  labelWidthMm: 90,
  labelHeightMm: 68,
  dpi: 300,
  printWidth: 1063, // ^PW1063 (90mm at 300 DPI)
  labelLength: 803, // 68mm at 300 DPI
  printDarkness: 10, // ^MD10
  printSpeed: 4, // ^PR4 (inches per second)
  barcodeType: 'Code 128',
  barcodeHeight: 113, // 113 dots
  barcodeModuleWidth: 4, // ^BY4
  barcodeOrientation: 'R', // 90° Rotated clockwise
  rateFontH: 50, // ^A0R,50,68
  rateFontW: 68,
  barcodeTextH: 42, // ^A0R,42,57
  barcodeTextW: 57,
  printerModel: 'BOXP BP 4304e (300 dpi) - ZPL',
  connectionMode: 'browser_print', // 'browser_print' | 'download_prn' | 'visual_print'
  networkIp: '192.168.1.100',
  networkPort: 9100,
  defaultCopies: 1,
  layoutMode: 'preview_match', // 'preview_match' | 'rotated_full' | 'exact_prn'
};

export const DEFAULT_ZPL_CONFIG = {
  ...REFERENCE_PRN_CONFIG,
  layoutMode: 'preview_match', // Default: matches Print Label Picker preview 1:1 across 90×68mm
  barcodeModuleWidth: 3,
  barcodeHeight: 120,
  rateFontH: 64,
  rateFontW: 70,
  barcodeTextH: 44,
  barcodeTextW: 44,
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
 * Format Code 128 subset shift if applicable (e.g., >:AAB>5123456).
 */
export function formatCode128Zpl(barcodeStr) {
  if (!barcodeStr) return '';
  const clean = String(barcodeStr).replace(/[\^~]/g, '').trim();
  // If format is 2-4 uppercase letters followed by even number of digits (like AAB123456)
  const match = /^([A-Za-z]+)(\d+)$/.exec(clean);
  if (match) {
    const letters = match[1];
    const digits = match[2];
    // Subset C requires even number of digits
    if (digits.length % 2 === 0) {
      return `>:${letters}>5${digits}`;
    }
  }
  return clean;
}

/**
 * Generate ZPL commands for one label based on the 90x68 PRN template.
 */
export function generateSingleLabelZpl(row, cfg = DEFAULT_ZPL_CONFIG, copies = 1) {
  const label = toLabelData(row);
  const config = { ...DEFAULT_ZPL_CONFIG, ...cfg };

  // Data mapping from database values
  const barcodeNo = zplClean(label.barcodeNo || row.barcodeNo || label.barcode || '');
  let barcodeGenerated = zplClean(label.barcodeGenerated || row.barcodeGenerated || barcodeNo);

  // Ensure the composed barcode carries all 4 segments (Supplier*GRC*BillSlNo*Serial, e.g. G126*4595*1*2301)
  if (barcodeGenerated.includes('*')) {
    const parts = barcodeGenerated.split('*');
    if (parts.length === 3) {
      const unitPart = String(row.serialNo || row.billSlNo || row.seq || '1').trim();
      barcodeGenerated = `${parts[0]}*${parts[1]}*${parts[2]}*${unitPart}`;
    }
  }

  const barcodeData = formatCode128Zpl(barcodeNo || barcodeGenerated);

  // ZPL block matching 90x68 PRN file structure

  const description = zplClean(
    row.printDescription || row.supplierDescription || row.itemName || label.description || 'ITEM',
    42
  );
  const category = zplClean(row.subGroupName || row.groupName || row.category || 'SAREE', 20);

  // Detail Row 1 (HSN | Item Code | Cost Code)
  const hsn = zplClean(row.hsn || label.hsn || '601', 14);
  const itemCode = zplClean(row.itemCode || label.itemCode || 'ITEM', 16);
  const encodedCostPrice = zplClean(row.encodedCostPrice || label.encodedCostPrice || row.purRateCode || '', 12);

  // Detail Row 2 (Supplier Code / Batch | Qty | Offer Price / Serial)
  const supplierCode = zplClean(row.supplierCode || row.batchUnique || 'AMTFT', 12);
  const qty = String(row.qty ?? label.quantity ?? 1);
  const uom = String(row.uom || row.uomType || label.unit || 'PC(S)').toUpperCase();
  const qtyText = zplClean(`${qty} ${uom}`, 14);
  const offerPrice = row.offerPrice ? formatLabelPrice(row.offerPrice) : '';
  const serialNo = zplClean(offerPrice || row.serialNo || row.billSlNo || '', 10);

  // RATE line
  const retailPrice = formatLabelPrice(row.retailPrice || row.rsp || label.retailPrice || 0);
  const rateText = `RATE:${retailPrice}/-`;

  const numCopies = Math.max(1, Number(copies) || Number(row.copies) || config.defaultCopies || 1);
  const mode = config.layoutMode || 'preview_match';

  // 1. HORIZONTAL / PREVIEW MATCH MODE (Orientation 'N' 0°)
  // Matches the Print Label Picker preview 100%, filling the full 90×68mm area
  // Width: 1063 dots (90mm @ 300 DPI), Height: 803 dots (68mm @ 300 DPI)
  if (mode === 'preview_match' || config.barcodeOrientation === 'N') {
    /* THREE LINES centred under the bars: item code, the unit's own barcode
       number (set a step larger - it is the field the operator keys in),
       then the generated barcode reference. Everything below them keeps its
       order and moves down together into the space the taller identifier
       block needs, still well inside the 803-dot label length. */
    const idFontH = config.barcodeTextH || 44;
    const idFontW = config.barcodeTextW || 44;
    const noFontH = idFontH + 8;
    const noFontW = idFontW + 8;
    return `^XA
^PW${config.printWidth || 1063}
^LL${config.labelLength || 803}
^LH0,0
^CI0
^FO860,40^A0N,22,22^FD90x68MM^FS
^FO220,85^BY${config.barcodeModuleWidth || 3}^BCN,${config.barcodeHeight || 120},N,N,N^FD${barcodeData}^FS
^FO35,225^FB993,1,0,C^A0N,${idFontH},${idFontW}^FD${itemCode}^FS
^FO35,282^FB993,1,0,C^A0N,${noFontH},${noFontW}^FD${barcodeNo}^FS
^FO35,338^FB993,1,0,C^A0N,${idFontH},${idFontW}^FD${barcodeReference}^FS
^FO35,394^GB993,1,1^FS
^FO35,406^FB993,1,0,L^A0N,32,32^FD${description}^FS
^FO35,446^FB993,1,0,L^A0N,28,28^FD${category}^FS
^FO35,486^A0N,28,28^FD${hsn}^FS
^FO380,486^FB300,1,0,C^A0N,28,28^FD${itemCode}^FS
^FO750,486^FB275,1,0,R^A0N,28,28^FD${encodedCostPrice}^FS
^FO35,524^A0N,28,28^FD${supplierCode}^FS
^FO380,524^FB300,1,0,C^A0N,28,28^FD${qtyText}^FS
^FO750,524^FB275,1,0,R^A0N,28,28^FD${serialNo}^FS
^FO35,554^GB993,3,3^FS
^FO35,572^A0N,${config.rateFontH || 64},${config.rateFontW || 70}^FD${rateText}^FS
^FO650,604^FB375,1,0,R^A0N,26,26^FD(Inclusive all taxes)^FS
^FO35,658^GB993,3,3^FS
^FO35,682^A0N,28,28^FDDRY WASH ONLY^FS
^FO400,682^FB625,1,0,R^A0N,26,26^FDNo exchange,No Guarantee,No Return^FS
^PQ${numCopies},0,1,Y
^XZ`;
  }

  // 2. ROTATED FULL MODE (Orientation 'R' 90° clockwise, scaled to fill full 1063 dots)
  // Fixes upper-portion cramping: distributes coordinates across the full 90mm width
  if (mode === 'rotated_full') {
    return `^XA
^PW${config.printWidth || 1063}
^LL${config.labelLength || 803}
^LH0,0
^CI0
^FT850,532^A0R,38,48^FD${barcodeGenerated}^FS
^FO920,177^BY${config.barcodeModuleWidth || 3}^BCR,${config.barcodeHeight || 113},N,N^FD${barcodeData}^FS
^FT850,177^A0R,${config.barcodeTextH || 46},${config.barcodeTextW || 62}^FD${barcodeNo}^FS
^FT690,177^A0R,28,36^FD${description}^FS
^FT600,177^A0R,26,34^FD${category}^FS
^FT500,177^A0R,26,34^FD${hsn}^FS
^FT500,437^A0R,26,34^FD${itemCode}^FS
^FT500,673^A0R,26,34^FD${encodedCostPrice}^FS
^FT410,177^A0R,26,34^FD${supplierCode}^FS
^FT410,461^A0R,26,34^FD${qtyText}^FS
^FT410,673^A0R,26,34^FD${serialNo}^FS
^FT270,177^A0R,${config.rateFontH || 56},${config.rateFontW || 76}^FD${rateText}^FS
^FT200,177^A0R,26,34^FD(Inclusive all taxes)^FS
^FT190,485^A0R,29,39^FDDRY WASH ONLY^FS
^FT90,177^A0R,33,35^FDNo exchange,No Guarantee,No Return^FS
^PQ${numCopies},0,1,Y
^XZ`;
  }

  // 3. EXACT PRN FILE BASELINE MODE
  // Preserves exact coordinates from 90x68 PRN FILE.prn
  return `^XA
^PW${config.printWidth || 1063}
^LL${config.labelLength || 803}
^LH0,0
^CI0
^FT331,532^A0R,38,48^FD${barcodeGenerated}^FS
^FO${config.barcodeX || 376},${config.barcodeY || 177}^BY${config.barcodeModuleWidth || 4}^BC${config.barcodeOrientation || 'R'},${config.barcodeHeight || 113},N,N^FD${barcodeData}^FS
^FT337,177^A0R,${config.barcodeTextH || 42},${config.barcodeTextW || 57}^FD${barcodeNo}^FS
^FT273,177^A0R,25,33^FD${description}^FS
^FT84,177^A0R,25,34^FD(Inclusive all taxes)^FS
^FT118,177^A0R,${config.rateFontH || 50},${config.rateFontW || 68}^FD${rateText}^FS
^FT237,177^A0R,25,34^FD${category}^FS
^FT202,177^A0R,25,34^FD${hsn}^FS
^FT202,437^A0R,25,34^FD${itemCode}^FS
^FT202,673^A0R,25,34^FD${encodedCostPrice}^FS
^FT166,177^A0R,25,34^FD${supplierCode}^FS
^FT166,461^A0R,25,34^FD${qtyText}^FS
^FT167,673^A0R,25,34^FD${serialNo}^FS
^FT80,485^A0R,29,39^FDDRY WASH ONLY^FS
^FT41,177^A0R,33,35^FDNo exchange,No Guarantee,No Return^FS
^PQ${numCopies},0,1,Y
^XZ`;
}

/**
 * Generate complete ZPL stream with header configuration and multiple labels.
 */
export function generateBatchZpl90x68(rows, cfg = DEFAULT_ZPL_CONFIG, options = {}) {
  const config = { ...DEFAULT_ZPL_CONFIG, ...cfg };
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return '';

  // Setup header matching 90x68 PRN FILE.prn
  const headerBlock = `^XA
^SZ2^JMA
^MCY^PMN
^PW${config.printWidth || 1063}^MTT
^MNM
^MMT
^MD${config.printDarkness ?? 10}
${config.printSpeed ? `^PR${config.printSpeed}` : ''}
^JZY
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

  // 1. Direct print via Windows Spooler API (USB printer on local machine)
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
      return { success: true, printerName: d.printerName || printerToUse };
    }
    if (d.error) {
      console.warn('Windows spooler error, trying Zebra daemon fallback:', d.error);
    }
  } catch (err) {
    console.warn('Local print API failed, trying Zebra daemon:', err);
  }

  // 2. Fallback: Zebra Browser Print Daemon on localhost:9100 / 9101
  const tryEndpoint = async (baseUrl) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

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
      return { success: true, printerName: printer.name };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  let result = await tryEndpoint('http://127.0.0.1:9100');
  if (!result.success) {
    result = await tryEndpoint('https://127.0.0.1:9101');
  }

  return result;
}

export const sendDirectZplPrint = sendToZebraBrowserPrint;

/**
 * Generate a sample PRN string for testing.
 */
export function generateTestPrn(count = 1, cfg = DEFAULT_ZPL_CONFIG) {
  const sampleItems = [
    {
      barcodeNo: 'AAB123456',
      barcodeGenerated: 'G126*4595*1*2301',
      printDescription: '(SM)PURE SILK CREPE.WITH ZARI DETAIL',
      subGroupName: 'SAREE',
      hsn: '601',
      itemCode: '15-PCRP',
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
      barcodeGenerated: `G126*4595*1*${2301 + i}`,
      serialNo: String(26532 + i),
    });
  }

  return generateBatchZpl90x68(rows, cfg);
}
