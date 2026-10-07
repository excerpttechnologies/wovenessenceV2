/* GST portal text -> structured taxpayer details.

   The operator searches the GSTIN on the government portal themselves, selects
   the result and pastes it here. Nothing in this file touches the network:
   there is no GST provider, no API key and no per-lookup charge, which is the
   whole point of it. It is a pure function over a string, so it can be tested
   without a browser or a database.

   The portal's copy output is not stable - the amount of blank lines, whether
   a label and its value share a line, and how the HSN table flattens all vary
   by browser. So this reads by SECTION rather than by line number: find a
   known heading, take everything up to the next known heading as its value.
   A layout change that moves a section around cannot break the others, and a
   heading nobody recognises is simply ignored rather than shifting everything
   after it.

   Nothing here guesses. A section that is absent yields nothing and is
   reported in `missing`, so the caller can say what it could not find instead
   of filling the form with something plausible. */

/* The headings the portal prints, in the order it prints them. `key` is what
   the rest of the app sees; `heading` is matched loosely - see headingRe. */
const SECTIONS = [
  { key: 'searchResult', heading: 'Search Result based on GSTIN/UIN' },
  { key: 'legalName', heading: 'Legal Name of Business' },
  { key: 'tradeName', heading: 'Trade Name' },
  { key: 'registrationDate', heading: 'Effective Date of registration' },
  { key: 'constitution', heading: 'Constitution of Business' },
  { key: 'gstStatus', heading: 'GSTIN / UIN Status' },
  { key: 'taxpayerType', heading: 'Taxpayer Type' },
  { key: 'administrativeOffice', heading: 'Administrative Office' },
  { key: 'otherOffice', heading: 'Other Office' },
  { key: 'principalPlace', heading: 'Principal Place of Business' },
  { key: 'additionalPlace', heading: 'Additional Place of Business' },
  { key: 'aadhaar', heading: 'Whether Aadhaar Authenticated?' },
  { key: 'ekyc', heading: 'Whether e-KYC Verified?' },
  { key: 'additionalTradeName', heading: 'Additional Trade Name' },
  { key: 'coreBusinessActivity', heading: 'Nature Of Core Business Activity' },
  { key: 'businessActivities', heading: 'Nature of Business Activities' },
  { key: 'goodsAndServices', heading: 'Dealing In Goods and Services' },
];

/* A heading matcher that survives the portal's punctuation drifting:
   "GSTIN / UIN Status", "GSTIN/UIN Status" and "GSTIN - UIN Status" are one
   heading. Anchored at the start so "Additional Trade Name" is never read as
   "Trade Name". The trailing group captures a value sharing the line, which
   is how "Search Result based on GSTIN/UIN : 19ACSPA8875B1Z9" is read.

   The separator run swallows the question mark two of the headings end with
   ("Whether Aadhaar Authenticated?"), so the captured value is the answer
   and not the punctuation. */
function headingRe(heading) {
  const body = heading
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^A-Za-z0-9]*');
  return new RegExp('^\\s*' + body + '\\s*[?:\\-–]*\\s*(.*)$', 'i');
}

const SECTION_MATCHERS = SECTIONS.map((s) => ({ ...s, re: headingRe(s.heading) }));

/* Line endings, non-breaking spaces and runs of spaces are noise. Line
   BOUNDARIES are not - they are what separates one address line from the
   next - so they survive, and only runs of three or more collapse. */
export function normaliseGstText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* 2 digits (state code) + 10-character PAN + entity digit + Z + check char. */
export const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi;

const CHECK_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* The GSTIN's 15th character is a mod-36 check over the first 14, weighted
   1,2,1,2... Getting this right means a typo in a hand-copied GSTIN is caught
   here rather than at the tax return. It is advisory only: the caller warns,
   it never blocks, because a rejected-but-real GSTIN would be worse. */
