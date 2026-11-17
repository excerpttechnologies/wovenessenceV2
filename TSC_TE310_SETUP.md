# TSC TE310 Barcode Label Printer Setup Guide

## Printer Specifications
- **Model**: TSC TE310
- **Resolution**: 300 DPI (12 dots/mm)
- **Max Print Width**: 105.7mm
- **Label Stock**: 104mm × 40mm
- **Layout**: 2 labels side-by-side (52mm × 40mm each)

## 1. Database Configuration

### Add TSC TE310 Format to Catalog

Run the setup script to add the TSC TE310 format:

```bash
node scripts/addTscTe310Format.js
```

This creates a barcode label format with:
- **Name**: TSC TE310 52x40 (2-up)
- **Page Size**: 104mm × 40mm
- **Label Size**: 52mm × 40mm
- **Labels per Row**: 2 (side-by-side)

### Set as Default

1. Navigate to: **Settings → Barcode Label Settings**
2. Find "TSC TE310 52x40 (2-up)" in the list
3. Check the checkbox to enable it
4. Mark it as **Default**
5. Save settings

## 2. Windows TSC TE310 Driver Configuration

### Install TSC Printer Driver

1. Download the latest TSC TE310 driver from TSC website
2. Install the driver following TSC instructions
3. Connect the printer via USB or Network

### Configure Custom Paper Size

1. Open **Devices and Printers** (Windows Control Panel)
2. Right-click on **TSC TE310** printer
3. Select **Printing Preferences**

#### Page Setup Tab:
- **Stock Type**: Gap/Die-cut (for label stock with gaps)
- **Media Type**: Select your actual media (Thermal Transfer or Direct Thermal)
- **Width**: 104mm
- **Height**: 40mm
- **Orientation**: Landscape
- **Media Source**: Roll

#### Options Tab:
- **Print Speed**: 3-4 IPS (inches per second) - start moderate
- **Print Darkness**: Medium (adjust based on print quality)
- **Print Method**: 
  - Thermal Transfer (if using ribbon)
  - Direct Thermal (if using thermal paper)

#### Advanced Tab:
- **Gap Detection**: Enable
- **Calibrate Sensor**: Run sensor calibration with actual label stock loaded
- **Tear Off**: 0mm (adjust if labels need position adjustment)

### Save Custom Paper Size in Driver

1. In **Printing Preferences → Page Setup**
2. Click **New** or **Custom** button
3. Create new paper size:
   - Name: "104x40mm Labels"
   - Width: 104mm
   - Height: 40mm
4. Save and select this as default

## 3. Application Configuration

### Barcode Print Page Settings

When printing barcodes from `/admin/transaction/purchase/barcode-print/:id`:

1. **Label Size**: Select "TSC TE310 52x40 (2-up)"
2. **Paper**: Select "Label stock" (not A4)
3. Click **Print Labels**

### Chrome Print Dialog Settings

When the Chrome print dialog opens:

- **Destination**: TSC TE310
- **Paper size**: 104x40mm Labels (the custom size you created)
- **Pages per sheet**: 1
- **Margins**: None (or Minimum)
- **Scale**: 100% (Default)
- **Headers and footers**: Disabled
- **Background graphics**: Enabled (to print barcodes properly)

## 4. Label Layout Specifications

### Physical Layout on 104mm × 40mm Stock:
```
┌────────────────────────────────────────────────────────────────┐
│  Label 1 (52mm)          │  Label 2 (52mm)                     │
│  ┌────────────────────┐  │  ┌────────────────────┐             │
│  │ Barcode + Details  │  │  │ Barcode + Details  │  40mm       │
│  └────────────────────┘  │  └────────────────────┘             │
└────────────────────────────────────────────────────────────────┘
                    104mm total width
```

### Label Content (each 52mm × 40mm label):
1. **Barcode graphic** (CODE128)
2. **Barcode identifier** (number)
3. **Product description** (3 lines)
4. **HSN code** | **Qty + Unit** | **Qty value**
5. **Rate code** | **Item code** | **Offer price**
6. **Rate** (prominent)
7. **Tax info** | **Washing instructions**
8. **Disclaimer text**

## 5. TSC TE310 Calibration

