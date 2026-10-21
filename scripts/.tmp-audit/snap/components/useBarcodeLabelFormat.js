'use client';
import { useEffect, useMemo, useState } from 'react';
import { useScope } from './ScopeContext';

/* THE STICKER STOCK a GRC barcode label sheet is laid out on.

   A barcode label is a physical object. Its width and height, and how many
   sit across the sheet, come from the seeded barcode label catalog
   (/api/catalog?name=barcodeLabels - labelSize "50 x 40 mm", stickerInRow 2)
   narrowed by what Settings -> Barcode Label Settings has ticked, with the
   row marked Default preselected.

   This was written out inside the Barcode Generation print picker and
   NOWHERE ELSE, so the GRC Barcode Print page - which renders the very same
   sheet - had no geometry at all and laid its labels out at whatever width
   the page happened to give them. Both now read the format from here, so one
   GRC prints the same physical label from either screen. */
export default function useBarcodeLabelFormat(enabled = true) {
  const scope = useScope();
  const [formats, setFormats] = useState([]);
  const [formatName, setFormatName] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    (async () => {
      const qs = new URLSearchParams({
        business: scope.business || '',
        location: scope.location || '',
        finYear: scope.finYear || '',
      });
      const [chosen, catalog] = await Promise.all([
        fetch('/api/barcode-label-setting?' + qs).then((r) => r.json()).catch(() => ({})),
        fetch('/api/catalog?name=barcodeLabels').then((r) => r.json()).catch(() => ({})),
      ]);
      if (cancelled) return;

      const list = catalog.rows || [];
      setFormats(list);

      const ticked = ((chosen.doc && chosen.doc.rows) || []).filter((r) => r.choice);
      const preferred = ticked.find((t) => t.isDefault)?.name || ticked[0]?.name;
      setFormatName(list.some((c) => c.name === preferred) ? preferred : (list[0]?.name || ''));
    })();

    return () => { cancelled = true; };
  }, [enabled, scope.business, scope.location, scope.finYear]);

  /* null until the catalog has answered. GrcBarcodeLabelSheet falls back to
     the 50 x 40 mm 2-up default in that window rather than rendering a
     zero-sized label, so the first paint is still a real sticker. */
  const format = useMemo(
    () => formats.find((f) => f.name === formatName) || null,
    [formats, formatName]
  );

  return { formats, format, formatName, setFormatName };
}