export function isGstinChecksumValid(gstin) {
  const code = String(gstin ?? '').toUpperCase();
  if (code.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = CHECK_ALPHABET.indexOf(code[i]);
    if (value < 0) return false;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHECK_ALPHABET[(36 - (sum % 36)) % 36] === code[14];
}

/* The PAN is not printed separately - it is characters 3..12 of the GSTIN by
   construction, so this reads it rather than inventing it. */
export function panFromGstin(gstin) {
  const code = String(gstin ?? '').toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]/.test(code) ? code.slice(2, 12) : '';
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/* Spellings the portal and older records still use. */
const STATE_ALIASES = {
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  'nctofdelhi': 'Delhi',
  'delhinct': 'Delhi',
  'thedadraandnagarhaveliandbamanandiu': 'Dadra and Nagar Haveli and Daman and Diu',
};

export const squash = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* Find `value` among `options` ignoring case, spacing and punctuation, then
   fall back to one containing the other ("Private Limited" -> "Private
   Limited Company"). Returns the option's own spelling, never the input's, so
   a dropdown is always set to a value it actually holds. */
export function matchOption(value, options) {
  const want = squash(value);
  if (!want) return '';
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const exact = list.find((o) => squash(o.value) === want || squash(o.label) === want);
  if (exact) return exact.value;
  const partial = list.find((o) => {
    const has = squash(o.label) || squash(o.value);
    return has && (has.includes(want) || want.includes(has));
  });
  return partial ? partial.value : '';
}

export function matchState(value) {
  const direct = matchOption(value, INDIAN_STATES);
  if (direct) return direct;
  return STATE_ALIASES[squash(value)] || '';
}

/* -------------------------------------------------------------------------
   Address

   "87 BLOCK E, GAURI SHANKAR AGARWALA,
    NALINI RANJAN AVENUE, NEW ALIPORE,
    KOLKATA, Kolkata, West Bengal, 700053"

   Read from the END, where the shape is reliable: the PIN is the last
   6-digit run, the state is the last token that is a real state, and the city
   and district are the one or two tokens in front of it. Everything left over
   is the street, and it keeps the portal's own line breaks so line 1 and
   line 2 stay meaningful.

   Working backwards is what avoids the trap of taking the first comma-token
   that looks like a place: the district is often printed twice, once in caps
   and once in title case, and only the position tells them apart. */
export function parseAddress(text) {
  const full = normaliseGstText(text);
  if (!full) return null;

  /* a comma at the end of a wrapped line is a line break, not an empty field */
  const lines = full.split('\n').map((l) => l.trim().replace(/,+$/, '').trim()).filter(Boolean);
  let tokens = lines.join(', ').split(',').map((t) => t.trim()).filter(Boolean);

  let pincode = '';
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const hit = tokens[i].match(/\b[1-9][0-9]{5}\b/);
    if (hit) {
      pincode = hit[0];
      const rest = tokens[i].replace(hit[0], '').trim().replace(/[,\s]+$/, '');
      if (rest) tokens[i] = rest; else tokens.splice(i, 1);
      break;
    }
  }

  let state = '';
  let stateAt = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const hit = matchState(tokens[i]);
    if (hit) { state = hit; stateAt = i; break; }
  }

  /* The portal prints the address fields in registration order, so the two
     tokens in front of the state are City then District:

       "..., Bengaluru, Bengaluru Urban, Karnataka, 560002"
       "..., KOLKATA, Kolkata, West Bengal, 700053"

     The second example is the same place printed twice - the portal often
     repeats it, once in capitals - and the first is a city inside a district
     named after it. Both are recognised by the two tokens being RELATED:
     identical, or one containing the other. Two unrelated tokens are NOT
     assumed to be a city/district pair, because the one further from the
     state is far more often the street; in that case the token before the
     state is the city and no district is claimed. Without a state there is no
     anchor at all, so neither is claimed - better an empty field the operator
     fills than a street name silently filed as a city.

     The length guard stops a short fragment ("A", "RS") from matching by
     accident inside a longer name. */
  let city = '';
  let district = '';
  if (stateAt > 0) {
    const near = tokens[stateAt - 1];
    const far = stateAt > 1 ? tokens[stateAt - 2] : '';
    const a = squash(near);
    const b = squash(far);
    const related = !!b && (a === b
      || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))));
    if (related) {
      /* the shorter of the two is the city, the longer the district it sits
         in ("Bengaluru" inside "Bengaluru Urban"); when they are the same
         place, the spelling nearer the state is kept for both */
      city = a === b ? near : (a.includes(b) ? far : near);
      district = a === b ? near : (a.includes(b) ? near : far);
      tokens.splice(stateAt - 2, 3);
    } else {
      city = near;
      tokens.splice(stateAt - 1, 2);
    }
  } else if (stateAt === 0) {
    tokens.splice(stateAt, 1);
  }

  /* Street back into lines: the first physical line becomes Address line 1,
     whatever remains becomes line 2. */
  const street = tokens.join(', ');
  const firstLineTokens = (lines[0] || '').split(',').map((t) => t.trim()).filter(Boolean);
  let line1 = '';
  let line2 = '';
  if (firstLineTokens.length && street.startsWith(firstLineTokens.join(', '))) {
    line1 = firstLineTokens.join(', ');
    line2 = street.slice(line1.length).replace(/^[,\s]+/, '');
  } else {
    line1 = street;
  }

  return { line1, line2, city, district, state, pincode, full: lines.join(', ') };
}

