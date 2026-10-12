# TSC TE310 Barcode Label Printing Fix - Summary

## Problem Statement
The barcode label for the TSC TE310 printer (104mm × 40mm) was not printing correctly. In Chrome's print preview, the label appeared extremely small at the top of a large A4/portrait-style page, leaving most of the page blank. The barcode and text were not positioned or scaled correctly for the physical label.

## Root Cause Analysis

### Primary Issue
The print workflow defaulted to **A4 page size** (`@page { size: A4; margin: 5mm; }`) when the "A4 sheet" paper option was selected. This caused the 104mm × 40mm label to appear as a tiny element on a 210mm × 297mm page.

### Contributing Factors
1. **Missing Barcode Format:** The barcode label catalog did not include a format for the TSC TE310 (104mm × 40mm)
2. **Incorrect Paper Selection:** Users were selecting "A4 sheet" instead of "Label stock"
3. **@page Rule:** The CSS @page rule was set to A4 dimensions instead of the actual label dimensions
4. **CSS Enforcement:** No additional CSS to ensure the correct page size was applied

## Solution Implemented

### 1. Added TSC TE310 Format to Barcode Label Catalog
**File:** `scripts/seed.mjs`
- Added new format: "TSC TE310 104x40"
- Page size: 104mm × 40mm
- Label size: 104mm × 40mm
- Labels per sheet: 1 (single label per physical label)
- Sort order: 13 (after existing formats)

### 2. Created Database Migration Script
**File:** `scripts/addTscTe310Format.js` (new)
- Allows adding the TSC TE310 format to an existing database without resetting data
- Checks if the format already exists to avoid duplicates
- Provides clear console output

### 3. Enhanced Print CSS
**File:** `app/globals.css`
- Added print-specific CSS to enforce correct page size when using label stock
- Ensures zero margins on body and print root when printing labels
- Prevents conflicting styles from overriding the @page rule

### 4. Documentation
**File:** `TSC_TE310_SETUP.md` (new)
- Comprehensive setup guide for the TSC TE310 printer
- Step-by-step configuration instructions
- Troubleshooting guide for common issues
- Technical details about CSS and label geometry

## Files Modified

1. **scripts/seed.mjs**
   - Added TSC TE310 format to LABELS array
   - Lines changed: 192-206 (added one new format entry)

2. **scripts/addTscTe310Format.js** (new file)
   - 81 lines
   - Database migration script for adding the format

3. **app/globals.css**
   - Lines 1292-1308 (added print-specific CSS rules)
   - Enforces zero margins when printing labels
   - Ensures correct page size application

4. **TSC_TE310_SETUP.md** (new file)
   - 236 lines
   - Complete setup and troubleshooting guide

## How the Fix Works

### Before the Fix
```
@page { size: A4; margin: 5mm; }
```
- Browser uses A4 (210mm × 297mm) as the page size
- 104mm × 40mm label appears small at the top
- Most of the page is blank

### After the Fix (when "Label stock" is selected)
```
@page { size: 104mm 40mm; margin: 0; }
```
- Browser uses 104mm × 40mm as the page size
- Label fills the entire printable area
- No blank space

### CSS Enforcement
```css
@media print {
  body.printing-labels {
    margin: 0 !important;
    padding: 0 !important;
  }
  body.printing-labels #barcode-print-root {
    margin: 0 !important;
    padding: 0 !important;
  }
}
```
- Ensures no browser or application margins interfere
- Guarantees the @page rule is respected

## Implementation Details

### Label Geometry (from lib/barcodeLabelGeometry.js)
- **Physical dimensions:** 104mm × 40mm
- **Padding:** 1.2mm horizontal, 0.8mm vertical
- **Border:** 0.2mm
- **Usable width:** 101.4mm
- **Usable height:** 38.0mm
- **Sections:** 8 bands (barcode, identifier, description, detail rows, rate, tax/wash, disclaimer)

### Barcode Dimensions
- **Module width:** 0.33mm (ISO minimum for readability)
- **Barcode height:** ~40% of the barcode band height
- **Quiet zone:** 10 modules (CODE128 standard)
- **Aspect ratio:** Preserved (no stretching or distortion)

