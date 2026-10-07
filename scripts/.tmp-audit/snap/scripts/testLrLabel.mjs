/* Tests the LR / Transaction Number picker: the vendor join, the composed
   label, and what happens when the vendor data is incomplete.

   THE ACCEPTANCE CRITERION

     LR/26/011 | 64187 | G524 | KARNATAKA Saree Centre, MYSORE

   transaction number | LR number | vendor number | vendor name, with the
   vendor resolved through supplierId and NOT stored on the delivery.

   It exercises the real sourceLabel() from lib/sourceLabel.js rather than a
   copy of it, so a change to the composition rule breaks this test rather
   than passing quietly.

   Also proves the parts degrade independently - missing vendor number,
   missing vendor name, null supplier, and a delivery whose supplierId points
   at nothing - because a picker that hides records with imperfect master data
   is worse than one that shows them plainly.

   HOW TO RUN

     npx next build && npx next start -p 3111      (in one terminal)
     npm run test:lr                               (in another)

   It inserts one temporary delivery to test the dangling-reference case and
   deletes it again, along with the temporary sign-in account. Nothing else
   is written. */

import mongoose from 'mongoose';
import crypto from 'crypto';
import { sourceLabel } from '../lib/sourceLabel.js';
const BASE=process.env.E2E_BASE||'http://127.0.0.1:3111';
await mongoose.connect(process.env.MONGODB_URI);
const db=mongoose.connection.db;
let pass=0,fail=0;
const ok=(n,c,d='')=>{ c?(pass++,console.log('  PASS  '+n)) : (fail++,console.log('  FAIL  '+n+(d?'  -> '+d:''))); };

/* the exact card spec the GRC form uses */
const CARD={ sourceLabel:'transactionNo', sourceSubLabel:['lrNumber','supplier.vendorNo','supplier.vendorName'] };

const salt=crypto.randomBytes(16).toString('hex'); const pw='Lr-'+crypto.randomBytes(6).toString('hex');
const email='lr-test@example.invalid';
await db.collection('user').deleteOne({email});
await db.collection('user').insertOne({name:'LR',email,password:salt+':'+crypto.scryptSync(pw,salt,64).toString('hex'),role:'Super Admin',isActive:true,createdAt:new Date(),updatedAt:new Date()});
const lg=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});
const cookie=(lg.headers.get('set-cookie')||'').split(';')[0];
const api=(p)=>fetch(BASE+p,{headers:{Cookie:cookie}}).then(async r=>({ok:r.ok,body:await r.json().catch(()=>null)}));

const lr=await db.collection('delivery').findOne({transactionNo:'LR/26/011'});
const sup=await db.collection('contact').findOne({_id:lr.supplierId});
const q=`business=${lr.businessId}&location=${lr.locationId}&finYear=${lr.finYear}`;

console.log('--- 1. API joins the vendor ---');
const r=await api(`/api/purchase-grc?availableLr=1&${q}&supplierId=${lr.supplierId}`);
const row=(r.body.rows||[]).find(x=>x.transactionNo==='LR/26/011');
ok('row returned', Boolean(row));
ok('supplier object attached', Boolean(row?.supplier), JSON.stringify(row?.supplier));
ok('vendorNo = contact.contactId', row?.supplier?.vendorNo===sup.contactId, `${row?.supplier?.vendorNo} vs ${sup.contactId}`);
ok('vendorName = contact.businessName', row?.supplier?.vendorName===sup.businessName, `${row?.supplier?.vendorName}`);
ok('supplierId still the raw reference', String(row?.supplierId)===String(lr.supplierId));
ok('lrNumber preserved', row?.lrNumber===lr.lrNumber, row?.lrNumber);
ok('transactionNo preserved', row?.transactionNo===lr.transactionNo);

console.log('--- 2. composed label (the REAL function) ---');
const label=sourceLabel(CARD,row);
console.log('     ->', label);
ok('matches "No | LR | VendorNo | VendorName"', label===`LR/26/011 | 64187 | ${sup.contactId} | ${sup.businessName}`, label);
ok('pipe separated', label.split(' | ').length===4);

console.log('--- 3. value stored is the id, not the text ---');
ok('option value is the delivery _id', /^[a-f0-9]{24}$/.test(String(row._id)), String(row._id));
ok('label never equals the value', label!==String(row._id));

console.log('--- 4. graceful degradation ---');
const base={ transactionNo:'LR/26/099', lrNumber:'999', _id:'x' };
ok('no vendor NUMBER -> name only',
  sourceLabel(CARD,{...base,supplier:{vendorNo:'',vendorName:'ABC Suppliers'}})==='LR/26/099 | 999 | ABC Suppliers',
  sourceLabel(CARD,{...base,supplier:{vendorNo:'',vendorName:'ABC Suppliers'}}));
ok('no vendor NAME -> number only',
  sourceLabel(CARD,{...base,supplier:{vendorNo:'G777',vendorName:''}})==='LR/26/099 | 999 | G777',
  sourceLabel(CARD,{...base,supplier:{vendorNo:'G777',vendorName:''}}));
ok('supplier null -> LR still shows',
  sourceLabel(CARD,{...base,supplier:null})==='LR/26/099 | 999',
  sourceLabel(CARD,{...base,supplier:null}));
ok('supplier key absent -> no crash',
  sourceLabel(CARD,base)==='LR/26/099 | 999', sourceLabel(CARD,base));
ok('no lrNumber and no vendor -> bare transaction no',
  sourceLabel(CARD,{transactionNo:'LR/26/100',_id:'y'})==='LR/26/100',
  sourceLabel(CARD,{transactionNo:'LR/26/100',_id:'y'}));

console.log('--- 5. a broken supplierId on a real record ---');
const ghost=new mongoose.Types.ObjectId();
const tmp=await db.collection('delivery').insertOne({...lr,_id:new mongoose.Types.ObjectId(),transactionNo:'LR/26/TMP',supplierId:ghost,createdAt:new Date(),updatedAt:new Date()});
const r2=await api(`/api/purchase-grc?availableLr=1&${q}&supplierId=${ghost}`);
const grow=(r2.body.rows||[]).find(x=>x.transactionNo==='LR/26/TMP');
ok('LR with a dangling supplierId still returned', Boolean(grow), JSON.stringify((r2.body.rows||[]).map(x=>x.transactionNo)));
ok('its supplier is null, not a crash', grow?.supplier===null, JSON.stringify(grow?.supplier));
ok('it still labels readably', sourceLabel(CARD,grow||{})==='LR/26/TMP | 64187', sourceLabel(CARD,grow||{}));
await db.collection('delivery').deleteOne({_id:tmp.insertedId});
console.log('  (temp LR removed)');

console.log('--- 6. searching the dropdown by vendor ---');
const term='KARNATAKA';
ok('label contains the vendor name, so client-side search matches',
  label.toLowerCase().includes(term.toLowerCase()), label);
ok('label contains the vendor number too', label.includes(sup.contactId));

await db.collection('user').deleteOne({email});
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect(); process.exit(fail?1:0);