/* -------------------------------------------------------------------------
   HSN table

   Two shapes come out of the portal, and both land here:
     "5210 WOVEN FABRICS OF COTTON..."      code and text on one line
     "5210" / "WOVEN FABRICS OF COTTON..."  code and text on separate lines
   A line that opens with a 4-8 digit code starts a new entry; anything else
   continues the description of the entry above it. */
const HSN_TABLE_HEADERS = ['hsn', 'description', 'hsndescription', 'hsncode', 'hsnsac', 'hsnsaccode', 'sac', 'goods', 'services'];

export function parseHsn(text) {
  const out = [];
  normaliseGstText(text).split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line || HSN_TABLE_HEADERS.includes(squash(line))) return;
    const start = line.match(/^(\d{4,8})\b[\s.\-:]*(.*)$/);
    if (start) {
      out.push({ code: start[1], description: start[2].trim() });
    } else if (out.length) {
      const last = out[out.length - 1];
      last.description = (last.description ? last.description + ' ' : '') + line;
    }
  });
  return out.map((h) => ({ code: h.code, description: h.description.trim() }));
}

/* "1. Factory / Manufacturing" -> "Factory / Manufacturing" */
export function parseActivities(text) {
  return normaliseGstText(text)
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\s*[.)\]]\s*/, '').trim())
    .filter(Boolean);
}

/* dd/mm/yyyy as printed, plus the yyyy-mm-dd a date input needs. The day is
   never reinterpreted - the portal is unambiguously day-first. */
export function parseGstDate(text) {
  const hit = String(text ?? '').match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (!hit) return null;
  const [, d, m, y] = hit;
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return { display: `${day}/${month}/${y}`, iso: `${y}-${month}-${day}` };
}

/* Split the paste into { sectionKey: 'its lines' }. Anything before the first
   recognised heading is kept under `_preamble` so a GSTIN printed above the
   table is still found. */
function sectionise(text) {
  const found = {};
  let current = '_preamble';
  normaliseGstText(text).split('\n').forEach((line) => {
    if (!line) { if (found[current] !== undefined) found[current] += '\n'; return; }
    const hit = SECTION_MATCHERS.find((s) => s.re.test(line));
    if (hit) {
      current = hit.key;
      const inline = (line.match(hit.re)?.[1] || '').trim();
      found[current] = inline ? inline + '\n' : '';
      return;
    }
    found[current] = (found[current] || '') + line + '\n';
  });
  Object.keys(found).forEach((k) => { found[k] = found[k].trim(); });
  return found;
}

