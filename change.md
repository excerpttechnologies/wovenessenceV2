# Changes

## 26-10-2026

### NEW

- models/PosFooterTemplate.js
- app/admin/setting/pos-footer/fields.js
- app/admin/setting/pos-footer/page.jsx
- app/admin/setting/pos-footer/add/page.jsx
- app/admin/setting/pos-footer/[id]/page.jsx
- app/api/pos-footer-template/route.js
- app/api/pos-footer-template/[id]/route.js
- app/api/invoice-email/route.js

### EXISTING

- components/PosTill.jsx (scan box / search in capitals)
- package.json (nodemailer added)
- package-lock.json
- .env (SMTP_USER / SMTP_PASS / SMTP_FROM - not in git)

- config/nav.js
- lib/screenPermission.js

- components/PosInvoiceView.jsx
- components/PosTill.jsx
- app/admin/transaction/sell/pos/print/[id]/page.jsx

## 23-10-2026

### EXISTING

- app/admin/transaction/sell/pos/print/[id]/page.jsx
- components/PosInvoiceView.jsx
- app/admin/transaction/sell/pos/page.jsx
- config/nav.js
- components/BarcodeDetailView.jsx
- app/admin/ecommerce/product-eccom/page.jsx

## 22-10-2026

### NEW

- app/api/invoice-share/route.js
- app/invoice/[token]/route.js

### EXISTING

- app/api/sell-pos/route.js
- components/PosTill.jsx
- models/User.js
- app/api/user/route.js
- app/api/user/[id]/route.js
- app/api/auth/[action]/route.js
- app/admin/staff-management/roles-permissions/page.jsx
- app/admin/transaction/sell/pos/print/[id]/page.jsx
- components/PosInvoiceView.jsx
- app/api/product-eccom/route.js
- app/admin/ecommerce/product-eccom/add/page.jsx

## 21-10-2026

### NEW

- SELL_MODULE_DOCUMENTATION.pdf
- INTERCOMPANY_SELL_MODULE_DOCUMENTATION.pdf
- seedImagePaths.mjs
- app/api/sell-pos/[id]/archive/route.js
- app/api/pos-archive/route.js
- app/api/pos-archive/[id]/route.js
- app/admin/archive/pos/page.jsx
- app/api/sell-pos/last/route.js

### EXISTING

- components/FormView.jsx
- lib/docnumber.js
- app/admin/transaction/sell/pos/page.jsx
- components/PosInvoiceView.jsx
- config/nav.js
- components/Sidebar.jsx
- components/TransactionFormView.jsx
- app/admin/transaction/purchase/grc/[id]/page.jsx
- app/admin/transaction/purchase/barcode-print/[id]/page.jsx
- components/ChallanDocument.jsx
- components/SellChallanView.jsx
- components/PosReturnForm.jsx
- components/IcChallanForm.jsx
- components/TabbedFormView.jsx
- components/StockTransferForm.jsx
- components/StockTransferDetail.jsx
- components/StockTransferPacketForm.jsx
- components/TransferChallanView.jsx
- app/api/sell-pos/route.js
- app/admin/transaction/sell/pos/print/[id]/page.jsx
- components/PosTill.jsx
- components/ProductImage.jsx

## 19-10-2026

### NEW

- app/admin/ecommerce/product-eccom/page.jsx
- app/api/product-eccom/route.js
- app/admin/ecommerce/product-eccom/add/page.jsx

### EXISTING

