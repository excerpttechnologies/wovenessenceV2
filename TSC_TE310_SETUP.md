# TSC TE310 Barcode Label Printer Setup Guide

## Overview
This guide explains how to configure the TSC TE310 thermal printer to print 104mm × 40mm barcode labels correctly with the Woven Essence ERP system.

## Root Cause of the Original Issue
The barcode label was printing incorrectly because:
1. The print workflow defaulted to A4 page size (210mm × 297mm) when "A4 sheet" was selected
2. The 104mm × 40mm label appeared extremely small at the top of the large A4 page
3. The @page CSS rule was set to `@page { size: A4; margin: 5mm; }` instead of the actual label dimensions
4. The barcode label catalog did not include a format for the TSC TE310 (104mm × 40mm)

## Solution Implemented
1. Added "TSC TE310 104x40" format to the barcode label catalog (104mm × 40mm, 1 label per sheet)
2. Enhanced print CSS to enforce correct page size when using label stock
3. The @page rule now correctly sets `@page { size: 104mm 40mm; margin: 0; }` when "Label stock" is selected

## Files Modified
1. **scripts/seed.mjs** - Added TSC TE310 format to the LABELS array
2. **scripts/addTscTe310Format.js** - New script to add the format to the database without resetting data
3. **app/globals.css** - Added print-specific CSS to enforce correct page size and margins

## Database Setup

### Option 1: Add Format to Existing Database (Recommended)
Run the dedicated script to add the TSC TE310 format without affecting existing data:

```bash
node scripts/addTscTe310Format.js
```

### Option 2: Full Database Reset
If you're setting up a new instance, run the seed script:

```bash
npm run seed
```

## ERP Configuration

### Step 1: Select the Label Format
1. Navigate to **Settings > Barcode Label Settings**
2. Find "TSC TE310 104x40" in the list
3. Check the box to enable it
4. Mark it as **Default** by checking the Default column
5. Click Save

### Step 2: Configure Print Settings
When printing barcode labels from:
- **GRC Barcode Generation** (`/admin/transaction/purchase/grc/[id]/barcode-generation`)
- **GRC Barcode Print** (`/admin/transaction/purchase/barcode-print/[id]`)

1. In the **Label** dropdown, select "TSC TE310 104x40"
2. In the **Paper** dropdown, select **"Label stock"** (NOT "A4 sheet")
3. Click "Print Labels"

**Important:** The "Label stock" option is required because it tells the system to use the actual physical label dimensions (104mm × 40mm) instead of A4.

## TSC TE310 Printer Driver Configuration

### Windows Printer Setup

1. **Install the TSC TE310 Driver**
   - Download the latest driver from TSC's official website
   - Run the installer and follow the prompts
   - Connect the printer via USB or network

2. **Configure Paper Size**
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
   - Set **Print Quality** to "Normal" or "High" (adjust based on your needs)
   - Click OK

5. **Printer Properties**
   - Right-click the printer and select **Printer Properties**
   - Ensure the **Ports** tab has the correct port selected (USB or network)
   - In the **Device Settings** tab, verify the paper size matches your custom size

### Chrome Print Dialog Settings

When the print dialog opens in Chrome:

1. **Destination:** Select "TSC TE310" (or your printer name)
2. **Paper Size:** Should show "104mm × 40mm" or your custom size
   - If not, click "More settings" and select it manually
3. **Layout:** Landscape (if supported) or Portrait (the system handles orientation)
4. **Margins:** None (0 mm)
5. **Scale:** 100% (Default / Actual size)
6. **Background graphics:** Enabled (if you want the background printed)
7. **Headers and footers:** Disabled (uncheck)
8. **Pages per sheet:** 1

### Troubleshooting Print Alignment

If the label prints in the wrong position:

1. **Calibrate the Printer**
   - Most TSC printers have a calibration button or menu option
   - Press and hold the feed button for 3-5 seconds to calibrate
   - Or use the TSC configuration utility to calibrate

