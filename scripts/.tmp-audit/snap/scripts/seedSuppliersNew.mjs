#!/usr/bin/env node
/**
 * Supplier Import Script - New Version
 * =====================================
 * Imports suppliers from Excel file with comprehensive field mapping
 * 
 * Usage:
 *   npm run seed:suppliers              - Dry run (preview only)
 *   npm run seed:suppliers:apply        - Actually import data
 * 
 * Features:
 * - Automatic backup before import
 * - Duplicate detection
 * - Smart field mapping
 * - Detailed validation
 * - Comprehensive error reporting
 */

import path from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();
const EXCEL_PATH = process.env.SUPPLIER_EXCEL_PATH || path.join(ROOT, 'suppliers.xlsx');
const BACKUP_DIR = path.join(ROOT, 'backups');

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('❌ MONGODB_URI is not set. Run with --env-file=.env');
  process.exit(1);
}

// Utility functions
const T = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));
const NULLISH = new Set(['', '-', '--', 'n/a', 'na', 'null', 'undefined', 'nil', 'none', 'not applicable']);
const clean = (v) => {
  const s = T(v);
  return NULLISH.has(s.toLowerCase()) ? '' : s;
};

const toNumber = (v) => {
  const n = parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : n;
};

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const toBoolean = (v) => {
  const s = String(v || '').toLowerCase().trim();
  if (['yes', 'true', '1', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n'].includes(s)) return false;
  return false;
};

// Report object
const report = {
  startedAt: new Date().toISOString(),
  mode: APPLY ? 'APPLY' : 'DRY-RUN',
  excel: { rows: 0, valid: 0, skipped: [], errors: [] },
  before: { total: 0 },
  inserted: 0,
  duplicates: [],
  after: { total: 0 },
  backupFile: '',
};

/**
 * Field mapping configuration
 * Maps Excel column headers to database fields
 */
const FIELD_MAP = {
  // Basic Information
  'Contact ID': 'contactId',
  'Contact Code': 'contactId',
  'Supplier Code': 'contactId',
  'Supplier ID': 'contactId',
  
  'Business Name': 'businessName',
  'Company Name': 'businessName',
  'Supplier Name': 'businessName',
  
  'Short Name': 'shortName',
  'Business Type': 'businessType',
  'GST No': 'gstNo',
  'GST Number': 'gstNo',
  'GSTIN': 'gstNo',
  
  'Contact Type': 'contactType2',
  'Prefix': 'prefix',
  'First Name': 'firstName',
  'Middle Name': 'middleName',
  'Last Name': 'lastName',
  'DOB': 'dob',
  'Date of Birth': 'dob',
  'Gender': 'gender',
  
  // Billing Address
  'Address Line 1': 'billingAddressLine1',
  'Address 1': 'billingAddressLine1',
  'Billing Address 1': 'billingAddressLine1',
  
  'Address Line 2': 'billingAddressLine2',
  'Address 2': 'billingAddressLine2',
  'Billing Address 2': 'billingAddressLine2',
  
  'City': 'billingCity',
  'Billing City': 'billingCity',
  
  'State': 'billingState',
  'Billing State': 'billingState',
  
  'Country': 'billingCountry',
  'Billing Country': 'billingCountry',
  
  'District': 'billingDistrict',
  'Taluk': 'billingTaluk',
  
  'Zip Code': 'billingZipCode',
  'PIN Code': 'billingZipCode',
  'Postal Code': 'billingZipCode',
  'Pincode': 'billingZipCode',
  
  'Mobile': 'billingMobile',
  'Mobile Number': 'billingMobile',
  'Phone': 'billingMobile',
  
  'Alternate Contact': 'billingAlternateContactNumber',
  'Alternate Mobile': 'billingAlternateContactNumber',
  
  'Landline': 'billingLandline',
  'Fax': 'billingFax',
  
  'Email': 'billingEmail',
  'Email Address': 'billingEmail',
  
  'Email 2': 'billingEmail2',
  'Alternate Email': 'billingEmail2',
  
  'Website': 'billingWebsiteUrl',
  'Website URL': 'billingWebsiteUrl',
  
  // Shipping Address
  'Same as Billing': 'sameAsBilling',
  'Shipping Address 1': 'shippingAddressLine1',
  'Shipping Address 2': 'shippingAddressLine2',
  'Shipping City': 'shippingCity',
  'Shipping State': 'shippingState',
  'Shipping Country': 'shippingCountry',
  'Shipping District': 'shippingDistrict',
  'Shipping Zip': 'shippingZipCode',
  'Shipping Mobile': 'shippingMobile',
  'Shipping Email': 'shippingEmail',
  
  // Purchase Details
  'Markup Price Calculation': 'markupPriceCalculation',
  'Discount Type': 'discountType',
  'Discount': 'discount',
  'Mark Up on Cost RSP': 'markUpOnCostRsp',
  'RSP Round Off': 'rspRoundOff',
  'Mark Up on Cost WSP': 'markUpOnCostWsp',
  'WSP Round Off': 'wspRoundOff',
  'Mark Up on Cost DP': 'markUpOnCostDp',
  'DP Round Off': 'dpRoundOff',
  
  'Agent': 'agentName',
  'Agent Name': 'agentName',
  'Commission %': 'commissionPercent',
  'Commission Percent': 'commissionPercent',
  
  'Order Delivery Days': 'orderDeliveryEstimatedDays',
  'Order Delay Days': 'orderAcceptedDelaysDays',
  'Order Advance Limit': 'orderAdvanceLimit',
  
  'Payment Within Days': 'paymentWithinDays',
  'Payment Days': 'paymentWithinDays',
  'Payment Date Type': 'paymentDateType',
  'Discount Allow %': 'discountAllowWithinPercent',
  'Discount Allow Days': 'discountAllowInDays',
  
  'Logistics Terms': 'logisticsTerms',
  
  // Financial Details
  'Supplier Type': 'supplierType',
  'Opening Balance': 'openingBalance',
  
  'PAN': 'pan',
  'PAN Number': 'pan',
  'CIN': 'cin',
  'CIN Number': 'cin',
  'GST Type': 'gstType',
  'GST Registration Date': 'gstRegDate',
  'SSI No': 'ssiNo',
  'SSI Number': 'ssiNo',
  'SSI Registration Date': 'ssiRegDate',
  'MSME No': 'msmeNo',
  'MSME Number': 'msmeNo',
  'MSME Registration Date': 'msmeRegDate',
  
  'TDS %': 'tdsPercent',
  'TDS Percent': 'tdsPercent',
  'TDS Name': 'tdsName',
  'TDS Section': 'tdsSection',
  
  // Bank Details
  'Bank Account Name': 'bankAccountName',
  'Account Holder Name': 'bankAccountName',
  'Bank Name': 'bankName',
  'Account Number': 'accountNo',
  'Account No': 'accountNo',
  'IFSC': 'ifsc',
  'IFSC Code': 'ifsc',
  'Swift Code': 'swiftCode',
  'SWIFT': 'swiftCode',
  
  // Other
  'Allow Production': 'allowProduction',
  'Allow To Stock Point': 'allowToStockPoint',
  'Maximum Overdue Days': 'maximumOverDueDays',
  'Remarks': 'remarks',
  'Notes': 'remarks',
};

/**
 * Parse Excel file and extract supplier data
 */
function parseExcel() {
  console.log('\n📄 Reading Excel file...');
  console.log('   File:', EXCEL_PATH);
  
  const wb = XLSX.readFile(EXCEL_PATH, { raw: true, cellDates: true });
  const sheetName = wb.SheetNames.find(n => /supplier/i.test(n)) || wb.SheetNames[0];
  console.log('   Sheet:', sheetName);
  
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: null
  });
  
  const header = grid[0].map(h => T(h));
  const rows = grid.slice(1).filter(r => r.some(c => c !== null && c !== undefined && c !== ''));
  
  report.excel.rows = rows.length;
  console.log('   Rows:', rows.length);
  console.log('   Columns:', header.length);
  
  return { header, rows };
}

