import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';

/* ==========================================================================
   GST e-Invoice (IRP) request body - NIC schema v1.1.

   Built from an IcItemInvoice plus its sender (seller) and receiver (buyer).
   The SAME JSON goes to every provider in lib/einvoice/provider.js - the
   mock answers it locally, the NIC sandbox / live IRP answer it for real -
   so swapping EINVOICE_MODE later changes nothing here.

   buildPayload() never throws on bad master data: it returns `problems`, a
   list of what the real IRP would reject (missing GSTIN, PIN, HSN ...).
   The mock still generates with problems present (so the flow can be
   tested before the masters are complete); the real modes refuse.
   ========================================================================== */

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export const GSTIN_RX = /^[0-9]{2}[0-9A-Z]{13}$/;
/* IRP document number: up to 16 chars, A-Z 0-9 / -, not starting 0 / - */
const DOCNO_RX = /^[A-Z1-9][A-Z0-9/-]{0,15}$/;

/* state code is the first two digits of a GSTIN */
const stateOf = (gstin) => (GSTIN_RX.test(gstin) ? gstin.slice(0, 2) : '');
const pinOf = (v) => {
  const p = String(v || '').replace(/\D/g, '');
  return p.length === 6 ? Number(p) : null;
};
const phoneOf = (v) => {
  const p = String(v || '').replace(/\D/g, '');
  return p.length >= 6 && p.length <= 12 ? p : undefined;
};
const emailOf = (v) => (/^\S+@\S+\.\S+$/.test(String(v || '')) ? String(v).slice(0, 100) : undefined);

/* app UOM -> GST UQC code; anything unknown goes as OTH (others) */
const UQC = {
  PCS: 'PCS', PC: 'PCS', PIECE: 'PCS', PIECES: 'PCS',
  NOS: 'NOS', NO: 'NOS', NUMBER: 'NOS', NUMBERS: 'NOS',
  MTR: 'MTR', MTRS: 'MTR', METER: 'MTR', METERS: 'MTR', METRE: 'MTR', METRES: 'MTR', M: 'MTR',
  KG: 'KGS', KGS: 'KGS', KILOGRAM: 'KGS', KILOGRAMS: 'KGS',
  GM: 'GMS', GMS: 'GMS', GRAM: 'GMS', GRAMS: 'GMS',
  SET: 'SET', SETS: 'SET', PAIR: 'PRS', PAIRS: 'PRS', PRS: 'PRS',
  BOX: 'BOX', BOXES: 'BOX', DOZ: 'DOZ', DOZEN: 'DOZ', ROLL: 'ROL', ROLLS: 'ROL', ROL: 'ROL',
  YDS: 'YDS', YARD: 'YDS', YARDS: 'YDS', BDL: 'BDL', BUNDLE: 'BDL', BUNDLES: 'BDL',
};
const uqcOf = (uom) => UQC[String(uom || '').trim().toUpperCase()] || 'OTH';

/* dd/mm/yyyy in India time, as the IRP wants it */
export const irpDate = (v) => {
  const x = v ? new Date(v) : new Date();
  return x.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
};

/* seller = sending business (its location wins, as on the printed invoice),
   buyer = receiving business - the same joins
   app/api/ic-item-invoice/[id]/print/route.js makes */
export async function loadParties(inv) {
  const [seller, sellerLoc, buyer] = await Promise.all([
    inv.businessId ? Business.findById(inv.businessId).lean() : null,
    inv.locationId ? CompanyLocation.findById(inv.locationId).lean() : null,
    inv.toBusinessId ? Business.findById(inv.toBusinessId).lean() : null,
  ]);
  const s = seller || {};
  const l = sellerLoc || {};
  const b = buyer || {};
  return {
    seller: {
      gstin: String(l.gstin || s.gstin || '').trim().toUpperCase(),
      legalName: s.name || '',
      tradeName: l.businessPrintName || s.businessPrintName || s.name || '',
      addressLine1: l.addressLine1 || s.addressLine1 || '',
      addressLine2: l.addressLine2 || s.addressLine2 || '',
      city: l.city || s.city || '',
      zipCode: l.zipCode || s.zipCode || '',
      mobile: l.mobile || s.mobile || '',
      email: l.email || s.email || '',
    },
    buyer: {
      gstin: String(b.gstin || '').trim().toUpperCase(),
      legalName: inv.toBusinessName || b.name || '',
      tradeName: b.businessPrintName || inv.toBusinessName || b.name || '',
      addressLine1: b.addressLine1 || '',
      addressLine2: b.addressLine2 || '',
      city: b.city || '',
      zipCode: b.zipCode || '',
      mobile: b.mobile || '',
      email: b.email || '',
    },
  };
}