- config/nav.js
- app/admin/transaction/sell/deliverychallan/page.jsx
- app/admin/transaction/sell/pos/page.jsx
- app/admin/transaction/sell/pos-return/page.jsx
- app/api/sell-deliverychallan/route.js
- app/api/sell-pos/route.js
- app/api/sell-pos-return/route.js
- components/NumberedPager.jsx
- app/admin/transaction/intercompanysell/deliverychallan/page.jsx
- app/admin/transaction/intercompanysell/receivedeliverychallan/page.jsx
- app/admin/transaction/intercompanysell/sales-invoice/page.jsx
- app/admin/transaction/intercompanysell/auto-purchase-receiveds/page.jsx
- app/admin/transaction/intercompanysell/consignment/page.jsx
- app/api/ic-delivery-challan/route.js
- components/PosTill.jsx
- app/admin/logistic/page.jsx
- app/admin/transport/vehicle/page.jsx
- app/admin/transport/driver/page.jsx
- app/admin/transport/route/page.jsx
- app/admin/transport/dispatch/page.jsx
- app/admin/transaction/purchase/grc/page.jsx
- app/admin/transaction/purchase/grt/page.jsx
- components/DeliveryView.jsx
- components/Listviewgrt.jsx
- app/api/logistic/route.js
- app/api/vehicle/route.js
- app/api/driver/route.js
- app/api/transport-route/route.js
- app/api/dispatch/route.js
- app/api/purchase-grc/route.js
- app/api/purchase-grt/route.js
- app/api/delivery/route.js
- app/admin/transaction/stocktransfers/transfer/page.jsx
- app/admin/transaction/stocktransfers/incoming/page.jsx
- app/admin/transaction/stocktransfers/transferstocklocation/page.jsx
- app/admin/transaction/stocktransfers/transferstockreceiveds/page.jsx
- components/StockTransferPacketList.jsx
- app/api/stock-transfer/route.js
- app/api/stock-transfer-location/route.js
- app/api/stock-transfer-packet/route.js
- app/api/stock-transfer-received/route.js
- app/admin/staff-management/staff/salesperson/page.jsx
- app/admin/staff-management/roles-permissions/page.jsx
- components/CashRegisterList.jsx
- components/VoucherList.jsx
- app/api/sales-person/route.js
- app/api/cash-register/route.js
- app/api/voucher/route.js
- app/admin/transaction/sell/pos/print/[id]/page.jsx

## 17-10-2026

### NEW

- lib/listSort.js
- components/NumberedPager.jsx

### EXISTING

- lib/screenPermission.js
- app/api/ic-receive-delivery-challan/route.js
- app/api/ic-delivery-challan/item-lookup/route.js
- app/api/ic-delivery-challan/item-codes/route.js
- app/api/ic-destinations/route.js
- app/admin/transaction/intercompanysell/consignment/page.jsx
- app/api/loyalty/route.js
- app/api/barcode/scan/route.js
- app/api/reports/master-stock-report/route.js
- app/api/reports/master-stock-report/item-details/route.js
- app/api/reports/master-stock-report/supplier-details/route.js
- app/api/reports/master-stock-report/missing-images/route.js
- app/api/reports/barcode-suggest/route.js
- app/api/reports/barcode-report/route.js
- app/api/reports/barcode-report/import/route.js
- app/api/reports/barcode-detail/route.js
- app/api/barcode-image/route.js
- app/admin/reports/barcode-report/page.jsx
- app/api/delivery/route.js
- app/api/delivery/[id]/route.js
- app/api/purchase-grc/route.js
- app/api/purchase-grc/[id]/route.js
- app/api/purchase-grc/[id]/print/route.js
- app/api/grc/[id]/route.js
- app/api/grc/[id]/download/route.js
- app/api/barcode-generation/route.js
- app/api/barcode-generation/next-serial/route.js
- app/api/purchase-grt/route.js
- app/api/purchase-grt/[id]/route.js
- app/api/attachments/route.js
- app/admin/transaction/purchase/grc/page.jsx
- components/DeliveryView.jsx
- components/Listviewgrt.jsx
- components/ListView.jsx
- app/admin/setting/business/page.jsx
- app/api/business/route.js
- components/BarcodeSettingsView.jsx
- app/admin/setting/users/fields.js
- app/admin/setting/companylocations/page.jsx
- app/admin/transport/transporter/page.jsx
- app/admin/setting/ledgergroups/page.jsx
- app/admin/setting/ledger/page.jsx
- app/admin/setting/docsetup/page.jsx
- app/admin/setting/purchasegroup/page.jsx
- app/admin/setting/stockpoint/page.jsx
- app/admin/setting/poscounter/page.jsx
- app/admin/setting/split-barcode-setting/page.jsx
- app/admin/setting/paymentmethod/page.jsx
- app/admin/setting/tax/page.jsx
- app/admin/setting/hsn/page.jsx
- app/admin/setting/citygroup/page.jsx
- app/admin/setting/purchase/master/charge/page.jsx
- app/admin/setting/purchase/master/term/page.jsx
- app/admin/setting/sales/master/term/page.jsx
- app/api/user/route.js
- app/api/company-location/route.js
- app/api/transporter/route.js
- app/api/ledger-group/route.js
- app/api/ledger/route.js
- app/api/doc-setup/route.js
- app/api/purchase-group/route.js
- app/api/stock-point/route.js
- app/api/pos-counter/route.js
- app/api/split-barcode-setting/route.js
- app/api/payment-method/route.js
- app/api/tax/route.js
- app/api/hsn/route.js
- app/api/city-group/route.js
- app/api/purchase-charge/route.js
- app/api/purchase-term/route.js
- app/api/sales-term/route.js
- app/api/barcode-setting/route.js
- lib/listSort.js
- app/admin/inventory/product/filter/page.jsx
- app/admin/inventory/product/group/page.jsx
- app/admin/inventory/uom/page.jsx
- app/admin/inventory/attribute-addon/page.jsx
- app/admin/inventory/item/page.jsx
- app/admin/inventory/barcodeitem/page.jsx
- app/admin/inventory/stock-adjustment/page.jsx
- app/api/product-filter/route.js
- app/api/product-group/route.js
- app/api/uom/route.js
- app/api/attribute-addon/route.js
- app/api/item/route.js
- app/api/inventory-barcode-list/route.js
- app/api/stock-adjustment/route.js
- app/admin/contact/contact-type/page.jsx
- app/admin/contact/supplier/page.jsx
- app/admin/contact/agent/page.jsx
- app/admin/contact/customer/page.jsx
- app/api/contact-type/route.js
- app/api/supplier/route.js
- app/api/agent/route.js
- app/api/customer/route.js