/**
 * Map Excel row to database document
 */
function mapRow(row, header, rowIndex) {
  const rowNo = rowIndex + 2; // Excel row number (1-indexed + header)
  const doc = {};
  const unmapped = [];
  
  header.forEach((h, i) => {
    if (!h) return;
    
    const value = row[i];
    if (value === null || value === undefined || value === '') return;
    
    const field = FIELD_MAP[h];
    if (!field) {
      unmapped.push({ header: h, value });
      return;
    }
    
    // Apply type conversions
    if (field.includes('Date') && field !== 'paymentDateType') {
      doc[field] = toDate(value);
    } else if (['discount', 'commissionPercent', 'markUpOnCostRsp', 'rspRoundOff', 
                'markUpOnCostWsp', 'wspRoundOff', 'markUpOnCostDp', 'dpRoundOff',
                'orderDeliveryEstimatedDays', 'orderAcceptedDelaysDays', 'orderAdvanceLimit',
                'paymentWithinDays', 'discountAllowWithinPercent', 'discountAllowInDays',
                'openingBalance', 'tdsPercent', 'maximumOverDueDays'].includes(field)) {
      doc[field] = toNumber(value);
    } else if (field === 'sameAsBilling' || field.includes('allow')) {
      doc[field] = toBoolean(value);
    } else {
      doc[field] = clean(value);
    }
  });
  
  return { doc, rowNo, unmapped };
}

