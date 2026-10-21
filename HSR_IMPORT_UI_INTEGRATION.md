/* HSR Import UI Integration Guide

   This file documents how to integrate the HSR Import component into the existing
   Barcode Report page.

   STEPS:

   1. Add HSR Import button to Barcode Report page toolbar
      Location: app/admin/reports/barcode-report/page.jsx

      Near the existing "Import Barcodes" button, add:
      ```jsx
      <HsrImportButton api={api} />
      ```

   2. Import the component:
      ```jsx
      import HsrImportButton from '@/components/HsrImport';
      ```

   3. The HsrImportButton component provides:
      - File upload with drag-and-drop
      - Target/source warehouse selection
      - Financial year selection
      - Operation selection (5 types)
      - Workbook analysis preview
      - Master resolution summary
      - Reconciliation summary
      - Dry-run mode toggle
      - Import execution with transactional safety

   4. The component uses these existing utilities:
      - useScope() - for business, location, finYear
      - useOptions() - for companylocations, stockpoints
      - api.searchFor() - to refresh after import

   5. API Integration:
      - POST /api/hsr-import/analyze - Analyze workbook
      - POST /api/hsr-import/execute - Execute import

   6. Permission Requirements:
      - BARCODE_GENERATE permission (same as existing barcode import)

   7. UI Flow:
      a. Upload Excel file
      b. Select target warehouse (defaults to current scope location)
      c. Select source warehouse (optional, for transfer operation)
      d. Select financial year
      e. Click "Analyze"
      f. Review workbook analysis
      g. Review master resolution (matched/missing)
      g. Select import operation
      h. Review reconciliation summary
      i. Toggle dry-run mode
      j. Click "Import" (or "Dry Run")
      k. View results
      l. Close to refresh report

   8. Features:
      - Workbook structure validation
      - Duplicate header detection
      - Data type validation
      - Master data resolution
      - Warehouse stock reconciliation
      - Price difference detection
      - Conflict detection (in-transit, sold, void)
      - Detailed error reporting
      - Import job tracking
      - Transaction safety

   9. Error Handling:
      - Missing masters are listed with row counts
      - Validation errors are displayed at row level
      - Failed imports show detailed error messages
      - Dry-run mode allows testing without database changes

   10. Browser Compatibility:
       - Modern browsers with ES6+ support
       - Requires FormData API for file upload
       - Requires fetch API for API calls

   CUSTOMIZATION:

   To customize the UI for your specific needs:

   1. Modify the operation labels/descriptions in lib/hsrImportConstants.js
   2. Add additional validation rules in lib/hsrWorkbookImport.js
   3. Extend the preview table in components/HsrImport.jsx
   4. Add import history view component
   5. Add master correction workflow component

   TESTING:

   1. Test with valid HSR workbook
   2. Test with missing masters
   3. Test with duplicate barcodes
   4. Test with price differences
   5. Test with insufficient source stock (transfer)
   6. Test dry-run mode
   7. Test each operation type
   8. Test large file handling
   9. Test error scenarios
   10. Test with different permissions

   DEPLOYMENT:

   1. Ensure all backend files are deployed
   2. Ensure HsrImportJob model is created
   3. Test API endpoints in production
   4. Test UI in production
   5. Monitor import job collection for errors
*/
