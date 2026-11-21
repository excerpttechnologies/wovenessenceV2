'use client';
import BarcodeSvg from './BarcodeSvg';
import { formatLabelPrice, toLabelData } from '@/lib/barcodeLabelPrint';

/**
 * Visual Preview of the 90 × 68 MM ZPL Label.
 * Accurately replicates the physical layout and fonts of 90x68 PRN FILE.prn.
 */
export default function GrcZplLabelPreview({ row, config = {}, isPrint = false }) {
  if (!row) return null;
  const label = toLabelData(row);

  const barcodeNo = label.barcodeNo || row.barcodeNo || label.barcode || '';
  let barcodeGenerated = label.barcodeGenerated || row.barcodeGenerated || barcodeNo;
  if (barcodeGenerated && barcodeGenerated.includes('*')) {
    const parts = barcodeGenerated.split('*');
    if (parts.length === 3) {
      const unitPart = String(row.serialNo || row.billSlNo || row.seq || '1').trim();
      barcodeGenerated = `${parts[0]}*${parts[1]}*${parts[2]}*${unitPart}`;
    }
  }

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
      className={`zpl-label-preview bg-white relative select-none overflow-hidden ${
        isPrint ? 'border-0 shadow-none m-0' : 'border border-slate-300 shadow-md mx-auto'
      }`}
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
        background: '#fff',
      }}
    >
      {/* Top Line: Composed Barcode */}
      <div className="flex justify-between items-center text-[10.5px] font-mono tracking-wide leading-none" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="font-bold text-[11px]">{barcodeGenerated}</span>
        <span className="text-[9px] font-semibold text-slate-400 uppercase" style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', color: '#94a3b8' }}>
          90×68mm ZPL
        </span>
      </div>

      {/* Barcode Section: Code 128 + Human Readable */}
      <div className="my-0.5" style={{ margin: '2px 0' }}>
        <div className="h-[22mm] w-full flex items-center justify-center overflow-hidden" style={{ height: '22mm', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <div className="text-center font-mono font-bold text-[14px] tracking-wider leading-tight" style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>
          {barcodeNo}
        </div>
      </div>

      {/* Product Description */}
      <div className="text-[10px] font-bold uppercase tracking-tight truncate border-b border-dashed border-slate-300 pb-0.5" style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px dashed #cbd5e1', paddingBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {description}
      </div>

      {/* Category */}
      <div className="text-[9.5px] font-semibold text-slate-800 uppercase tracking-wide" style={{ fontSize: '9.5px', fontWeight: '600', textTransform: 'uppercase' }}>
        {category}
      </div>

      {/* Detail Grid (Rows 1 & 2) */}
      <div className="text-[9px] font-mono leading-tight py-0.5" style={{ fontSize: '9px', lineHeight: 1.2, padding: '2px 0' }}>
        <div className="flex justify-between font-bold" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span className="truncate w-1/3" style={{ width: '33%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hsn}</span>
          <span className="truncate w-1/3 text-center" style={{ width: '33%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemCode}</span>
          <span className="truncate w-1/3 text-right" style={{ width: '33%', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{encodedCostPrice}</span>
        </div>
        <div className="flex justify-between text-slate-700 mt-0.5" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
          <span className="truncate w-1/3" style={{ width: '33%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{supplierCode}</span>
          <span className="truncate w-1/3 text-center font-bold text-black" style={{ width: '33%', textAlign: 'center', fontWeight: 'bold', color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qtyText}</span>
          <span className="truncate w-1/3 text-right" style={{ width: '33%', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serialNo}</span>
        </div>
      </div>

      {/* RATE Section */}
      <div className="flex items-center justify-between border-t border-b border-black py-0.5 my-0.5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000', padding: '2px 0', margin: '2px 0' }}>
        <span className="text-[18px] font-black tracking-tight leading-none text-black" style={{ fontSize: '18px', fontWeight: '900', color: '#000', lineHeight: 1 }}>
          {rateText}
        </span>
        <span className="text-[8px] font-bold text-slate-700 uppercase" style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: '#333' }}>
          (Inclusive all taxes)
        </span>
      </div>

      {/* Care Instructions & Disclaimer */}
      <div className="flex items-center justify-between text-[8px] font-bold tracking-tight text-slate-800 leading-none" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '8px', fontWeight: 'bold', lineHeight: 1 }}>
        <span className="uppercase text-slate-900" style={{ textTransform: 'uppercase', color: '#000' }}>DRY WASH ONLY</span>
        <span className="text-[7.5px] text-slate-600" style={{ fontSize: '7.5px', color: '#444' }}>No exchange,No Guarantee,No Return</span>
      </div>
    </div>
  );
}
