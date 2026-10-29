import { labelGeometry, barsBox, readableBarsBox, fitType, MONO_CHAR_W, LABEL_SECTIONS } from '@/lib/barcodeLabelGeometry.js';

for (const size of ['50x40', '48x40']) {
  const format = { labelSize: size.replace('x', ' x ') + ' mm', labelsPerRow: 2 };
  const g = labelGeometry(format);
  for (const value of ['G758*05084*1*1', '8A2085', 'G758*05084*16*16', 'G1319*05197*1*1']) {
    const b = barsBox(g, value);
    const r = readableBarsBox(g, value);
    console.log(size, JSON.stringify(value), 'usableW', g.usableW.toFixed(2), 'band', g.band('barcode').toFixed(2), 'bars', b.w.toFixed(2), b.h.toFixed(2), 'x', b.x.toFixed(4), 'modules', b.modules, 'readable', r.w.toFixed(2), 'identifierType', g.type('identifier').toFixed(2));
  }
  console.log('sections', JSON.stringify(LABEL_SECTIONS));
}