## 16-10-2026

### NEW

- scripts/seedBarcodesFromNewData.mjs
- scripts/copyNewDataToDb.mjs
- scripts/copyMissingToDb.mjs
- scripts/fixItemGroupsFromNewData.mjs
- scripts/removeNonExcelBarcodes.mjs
- scripts/reports/ (seed dry-run / apply CSVs and the item-groups backup JSON written by the scripts above)

## 09-10-2026

### NEW

- lib/einvoice/payload.js
- lib/einvoice/provider.js
- app/api/ic-item-invoice/[id]/einvoice/route.js
- E-invoice.md

### EXISTING

- models/IcItemInvoice.js
- app/api/ic-item-invoice/[id]/print/route.js
- components/IcTaxInvoiceView.jsx
- app/admin/transaction/intercompanysell/sales-invoice/print/[id]/page.jsx
- package.json
- package-lock.json

## 06-10-2026

### EXISTING

- app/admin/transaction/sell/pos/print/[id]/page.jsx

## 05-10-2026

### NEW

- app/admin/report/master-stock-report/layout.js  

### EXISTING

- lib/icStock.js
- app/api/ic-receive-delivery-challan/route.js
- app/admin/transaction/intercompanysell/receivedeliverychallan/page.jsx
- lib/inventory.js
- lib/barcodeLabel.js
- app/api/sell-pos/route.js
- app/api/sell-pos-return/route.js
- app/api/ic-item-invoice/route.js
- app/admin/transaction/intercompanysell/sales-invoice/page.jsx
- app/admin/transaction/sell/pos/page.jsx
- components/ListView.jsx
- components/PosTill.jsx

## 01-10-2026

### NEW

- app/admin/transaction/intercompanysell/consignment/page.jsx
- app/admin/transaction/intercompanysell/sales-invoice/print/[id]/page.jsx
- app/api/ic-item-invoice/[id]/print/route.js
- app/api/reports/supplier-cities/route.js

### EXISTING

- app/admin/transaction/intercompanysell/receivedeliverychallan/page.jsx
- config/nav.js
- app/api/ic-receive-delivery-challan/route.js
- models/IcDeliveryChallan.js
- app/api/ic-item-invoice/route.js
- app/admin/transaction/intercompanysell/sales-invoice/page.jsx
- components/IcTaxInvoiceView.jsx
- app/admin/transaction/sell/pos/page.jsx
- app/api/sell-pos/route.js
- components/FilterPanel.jsx
- components/ListView.jsx
- components/PosInvoiceView.jsx
- components/IcChallanForm.jsx
- app/admin/report/master-stock-report/fields.js
- app/api/reports/master-stock-report/route.js
- app/api/options/route.js
- components/ReportView.jsx
- components/useOptions.js

