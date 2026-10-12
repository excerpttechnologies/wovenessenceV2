# TSC TE310 Barcode Label Printing - Current Status and Setup Guide

## Current Implementation Status

### ✅ Completed
1. **All barcode label formats seeded to database** - 14 formats including TSC TE310
2. **TSC TE310 format added** - 104mm × 40mm, 1 label per sheet
3. **Barcode label catalog system** - Dynamic format selection from database
4. **Label stock printing support** - Can print to actual label dimensions
5. **Print CSS configured** - Supports dynamic @page rules for label stock
6. **Print surface portaled to body** - Avoids application layout interference
7. **Enhanced print CSS** - Improved isolation and page break controls for TSC TE310

### 📋 Database Status
All barcode label formats have been successfully seeded to the barcode label catalog:
- **TSC TE310 104x40:** 104 x 40 mm page size, 104 x 40 mm label size, 1 label per sheet
- **Plus 13 other formats:** Various sizes from 38x25mm to 100x50mm

**Note:** If the Label dropdown shows "Default 50 x 40 mm" instead of format names, run:
```bash
node scripts/seedBarcodeLabels.js
```

## How to Print with TSC TE310

### Step 1: Generate Barcodes
1. Navigate to `/admin/transaction/purchase/grc/[id]/barcode-generation`
2. Add items and generate barcodes for each item
3. Click "Submit" to save the barcodes

### Step 2: Print Barcodes
1. Navigate to `/admin/transaction/purchase/barcode-print/[id]` (or use the Print button from barcode generation)
2. In the **Label** dropdown, select **"TSC TE310 104x40"**
3. In the **Paper** dropdown, select **"Label stock"** (NOT "A4 sheet")
4. Click **"Print Labels"**

**Critical:** Selecting "Label stock" is required because:
- It tells the system to use the actual physical label dimensions (104mm × 40mm)
- It injects the correct `@page { size: 104mm 40mm; margin: 0; }` CSS rule
- "A4 sheet" will use A4 page size (210mm × 297mm) which will make the label appear small

### Step 3: Chrome Print Dialog Settings (Manual Configuration Required)
**Important:** Web applications cannot programmatically control Chrome print dialog settings due to browser security restrictions. You must manually configure these settings each time you print:

1. **Destination:** Select "TSC TE310" (or your printer name)
2. **Paper Size:** Should show "104mm × 40mm" or "Custom"
   - If not available, create a custom paper size in printer preferences (see below)
3. **Layout:** Portrait or Landscape (the system handles orientation)
4. **Margins:** None (0 mm) - Click "More settings" to access this
5. **Scale:** 100% (Default / Actual size)
6. **Background graphics:** Enabled - Click "More settings" to access this
7. **Headers and footers:** Disabled (uncheck) - Click "More settings" to access this
8. **Pages per sheet:** 1

**Tip:** Chrome should remember these settings for the TSC TE310 printer once configured.

## TSC TE310 Printer Driver Configuration (One-Time Setup)

### Windows Printer Setup

1. **Install the TSC TE310 Driver**
   - Download the latest driver from TSC's official website
   - Run the installer and follow the prompts
   - Connect the printer via USB or network

2. **Configure Custom Paper Size**
   - Open **Control Panel > Devices and Printers**
   - Right-click on the TSC TE310 printer and select **Printing Preferences**
   - Go to the **Paper/Quality** tab
   - Click **Custom** or **New** to create a custom paper size
   - Set the dimensions:
     - **Width:** 104 mm
     - **Height:** 40 mm
     - **Unit:** Millimeters
   - Name it "TSC TE310 104x40" or similar
   - Save the custom size

3. **Set Default Paper Size**
   - In the same Printing Preferences dialog
   - Select the custom "104mm × 40mm" size as the default
   - Click OK

4. **Configure Media Settings**
   - Go to the **Advanced** tab in Printing Preferences
   - Set **Paper Size** to your custom 104mm × 40mm size
   - Set **Media Type** to "Continuous" or "Die-cut labels" (depending on your stock)
   - Set **Print Quality** to "Normal" or "High"
   - Click OK

## Troubleshooting

### Issue: Label appears small on A4 page
**Cause:** "A4 sheet" is selected instead of "Label stock"
**Solution:** Select "Label stock" in the Paper dropdown

### Issue: "Label stock" option is disabled
**Cause:** The selected label format has no pageSize set
**Solution:** Select "TSC TE310 104x40" which has pageSize "104 x 40 mm"

### Issue: Print preview shows A4 instead of 104mm × 40mm
**Cause:** Browser may not support custom page size from CSS
**Solution:**
1. Create custom paper size in printer preferences
2. Select the custom size in Chrome print dialog
3. Verify margins are set to None

### Issue: TSC TE310 format not in Label dropdown
**Cause:** Format not in database or not enabled in settings
**Solution:**
1. Run `node scripts/addTscTe310Format.js` to add format
2. Go to Settings > Barcode Label Settings
3. Enable "TSC TE310 104x40"
4. Mark it as Default (optional)

### Issue: Barcode doesn't scan
**Cause:** Barcode too small or printer quality too low
**Solution:**
1. Increase print quality in printer preferences
2. Verify barcode dimensions are correct
3. Check scanner is compatible with CODE128 barcodes