### Initial Sensor Calibration:
1. Load label stock correctly (labels facing up)
2. Press and hold **PAUSE** button for 2 seconds
3. Printer will auto-calibrate gap sensor
4. Wait for calibration to complete
5. Test print from driver properties

### Gap Sensor Check:
- Ensure gap sensor detects spaces between labels
- If labels feed incorrectly, recalibrate sensor
- Check sensor position aligns with label gap

## 6. Print Quality Settings for 300 DPI

### Barcode Module Width:
- **Target**: 0.33mm per module
- **Minimum readable**: 0.19mm (close-range scanners)
- **TSC TE310 dot size**: 0.0846mm (300 DPI)
- **Recommended**: 4-5 dots per narrow bar

### Font Sizes (automatically calculated):
- Barcode number: Scaled to fit 52mm width
- Description: 3 lines, auto-fitted
- Rate: Prominent, scaled to band height
- Details: Proportional to section height

### Darkness Settings:
- Start at **medium darkness** (50%)
- Increase if barcodes scan poorly
- Decrease if ink smudges or fills gaps
- Test scan after each adjustment

## 7. Testing Checklist

Test printing with different quantities:

### Test Case 1: Single Barcode (1 label)
- ✅ Prints on left side of stock
- ✅ Right side remains blank
- ✅ Correct dimensions (52mm × 40mm)
- ✅ Barcode scannable

### Test Case 2: Two Barcodes (2 labels)
- ✅ Both labels on same sheet
- ✅ Side-by-side layout
- ✅ Each label 52mm wide
- ✅ Both barcodes scannable
- ✅ Correct sequence

### Test Case 3: Multiple Barcodes (12 labels)
- ✅ 6 sheets printed (2 labels per sheet)
- ✅ Correct barcode sequence
- ✅ All unique barcodes (no duplicates)
- ✅ All labels scannable
- ✅ No missing labels

### Test Case 4: Batch Print (50 labels)
- ✅ 25 sheets printed
- ✅ All barcodes unique and sequential
- ✅ Consistent print quality
- ✅ No label position drift
- ✅ All barcodes scannable

## 8. Troubleshooting

### Labels Print One Per Page (Full Width)
**Problem**: Each barcode uses entire 104mm width
**Solution**: 
- Check "Label Size" is set to "TSC TE310 52x40 (2-up)" (not "TSC TE310 104x40")
- Verify `stickerInRow: 2` in catalog
- Reload barcode print page

### Paper Size Shows A4 Instead of 104×40mm
**Problem**: Print preview shows A4 dimensions
**Solution**:
- Select "Label stock" in Paper dropdown (not "A4 sheet")
- Verify custom 104×40mm paper created in Windows driver
- Check Chrome print dialog shows "104x40mm Labels"

### Barcode Not Scanning
**Problem**: Scanner cannot read barcode
**Solutions**:
- Increase print darkness in TSC driver
- Check barcode module width (should be ≥0.19mm)
- Verify 300 DPI print quality
- Clean print head
- Recalibrate sensor

### Labels Feed Incorrectly
**Problem**: Multiple labels feed at once or skip labels
**Solutions**:
- Run sensor calibration (hold PAUSE button)
- Check gap sensor alignment
- Verify stock type set to "Gap/Die-cut"
- Clean gap sensor with compressed air
- Check label stock quality

### Print Position Drifts
**Problem**: Labels shift position over multiple prints
**Solutions**:
- Recalibrate sensor
- Adjust tear-off setting (-3mm to +3mm)
- Check media guides are snug but not too tight
- Verify labels loaded straight

### Barcode Numbers Cut Off
**Problem**: First characters missing
**Solutions**:
- Check SAFE_MARGIN_MM (should be ≥2mm)
- Verify print head position
- Adjust tear-off in driver settings
- Check label padding (PAD_X_MM, PAD_Y_MM)

## 9. System Configuration Summary

### Database (Catalog):
```javascript
{
  catalog: 'barcodeLabels',
  name: 'TSC TE310 52x40 (2-up)',
  pageSize: '104 x 40 mm',
  labelSize: '52 x 40 mm',
  stickerInRow: 2
}
```

