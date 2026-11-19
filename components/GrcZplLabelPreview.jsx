'use client';
import BarcodeSvg from './BarcodeSvg';
import { formatLabelPrice, toLabelData } from '@/lib/barcodeLabelPrint';

/**
 * Visual Preview of the 90 × 68 MM ZPL Label.
 * Accurately replicates the physical layout and fonts of 90x68 PRN FILE.prn.
 */
export default function GrcZplLabelPreview({ row, config = {} }) {
  if (!row) return null;
  const label = toLabelData(row);

  const barcodeNo = label.barcodeNo || row.barcodeNo || label.barcode || '';
  const barcodeGenerated = label.barcodeGenerated || row.barcodeGenerated || barcodeNo;

  const description =
    row.printDescription || row.supplierDescription || row.itemName || label.description || 'ITEM';
  const category = row.subGroupName || row.groupName || row.category || 'SAREE';

  // Detail Row 1
  const hsn = row.hsn || label.hsn || '601';
  const itemCode = row.itemCode || label.itemCode || '15-PCRP';
  const encodedCostPrice = row.encodedCostPrice || label.encodedCostPrice || row.purRateCode || 'HIWBB';

  // Detail Row 2
  const supplierCode = row.supplierCode || row.batchUnique || 'AMTFT';
  const qty = String(row.qty ?? label.quantity ?? 1);
  const uom = String(row.uom || row.uomType || label.unit || 'PC(S)').toUpperCase();
  const qtyText = `${qty} ${uom}`;
  const offerPrice = row.offerPrice ? formatLabelPrice(row.offerPrice) : '';
  const serialNo = offerPrice || row.serialNo || row.billSlNo || '26532';

  // Rate
  const retailPrice = formatLabelPrice(row.retailPrice || row.rsp || label.retailPrice || 0);
  const rateText = `RATE:${retailPrice}/-`;

  return (
    <div
      className="zpl-label-preview bg-white shadow-md border border-slate-300 relative mx-auto select-none overflow-hidden"
      style={{
        width: '90mm',
        height: '68mm',
        boxSizing: 'border-box',
        padding: '3mm 4mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top Line: Composed Barcode */}
      <div className="flex justify-between items-center text-[10.5px] font-mono tracking-wide leading-none">
        <span className="font-bold">{barcodeGenerated}</span>
        <span className="text-[9px] font-semibold text-slate-400 uppercase">90×68mm ZPL</span>
      </div>

      {/* Barcode Section: Code 128 + Human Readable */}
      <div className="my-0.5">
        <div className="h-[22mm] w-full flex items-center justify-center overflow-hidden">
          <BarcodeSvg
            value={barcodeNo}
            height={70}
            width={1.6}
            displayValue={false}
            margin={0}
            quietZone={1}
            className="w-full h-full"
          />
        </div>
        <div className="text-center font-mono font-bold text-[14px] tracking-wider leading-tight">
          {barcodeNo}
        </div>
      </div>

      {/* Product Description */}
      <div className="text-[10px] font-bold uppercase tracking-tight truncate border-b border-dashed border-slate-300 pb-0.5">
        {description}
      </div>

      {/* Category */}
      <div className="text-[9.5px] font-semibold text-slate-800 uppercase tracking-wide">
        {category}
      </div>

      {/* Detail Grid (Rows 1 & 2) */}
      <div className="text-[9px] font-mono leading-tight py-0.5">
        <div className="flex justify-between font-bold">
          <span className="truncate w-1/3">{hsn}</span>
          <span className="truncate w-1/3 text-center">{itemCode}</span>
          <span className="truncate w-1/3 text-right">{encodedCostPrice}</span>
        </div>
        <div className="flex justify-between text-slate-700 mt-0.5">
          <span className="truncate w-1/3">{supplierCode}</span>
          <span className="truncate w-1/3 text-center font-bold text-black">{qtyText}</span>
          <span className="truncate w-1/3 text-right">{serialNo}</span>
        </div>
      </div>

      {/* RATE Section */}
      <div className="flex items-center justify-between border-t border-b border-black py-0.5 my-0.5">
        <span className="text-[18px] font-black tracking-tight leading-none text-black">
          {rateText}
        </span>
        <span className="text-[8px] font-bold text-slate-700 uppercase">
          (Inclusive all taxes)
        </span>
      </div>

      {/* Care Instructions & Disclaimer */}
      <div className="flex items-center justify-between text-[8px] font-bold tracking-tight text-slate-800 leading-none">
        <span className="uppercase text-slate-900">DRY WASH ONLY</span>
        <span className="text-[7.5px] text-slate-600">No exchange,No Guarantee,No Return</span>
      </div>
    </div>
  );
}