2. **Adjust Media Settings**
   - Check if you're using continuous or gap/die-cut labels
   - In Printing Preferences, adjust the "Gap length" or "Black mark" settings
   - For continuous labels, set the sensor to "Continuous" mode

3. **Check Page Margins**
   - Ensure CSS margin is set to 0 in the @page rule
   - The system injects: `@page { size: 104mm 40mm; margin: 0; }`
   - Verify no browser print margins are adding extra space

## Verification Steps

### 1. Test with Print Preview
1. Generate a barcode for a GRC record
2. Open Chrome print preview (Ctrl+P)
3. Verify the page size shows 104mm × 40mm
4. Verify the label fills the page correctly
5. Verify no extra whitespace or blank pages

### 2. Save as PDF
1. In the print dialog, select "Save as PDF" as the destination
2. Save the output
3. Open the PDF and verify:
   - Page dimensions are 104mm × 40mm
   - Label is positioned correctly
   - Barcode and text are readable
   - No clipping or overlapping

### 3. Physical Print Test
1. Select TSC TE310 as the destination
2. Print a single label
3. Verify:
   - Physical dimensions match 104mm × 40mm
   - Barcode scans correctly with a barcode scanner
   - All text is readable
   - Label is aligned correctly on the physical stock

### 4. Multi-Label Test
1. Print multiple labels (e.g., 5-10 labels)
2. Verify:
   - Each label is on its own physical label
   - No labels are skipped or misaligned
   - Consistent spacing between labels

## Common Issues and Solutions

### Issue: Label appears small on A4 page
**Cause:** "A4 sheet" is selected instead of "Label stock"
**Solution:** Select "Label stock" in the Paper dropdown

### Issue: Print preview shows A4 instead of 104mm × 40mm
**Cause:** The @page rule is not being applied correctly
**Solution:**
1. Ensure "Label stock" is selected
2. Verify the format has pageSize set to "104 x 40 mm"
3. Check browser console for CSS errors
4. Refresh the page and try again

### Issue: Printer driver doesn't show 104mm × 40mm size
**Cause:** Custom paper size not created in printer preferences
**Solution:** Follow the "Configure Paper Size" section above to create the custom size

### Issue: Label prints with wrong alignment
**Cause:** Printer not calibrated or media settings incorrect
**Solution:** Calibrate the printer and adjust media settings in printer preferences

### Issue: Barcode doesn't scan
**Cause:** Barcode too small or printer quality too low
**Solution:**
1. Increase print quality in printer preferences
2. Verify barcode height is sufficient (system uses ~40% of label height)
3. Check scanner is compatible with CODE128 barcodes

## Technical Details

### CSS @page Rule
When "Label stock" is selected, the system injects:
```css
@page {
  size: 104mm 40mm;
  margin: 0;
}
```

This tells the browser to:
- Use a physical page size of 104mm × 40mm
- Apply zero margins to the page
- Treat the label as the entire printable area

### Label Geometry
The label uses the following dimensions (from lib/barcodeLabelGeometry.js):
- **Width:** 104 mm
- **Height:** 40 mm
- **Padding:** 1.2mm horizontal, 0.8mm vertical
- **Border:** 0.2mm
- **Usable width:** 101.4 mm (width - padding - border)
- **Usable height:** 38.0 mm (height - padding - border)

### Barcode Dimensions
The barcode is sized based on the encoded value:
- **Module width:** 0.33mm (ISO minimum for readability)
- **Barcode height:** ~40% of the label height band
- **Quiet zone:** 10 modules (CODE128 standard)
- **Aspect ratio:** Preserved (no stretching)

## Support

If you encounter issues not covered in this guide:
1. Check the browser console for JavaScript/CSS errors
2. Verify the database has the TSC TE310 format configured
3. Test with "Save as PDF" to isolate printer driver issues
4. Consult TSC TE310 printer documentation for driver-specific settings
5. Contact Woven Essence support with:
   - Browser version
   - Printer driver version
   - Screenshot of print preview
   - Saved PDF output