function party(p, label, problems) {
  if (!p.gstin) problems.push(label + ' GSTIN is missing.');
  else if (!GSTIN_RX.test(p.gstin)) problems.push(label + ' GSTIN "' + p.gstin + '" is not a valid 15-character GSTIN.');
  if (!p.legalName) problems.push(label + ' name is missing.');
  if (str(p.addressLine1, 100).length < 1) problems.push(label + ' address line 1 is missing.');
  if (!p.city) problems.push(label + ' city is missing.');
  if (!pinOf(p.zipCode)) problems.push(label + ' PIN code must be 6 digits.');

  return {
    Gstin: p.gstin,
    LglNm: str(p.legalName, 100),
    TrdNm: str(p.tradeName, 100) || undefined,
    Addr1: str(p.addressLine1, 100),
    Addr2: str(p.addressLine2, 100) || undefined,
    Loc: str(p.city, 50),
    Pin: pinOf(p.zipCode),
    Stcd: stateOf(p.gstin),
    Ph: phoneOf(p.mobile),
    Em: emailOf(p.email),
  };
}

/* -> { payload, problems } */
export function buildPayload(inv, { seller, buyer }) {
  const problems = [];
  const docNo = String(inv.invoiceNo || '').trim().toUpperCase();
  if (!docNo) problems.push('Invoice number is missing.');
  else if (!DOCNO_RX.test(docNo)) {
    problems.push('Invoice number "' + docNo + '" is not IRP-valid (max 16 chars, A-Z 0-9 / -, must not start with 0, / or -).');
  }

  const SellerDtls = party(seller, 'Seller', problems);
  const BuyerDtls = party(buyer, 'Buyer', problems);
  BuyerDtls.Pos = BuyerDtls.Stcd;
  if (SellerDtls.Gstin && SellerDtls.Gstin === BuyerDtls.Gstin) {
    problems.push('Seller and buyer have the same GSTIN - a transfer within one GSTIN is not an e-invoice.');
  }

  const lines = Array.isArray(inv.items) ? inv.items : [];
  if (!lines.length) problems.push('The invoice has no lines.');

  const ItemList = lines.map((l, i) => {
    const qty = r3(l.qty);
    const unitPrice = r3(l.unitRate || l.finalRate);
    const totAmt = r2(qty * unitPrice);
    const assAmt = r2(l.beforeTax);
    const igst = r2(l.igstAmount);
    const cgst = r2(l.cgstAmount);
    const sgst = r2(l.sgstAmount);
    const hsn = String(l.hsn || '').replace(/\D/g, '');
    if (hsn.length < 4 || hsn.length > 8) {
      problems.push('Line ' + (i + 1) + ' (' + (l.itemName || l.barcodeNo || '') + '): HSN must be 4-8 digits.');
    }
    return {
      SlNo: String(i + 1),
      PrdDesc: str(l.itemName || l.itemCode, 300) || undefined,
      IsServc: 'N',
      HsnCd: hsn,
      Barcde: str(l.barcodeNo, 30) || undefined,
      Qty: qty,
      Unit: uqcOf(l.uom),
      UnitPrice: unitPrice,
      TotAmt: totAmt,
      /* whatever the challan line knocked off between gross and taxable */
      Discount: r2(Math.max(0, totAmt - assAmt)),
      AssAmt: assAmt,
      GstRt: r3(Number(l.igstPct || 0) || (Number(l.cgstPct || 0) + Number(l.sgstPct || 0))),
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: r2(assAmt + igst + cgst + sgst),
    };
  });

  const sum = (k) => r2(ItemList.reduce((a, it) => a + it[k], 0));
  const AssVal = sum('AssAmt');
  const IgstVal = sum('IgstAmt');
  const CgstVal = sum('CgstAmt');
  const SgstVal = sum('SgstAmt');
  const RndOffAmt = r2(inv.roundOff);

  const payload = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: docNo, Dt: irpDate(inv.invoiceDate) },
    SellerDtls,
    BuyerDtls,
    ItemList,
    ValDtls: {
      AssVal,
      CgstVal,
      SgstVal,
      IgstVal,
      CesVal: 0,
      StCesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt,
      TotInvVal: r2(AssVal + IgstVal + CgstVal + SgstVal + RndOffAmt),
    },
  };

  /* drop the undefined optionals so the JSON is exactly what is sent */
  return { payload: JSON.parse(JSON.stringify(payload)), problems };
}