## Setup Instructions

### 1. Add Format to Database
```bash
node scripts/addTscTe310Format.js
```

### 2. Configure in ERP
1. Go to **Settings > Barcode Label Settings**
2. Enable "TSC TE310 104x40"
3. Mark it as Default
4. Save

### 3. Configure Printer Driver
1. Open **Control Panel > Devices and Printers**
2. Right-click TSC TE310 > **Printing Preferences**
3. Create custom paper size: 104mm × 40mm
4. Set as default paper size
5. Configure media settings (continuous or die-cut)

### 4. Print Labels
1. Navigate to barcode generation/print page
2. Select **Label:** "TSC TE310 104x40"
3. Select **Paper:** "Label stock" (NOT "A4 sheet")
4. Click "Print Labels"
5. In Chrome print dialog, verify:
   - Destination: TSC TE310
   - Paper size: 104mm × 40mm
   - Margins: None
   - Scale: 100%

## Verification Steps

### 1. Print Preview Check
- Page size should show 104mm × 40mm
- Label should fill the page
- No blank space

### 2. PDF Save Test
- Save as PDF
- Verify PDF dimensions are 104mm × 40mm
- Check label positioning and readability

### 3. Physical Print Test
- Print one label
- Verify physical dimensions
- Test barcode scanning
- Check text readability

### 4. Multi-Label Test
- Print 5-10 labels
- Verify correct spacing
- Check for alignment issues

## Testing Results

The fix was implemented but not physically tested with a TSC TE310 printer. The following were verified:

1. ✅ Code compiles without errors
2. ✅ Database migration script is syntactically correct
3. ✅ CSS rules are properly structured
4. ✅ Documentation is comprehensive
5. ⏳ Physical printer testing (requires hardware access)

## Known Limitations

1. **Browser Override:** Chrome and the printer driver may still override the CSS @page rule. The user must manually verify the correct paper size is selected in the print dialog.

2. **Custom Paper Size:** If the TSC printer driver doesn't have a 104mm × 40mm preset, the user must create a custom paper size in Windows printer preferences.

3. **Calibration:** Physical alignment may require printer calibration, which is outside the scope of the web application.

## Remaining Tasks for the User

1. Run the database migration script: `node scripts/addTscTe310Format.js`
2. Configure the TSC TE310 printer driver with a custom 104mm × 40mm paper size
3. Set up the format in Settings > Barcode Label Settings
4. Test with print preview and physical printing
5. Calibrate the printer if alignment issues occur

## Technical Notes

### @page Rule Behavior
- CSS can request a page size, but browsers and printer drivers may override it
- The fix ensures the correct CSS is injected, but user verification is still required
- Chrome typically respects @page rules when the paper size matches the printer driver

### Label Stock vs A4
- **Label stock:** Uses the format's pageSize field (104mm × 40mm)
- **A4 sheet:** Uses standard A4 (210mm × 297mm) with 5mm margins
- The fix only applies when "Label stock" is selected

### Existing Functionality Preserved
- All existing barcode formats remain unchanged
- A4 printing still works as before
- Inventory label printing unaffected
- No breaking changes to the API or database schema

## Support Resources

- **Setup Guide:** See `TSC_TE310_SETUP.md` for detailed instructions
- **Database Script:** Run `node scripts/addTscTe310Format.js` for database setup
- **Printer Documentation:** Consult TSC TE310 manual for driver-specific settings
- **Troubleshooting:** Refer to the "Common Issues and Solutions" section in the setup guide

## Conclusion

The root cause was the use of A4 page size instead of the actual label dimensions. The fix:
1. Adds the correct label format to the catalog
2. Ensures the @page rule uses 104mm × 40mm when "Label stock" is selected
3. Enforces the correct CSS through global print styles
4. Provides comprehensive documentation for setup and troubleshooting

The user must still configure the printer driver and select the correct options in the ERP interface, but the web application now properly supports the TSC TE310 printer's physical label dimensions.
