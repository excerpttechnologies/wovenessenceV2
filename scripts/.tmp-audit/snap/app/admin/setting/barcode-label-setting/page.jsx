'use client';
import ChoiceTableView from '@/components/ChoiceTableView';

/* Barcode Label Settings - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Barcode Label Settings",
  basePath: '/admin/setting/',
  slugPath: "barcode-label-setting",
  endpoint: '/api/barcode-label-setting',
  scope: ["business","location"],
  choice: {
    "nameHeader": "Label Name",
    "extraCols": [
      {
        "k": "pageSize",
        "t": "Page Size (width x height)"
      },
      {
        "k": "labelSize",
        "t": "Label Size (width x height)"
      },
      {
        "k": "stickerInRow",
        "t": "Sticker In Row"
      }
    ],
    "catalog": "barcodeLabels"
  },
};

export default function BarcodelabelsettingPage() {
  return <ChoiceTableView cfg={CONFIG} />;
}