const firstLine = (v) => String(v ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';

/* "Whether Aadhaar Authenticated?" answers Yes or No and nothing else, so
   anything that is not one of those two words is treated as not answered
   rather than coerced - "Not Applicable" is not a No. */
export function parseYesNo(text) {
  const v = squash(firstLine(text));
  if (v === 'yes') return 'Yes';
  if (v === 'no') return 'No';
  return '';
}

/* -------------------------------------------------------------------------
   The one entry point. Returns everything it could read plus an honest
   account of what it could not, and never throws on rubbish input. */
export function parseGstText(raw) {
  const text = normaliseGstText(raw);
  const result = {
    ok: false,
    gstin: '', gstinChecksumValid: false, pan: '',
    legalName: '', tradeName: '', registrationDate: null,
    constitution: '', gstStatus: '', taxpayerType: '',
    aadhaarAuthenticated: '', ekycVerified: '', additionalTradeName: '',
    administrativeOffice: '', otherOffice: '',
    address: null, coreBusinessActivity: '',
    businessActivities: [], hsnCodes: [],
    found: [], missing: [],
  };
  if (!text) return result;

  const sections = sectionise(text);

  /* GSTIN: the one on the "Search Result based on GSTIN/UIN" line wins,
     because a paste can also contain the jurisdiction's own codes. Failing
     that, the first thing anywhere in the text shaped like a GSTIN. */
  const labelled = String(sections.searchResult || '').match(GSTIN_RE);
  const anywhere = text.match(GSTIN_RE);
  const gstin = (labelled?.[0] || anywhere?.[0] || '').toUpperCase();
  if (gstin) {
    result.gstin = gstin;
    result.gstinChecksumValid = isGstinChecksumValid(gstin);
    result.pan = panFromGstin(gstin);
  }

  result.legalName = firstLine(sections.legalName);
  result.tradeName = firstLine(sections.tradeName);
  result.registrationDate = parseGstDate(sections.registrationDate);
  result.constitution = firstLine(sections.constitution);
  result.gstStatus = firstLine(sections.gstStatus);
  result.taxpayerType = firstLine(sections.taxpayerType);
  result.aadhaarAuthenticated = parseYesNo(sections.aadhaar);
  result.ekycVerified = parseYesNo(sections.ekyc);
  result.additionalTradeName = firstLine(sections.additionalTradeName);
  /* jurisdiction: no field on the supplier form, kept so the caller can store
     it against the record instead of throwing it away */
  result.administrativeOffice = firstLine(sections.administrativeOffice);
  result.otherOffice = firstLine(sections.otherOffice);
  result.coreBusinessActivity = firstLine(sections.coreBusinessActivity);
  result.businessActivities = parseActivities(sections.businessActivities);
  result.hsnCodes = parseHsn(sections.goodsAndServices);
  result.address = parseAddress(sections.principalPlace);

  /* "View" is the portal's link text where a value would be, not a value. */
  if (squash(result.tradeName) === 'view') result.tradeName = '';
  if (squash(result.additionalTradeName) === 'view') result.additionalTradeName = '';

  const report = [
    ['GSTIN', !!result.gstin],
    ['Legal Name', !!result.legalName],
    ['Trade Name', !!result.tradeName],
    ['Registration Date', !!result.registrationDate],
    ['Constitution', !!result.constitution],
    ['GST Status', !!result.gstStatus],
    ['Taxpayer Type', !!result.taxpayerType],
    ['Address', !!result.address?.line1],
    ['State', !!result.address?.state],
    ['City', !!result.address?.city],
    ['District', !!result.address?.district],
    ['Pincode', !!result.address?.pincode],
    ['Aadhaar Authenticated', !!result.aadhaarAuthenticated],
    ['e-KYC Verified', !!result.ekycVerified],
    ['Core Business Activity', !!result.coreBusinessActivity],
  ];
  result.found = report.filter(([, hit]) => hit).map(([name]) => name);
  result.missing = report.filter(([, hit]) => !hit).map(([name]) => name);
  /* Most taxpayers have no additional trade name, so its absence is not worth
     reporting as something that could not be read - it is only announced when
     the portal actually printed one. */
  if (result.additionalTradeName) result.found.push('Additional Trade Name');

  /* Enough to be a taxpayer record rather than an accidental paste. */
  result.ok = !!result.gstin || (!!result.legalName && !!result.address);
  return result;
}