## Technical Implementation Details

### Dynamic @page Rule Injection
When "Label stock" is selected, the system injects a dynamic CSS rule:
```css
@page {
  size: 104mm 40mm;
  margin: 0;
}
```

This is generated by the `labelRun()` function in `lib/barcodeLabelGeometry.js` based on the selected format's `pageSize` field.

### Print Surface Isolation
The print surface is portaled to `<body>` to:
- Avoid application layout interference
- Allow natural page fragmentation
- Ensure only the label sheet is printed

### Print CSS Rules
The global print CSS in `app/globals.css` includes:
```css
@media print {
  body.printing-labels {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  
  body.printing-labels #barcode-print-root {
    margin: 0 !important;
    padding: 0 !important;
  }
  
  .barcode-label {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  
  #barcode-print-root svg,
  #barcode-print-root svg * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

### Label Geometry
The label dimensions come from the barcode label catalog:
- **Width:** 104 mm
- **Height:** 40 mm
- **Padding:** Calculated by geometry module
- **Border:** 0.2mm
- **Usable width/height:** Depends on padding and border settings

## Verification Steps

### 1. Verify Format in Database
Run the database query to verify the format exists:
```javascript
db.catalog.findOne({ catalog: 'barcodeLabels', name: 'TSC TE310 104x40' })
```

### 2. Test with Print Preview
1. Generate a barcode for a GRC record
2. Navigate to barcode print page
3. Select "TSC TE310 104x40" and "Label stock"
4. Click "Print Labels"
5. Verify Chrome print preview shows 104mm × 40mm page size
6. Verify label fills the page correctly

### 3. Save as PDF Test
1. In the print dialog, select "Save as PDF"
2. Save the output
3. Open the PDF and verify dimensions are 104mm × 40mm
4. Verify barcode and text are readable

### 4. Physical Print Test
1. Select TSC TE310 as the destination
2. Print a single label
3. Verify physical dimensions match 104mm × 40mm
4. Verify barcode scans correctly
5. Verify text is readable

## Current System Architecture

### Barcode Printing Flow
1. **Barcode Generation** (`/admin/transaction/purchase/grc/[id]/barcode-generation`)
   - Generate barcodes for GRC items
   - Use GCRBarcodeGeneration component
   - Has print preview picker

2. **Barcode Print** (`/admin/transaction/purchase/barcode-print/[id]`)
   - Dedicated print page for GRC barcodes
   - Select label format and paper type
   - Handles batch barcode quantities
   - Uses GrcBarcodeLabelSheet component

3. **Label Format System**
   - Formats stored in database (catalog collection)
   - Read by useBarcodeLabelFormat hook
   - Includes pageSize, labelSize, stickerInRow

4. **Geometry Module** (`lib/barcodeLabelGeometry.js`)
   - Calculates label layout in millimetres
   - Generates pageRule for print CSS
   - Handles A4 vs label stock sizing

5. **Label Component** (`components/GrcBarcodeLabel.jsx`)
   - Renders individual barcode labels
   - Uses actual label dimensions from geometry
   - Shared between print and preview

## Known Limitations

1. **Browser Custom Page Size Support**
   - Some browsers may not support custom page sizes from CSS
   - Workaround: Create custom paper size in printer preferences

2. **Printer Driver Requirements**
   - Printer driver must support custom paper sizes
   - Not all drivers support custom dimensions
   - TSC TE310 driver typically supports custom sizes

3. **Chrome Print Dialog Overrides**
   - Chrome may override CSS page size with its own settings
   - User must manually select correct paper size in print dialog
   - Headers and footers must be disabled manually

## Conclusion

The system is fully configured to support TSC TE310 barcode label printing. The key is to:

1. **Select "TSC TE310 104x40"** in the Label dropdown
2. **Select "Label stock"** in the Paper dropdown
3. **Configure printer driver** for 104mm × 40mm custom paper size
4. **Select correct paper size** in Chrome print dialog

The TSC TE310 format has been added to the database and is ready to use. The print CSS and geometry system will correctly apply the 104mm × 40mm dimensions when "Label stock" is selected.

## Files Modified for TSC TE310 Support

1. **scripts/addTscTe310Format.js**
   - Fixed to use dotenv instead of missing loadEnv module
   - Adds TSC TE310 format to database

2. **package.json**
   - Added dotenv dependency

3. **Database**
   - Added TSC TE310 104x40 format to barcode label catalog

## Existing Files (No Changes Needed)

1. **app/admin/transaction/purchase/barcode-print/[id]/page.jsx**
   - Already supports label stock printing
   - Already has Label and Paper dropdowns
   - Already injects dynamic @page rules

2. **lib/barcodeLabelGeometry.js**
   - Already calculates label geometry
   - Already generates pageRule for print CSS
   - Already handles A4 vs label stock

3. **app/globals.css**
   - Already has print CSS for labels
   - Already has body.printing-labels rules
   - Already has barcode-label break rules

4. **components/GrcBarcodeLabel.jsx**
   - Already renders labels at correct dimensions
   - Already uses geometry module for sizing