### Geometry (barcodeLabelGeometry.js):
- `labelsPerRow(format)`: Returns minimum 2
- `parsePageSize()`: Returns {w: 104, h: 40}
- `stockPageCss()`: Calculates dynamic height for multiple rows
- `labelPageRule()`: `@page { size: 104mm XXXmm; margin: 0; }`

### Print Logic (barcodeLabelPrint.js):
- UNIQUE barcodes: 2 copies each (fills one row)
- METER barcodes: 2 copies each
- BATCH barcodes: User-specified count

### Component (GrcBarcodeLabel.jsx):
- Grid layout: 2 columns × N rows
- Each label: 52mm × 40mm
- Gap: 0mm (die-cut stock, no gutter needed)
- Alignment: Center justified

## 10. Print Workflow

### For GRC Barcode Generation:

1. Open GRC: `/admin/transaction/purchase/grc`
2. Select GRC with generated barcodes
3. Click barcode print icon
4. **Barcode Generation Page** opens with print picker
5. Select "TSC TE310 52x40 (2-up)" format
6. Select "Label stock" paper
7. Review preview (2-up layout)
8. Click "Print Labels"
9. Chrome print dialog opens
10. Verify: Destination = TSC TE310, Paper = 104x40mm
11. Click "Print"
12. TSC TE310 prints labels 2 per sheet

### For Direct Barcode Print Page:

1. Navigate to: `/admin/transaction/purchase/barcode-print/:id`
2. Page loads with default "TSC TE310 52x40 (2-up)" format
3. Paper defaults to "Label stock"
4. Review on-screen preview (2-up layout)
5. Click "Print Labels"
6. Follow steps 9-12 above

## 11. Expected Output

### For 11 UNIQUE Barcodes:
- **Total labels**: 22 (11 × 2 copies)
- **Sheets printed**: 11 (2 labels per sheet)
- **Layout**: Side-by-side pairs
- **Page 1**: Labels 1 & 2 (same barcode)
- **Page 2**: Labels 3 & 4 (same barcode)
- ...
- **Page 11**: Labels 21 & 22 (same barcode)

### For Mixed Barcode Types (example):
- 5 UNIQUE barcodes → 10 labels (5 sheets)
- 3 METER barcodes → 6 labels (3 sheets)  
- 2 BATCH barcodes with count=4 → 8 labels (4 sheets)
- **Total**: 24 labels on 12 sheets

## 12. Files Modified

### Configuration Files:
- `scripts/addTscTe310Format.js` - Database catalog setup
- `lib/barcodeLabelGeometry.js` - Already configured for 2-up minimum
- `lib/barcodeLabelPrint.js` - UNIQUE=2 copies already set
- `app/admin/transaction/purchase/barcode-print/[id]/page.jsx` - Paper default='stock'
- `components/useBarcodeLabelFormat.js` - Prefers 2-up formats
- `components/GrcBarcodeLabel.jsx` - Grid layout with dynamic columns

### No Changes Needed (Already Correct):
- Barcode generation logic
- Database barcode numbering
- Stock quantity tracking
- Label content rendering
- Print preview mechanism

## 13. Support and Maintenance

### Regular Maintenance:
- Clean print head weekly (use cleaning pen)
- Clean gap sensor monthly
- Recalibrate after changing label stock
- Update driver if Windows version changes
- Test print after long idle periods

### Backup Configuration:
- Export barcode label settings from database
- Document custom Windows paper size settings
- Keep record of optimal darkness/speed settings
- Save calibration results

---

## Quick Start Checklist

- [ ] Run `node scripts/addTscTe310Format.js`
- [ ] Set "TSC TE310 52x40 (2-up)" as default in Settings
- [ ] Configure Windows driver with 104×40mm custom paper
- [ ] Run sensor calibration on TSC TE310
- [ ] Test print 1 barcode
- [ ] Test print 2 barcodes (verify side-by-side)
- [ ] Test print 12 barcodes (verify all sheets)
- [ ] Scan test labels to verify readability
- [ ] Adjust darkness if needed
- [ ] Document final settings

---

**Last Updated**: November 16, 2026
**Printer Model**: TSC TE310 (300 DPI)
**Application**: Groo Retail ERP - GRC Barcode Printing