## 30-09-2026

### NEW

- README.md
- lib/shareRoutes.js
- models/IcItemInvoice.js
- app/api/ic-item-invoice/route.js
- app/admin/transaction/intercompanysell/sales-invoice/page.jsx

### EXISTING

- app/admin/transaction/sell/pos/page.jsx
- app/admin/transaction/sell/pos/print/[id]/page.jsx
- app/admin/transaction/sell/pos-return/add/page.jsx
- app/api/sell-pos/[id]/route.js
- app/api/sell-pos/route.js
- components/PosTill.jsx
- components/PosReturnForm.jsx
- components/PosInvoiceView.jsx
- components/ShareDocDialog.jsx
- components/ListView.jsx
- components/Icon.jsx
- lib/barcodeLabel.js
- lib/screenPermission.js
- config/nav.js
- components/MultiplePayDialog.jsx
- app/admin/setting/loyaltypoint/fields.js
- models/LoyaltyPoint.js
- lib/loyalty.js
- app/api/loyalty/route.js

## 29-09-2026

### NEW

- components/PosInvoiceView.jsx
- components/PosPaymentsView.jsx

### EXISTING

- app/admin/pos/add/page.jsx
- app/admin/transaction/sell/pos/page.jsx
- app/admin/transaction/sell/pos/payment/[id]/page.jsx
- app/admin/transaction/sell/pos/print/[id]/page.jsx
- app/admin/transaction/sell/pos/view/[id]/page.jsx
- app/api/sell-pos/route.js
- app/api/sell-pos/[id]/route.js
- app/api/sell-pos-return/lookup/route.js
- components/PosTill.jsx
- components/PosReturnForm.jsx
- components/MultiplePayDialog.jsx
- components/ShareDocDialog.jsx
- components/ListView.jsx
- components/Icon.jsx
- lib/format.js
- lib/inventory.js

## 28-09-2026

### NEW

- models/LoyaltyLedger.js
- lib/loyalty.js
- app/api/loyalty/route.js
- components/StockAdjustmentView.jsx

### EXISTING

- components/PosTill.jsx
- app/api/sell-pos/route.js
- models/PosInvoice.js
- app/admin/transaction/sell/pos/page.jsx
- app/admin/inventory/stock-adjustment/page.jsx
- components/ListView.jsx
- components/Toolbar.jsx
- components/Icon.jsx
- components/SupplierImportPanel.jsx
- lib/format.js

## 26-09-2026

### EXISTING

- app/admin/transaction/intercompanysell/receivedeliverychallan/page.jsx
- app/api/ic-delivery-challan/route.js
- components/IcChallanForm.jsx
- app/admin/transaction/intercompanysell/deliverychallan/page.jsx
- components/ListView.jsx
- components/PosTill.jsx
- app/globals.css
- tailwind.config.js

## 25-09-2026

### EXISTING

- lib/screenPermission.js
- app/api/doc-setup/route.js
- app/api/doc-setup/[id]/route.js
- app/api/purchase-group/route.js
- app/api/purchase-group/[id]/route.js
- app/api/stock-point/route.js
- app/api/stock-point/[id]/route.js
- app/api/pos-counter/route.js
- app/api/pos-counter/[id]/route.js
- app/api/barcode-setting/route.js
- app/api/barcode-setting/[id]/route.js
- app/api/split-barcode-setting/route.js
- app/api/split-barcode-setting/[id]/route.js
- components/BarcodeSettingsView.jsx
- app/api/barcode-label-setting/route.js
- app/api/purchase-rate-code/route.js
- app/api/payment-method/route.js
- app/api/payment-method/[id]/route.js
- components/ChoiceTableView.jsx
- app/admin/setting/purchase-rate-code/page.jsx
- app/api/tax/route.js
- app/api/tax/[id]/route.js
- app/api/hsn/route.js
- app/api/hsn/[id]/route.js
- app/api/city-group/route.js
- app/api/city-group/[id]/route.js
- app/api/purchase-charge/route.js
- app/api/purchase-charge/[id]/route.js
- app/api/purchase-term/route.js
- app/api/purchase-term/[id]/route.js
- app/api/sales-term/route.js
- app/api/sales-term/[id]/route.js
- app/api/loyalty-point/route.js
- app/api/login-security/route.js
- app/api/pos-setting/route.js
- components/SingleFormView.jsx
- app/api/ecom-setting/route.js
- app/api/location-setting/route.js
- app/api/invoice-layout-setting/route.js
- app/api/business-contact/route.js
- components/PosTill.jsx