/**
 * Validate supplier record
 */
function validateSupplier(doc, rowNo) {
  const errors = [];
  
  if (!doc.businessName) {
    errors.push(`Row ${rowNo}: Business Name is required`);
  }
  
  if (!doc.contactId) {
    errors.push(`Row ${rowNo}: Contact ID is required`);
  }
  
  if (!doc.billingMobile) {
    errors.push(`Row ${rowNo}: Mobile number is required`);
  }
  
  // GST validation (if provided)
  if (doc.gstNo) {
    doc.gstNo = doc.gstNo.toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(doc.gstNo)) {
      errors.push(`Row ${rowNo}: Invalid GST format: ${doc.gstNo}`);
    }
  }
  
  // PAN validation (if provided)
  if (doc.pan) {
    doc.pan = doc.pan.toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(doc.pan)) {
      errors.push(`Row ${rowNo}: Invalid PAN format: ${doc.pan}`);
    }
  }
  
  // Mobile validation
  if (doc.billingMobile) {
    const mobile = doc.billingMobile.replace(/[\s-]/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      errors.push(`Row ${rowNo}: Invalid mobile format: ${doc.billingMobile}`);
    }
    doc.billingMobile = mobile;
  }
  
  // Email validation
  if (doc.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.billingEmail)) {
    errors.push(`Row ${rowNo}: Invalid email format: ${doc.billingEmail}`);
  }
  
  return errors;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log(`  SUPPLIER IMPORT - ${APPLY ? 'APPLY MODE' : 'DRY RUN MODE'}`);
  console.log('='.repeat(70));
  
  if (!APPLY) {
    console.log('\n⚠️  DRY RUN MODE - No data will be written');
    console.log('   Add --apply flag to actually import data');
  }
  
  // Check file exists
  if (!existsSync(EXCEL_PATH)) {
    console.error(`\n❌ Excel file not found: ${EXCEL_PATH}`);
    console.error('\nSet SUPPLIER_EXCEL_PATH environment variable or place suppliers.xlsx in project root');
    process.exit(1);
  }
  
  // Parse Excel
  const { header, rows } = parseExcel();
  
  // Map rows to documents
  console.log('\n🔄 Processing rows...');
  const suppliers = [];
  const seenCodes = new Map();
  
  rows.forEach((row, i) => {
    const { doc, rowNo, unmapped } = mapRow(row, header, i);
    
    // Validate
    const errors = validateSupplier(doc, rowNo);
    if (errors.length > 0) {
      report.excel.errors.push(...errors);
      report.excel.skipped.push({ row: rowNo, reason: errors.join('; ') });
      return;
    }
    
    // Check for duplicates
    const code = doc.contactId.toUpperCase();
    if (seenCodes.has(code)) {
      report.duplicates.push({
        row: rowNo,
        code: doc.contactId,
        name: doc.businessName,
        firstRow: seenCodes.get(code)
      });
      report.excel.skipped.push({ row: rowNo, reason: `Duplicate Contact ID: ${doc.contactId}` });
      return;
    }
    
    seenCodes.set(code, rowNo);
    
    // Add to valid suppliers
    suppliers.push({ ...doc, _rowNo: rowNo });
    if (unmapped.length > 0 && i < 5) {
      console.log(`   Row ${rowNo}: Unmapped columns:`, unmapped.map(u => u.header).join(', '));
    }
  });
  
  report.excel.valid = suppliers.length;
  
  console.log(`\n📊 Parsing Results:`);
  console.log(`   Total rows:        ${report.excel.rows}`);
  console.log(`   Valid suppliers:   ${report.excel.valid}`);
  console.log(`   Skipped:           ${report.excel.skipped.length}`);
  console.log(`   Duplicates:        ${report.duplicates.length}`);
  console.log(`   Errors:            ${report.excel.errors.length}`);
  
  if (report.excel.errors.length > 0) {
    console.log('\n❌ Validation Errors:');
    report.excel.errors.slice(0, 10).forEach(err => console.log(`   ${err}`));
    if (report.excel.errors.length > 10) {
      console.log(`   ... and ${report.excel.errors.length - 10} more errors`);
    }
  }
  
  if (suppliers.length === 0) {
    console.log('\n⚠️  No valid suppliers to import');
    process.exit(0);
  }
  
  // Connect to database
  console.log('\n🔌 Connecting to MongoDB...');
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const contacts = db.collection('contact');
  
  // Check existing
  const existing = await contacts.countDocuments({ contactKind: 'Supplier' });
  report.before.total = existing;
  console.log(`   Current suppliers in DB: ${existing}`);
  
  // Get business and type IDs
  const businessId = (await db.collection('business').findOne({ isMainBranch: true }))?._id;
  const contactType = await db.collection('contacttype').findOne({ contactKind: 'Supplier' });
  const typeId = contactType?._id || null;
  
  console.log(`   Business ID: ${businessId || 'None'}`);
  console.log(`   Type ID: ${typeId || 'None'}`);
  
  // Create backup
  if (APPLY) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(BACKUP_DIR, `suppliers-before-import-${stamp}.json`);
    const existingSuppliers = await contacts.find({ contactKind: 'Supplier' }).toArray();
    writeFileSync(backupFile, JSON.stringify(existingSuppliers, null, 2));
    report.backupFile = backupFile;
    console.log(`   Backup created: ${backupFile}`);
  }
  
  // Show preview
  console.log('\n📋 Preview (first 5 suppliers):');
  suppliers.slice(0, 5).forEach(s => {
    console.log(`   ${s.contactId.padEnd(10)} ${s.businessName.slice(0, 35).padEnd(35)} ${s.billingMobile || ''}`);
  });
  if (suppliers.length > 5) {
    console.log(`   ... and ${suppliers.length - 5} more`);
  }
  
  // Import
  if (APPLY) {
    console.log('\n💾 Importing suppliers...');
    
    for (const supplier of suppliers) {
      const { _rowNo, ...doc } = supplier;
      
      try {
        await contacts.insertOne({
          ...doc,
          contactKind: 'Supplier',
          businessId,
          typeId,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0
        });
        report.inserted++;
        
        if (report.inserted % 50 === 0) {
          console.log(`   Imported ${report.inserted}/${suppliers.length}...`);
        }
      } catch (error) {
        report.excel.errors.push(`Row ${_rowNo}: Failed to insert - ${error.message}`);
      }
    }
    
    report.after.total = await contacts.countDocuments({ contactKind: 'Supplier' });
    
    console.log('\n✅ Import completed!');
    console.log(`   Inserted: ${report.inserted}`);
    console.log(`   Total suppliers now: ${report.after.total}`);
  } else {
    console.log('\n⚠️  DRY RUN - No data was written');
    console.log('   Run with --apply flag to import');
  }
  
  // Write report
  report.finishedAt = new Date().toISOString();
  const reportFile = path.join(ROOT, 'supplier-import-report.json');
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved: ${reportFile}`);
  
  await mongoose.disconnect();
  console.log('\n' + '='.repeat(70));
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error);
  process.exit(1);
});