## 24-09-2026

### NEW

- app/api/my-permissions/route.js

### EXISTING

- components/IcChallanPrintView.jsx
- components/ScopeContext.jsx
- components/ListView.jsx
- components/Toolbar.jsx
- components/TabbedFormView.jsx
- components/FormView.jsx
- lib/screenPermission.js
- app/api/customer/route.js
- app/api/customer/[id]/route.js
- app/api/customer/[id]/history/route.js
- app/admin/contact/customer/page.jsx
- app/admin/staff-management/roles-permissions/page.jsx
- app/api/product-filter/route.js
- app/api/product-filter/[id]/route.js
- app/api/product-group/route.js
- app/api/product-group/[id]/route.js
- app/api/uom/route.js
- app/api/uom/[id]/route.js
- app/api/attribute-addon/route.js
- app/api/attribute-addon/[id]/route.js
- app/api/item/route.js
- app/api/item/[id]/route.js
- app/api/item/[id]/detail/route.js
- app/api/barcode-generation/route.js
- app/api/inventory-barcode-list/route.js
- app/api/sell-deliverychallan/route.js
- app/api/sell-deliverychallan/[id]/route.js
- app/api/sell-pos/route.js
- app/api/sell-pos/[id]/route.js
- app/api/sell-pos/recent/route.js
- app/api/pos-hold/route.js
- app/api/pos-hold/[id]/route.js
- app/api/sell-pos-return/route.js
- app/api/sell-pos-return/[id]/route.js
- app/api/sell-pos-return/lookup/route.js
- app/api/business/route.js
- app/api/business/[id]/route.js
- app/api/company-location/route.js
- app/api/company-location/[id]/route.js
- app/api/transporter/route.js
- app/api/transporter/[id]/route.js
- app/api/ledger-group/route.js
- app/api/ledger-group/[id]/route.js
- app/api/ledger/route.js
- app/api/ledger/[id]/route.js
- app/api/ledger-group-mapping/route.js
- app/api/voucher-setting/route.js
- components/MappingView.jsx
- components/VoucherSettingsView.jsx
- app/api/stock-adjustment/route.js
- app/api/stock-adjustment/[id]/route.js

## 23-09-2026

### NEW

- app/admin/staff-management/roles-permissions/fields.js
- app/admin/staff-management/roles-permissions/page.jsx
- models/RolePermission.js
- app/api/role-permission/route.js
- models/Role.js
- app/api/role/route.js
- app/api/role/[id]/route.js
- lib/screenPermission.js

### EXISTING

- config/nav.js
- app/api/user/route.js
- app/api/user/[id]/route.js
- app/api/ic-delivery-challan/route.js
- app/api/ic-delivery-challan/[id]/route.js
- app/api/ic-receive-delivery-challan/route.js
- app/api/contact-type/route.js
- app/api/contact-type/[id]/route.js
- app/api/supplier/route.js
- app/api/supplier/[id]/route.js
- app/api/agent/route.js
- app/api/agent/[id]/route.js

## 22-09-2026

### NEW

- lib/icReceive.js
- scripts/receivePendingIcChallans.mjs
- change.md

### EXISTING

- app/api/ic-delivery-challan/route.js
- app/api/ic-receive-delivery-challan/route.js
- app/admin/transaction/intercompanysell/receivedeliverychallan/page.jsx
- package.json




















# everything in the file
node --env-file=.env restore-barcodes.mjs .backups/deleted-6A-7A-barcodes-2026-10-01.json

# only one series from the file
node --env-file=.env restore-barcodes.mjs .backups/deleted-6A-7A-barcodes-2026-10-01.json 6A
