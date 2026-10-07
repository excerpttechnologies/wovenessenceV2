/* End-to-end test of the GRC vendor -> LR -> invoice pipeline, driven through
   the real HTTP API against the real database.

   WHAT IT PROVES

     - the vendor dropdown loads WITHOUT typing (the "No options" bug)
     - the option label carries the G-code, and the stored value is the
       ObjectId, never the formatted text
     - one company's vendor list never contains another company's vendors
     - searching by NAME and by G-CODE both find the same supplier
     - the vendor's GST is available for the read-only GST box
     - the LR dropdown is filtered to the selected vendor, and carries the
       LR number / invoice / value needed to tell two consignments apart
     - the server REJECTS an LR that belongs to a different vendor
     - a saved GRC stores supplier and LR REFERENCES, with the invoice number
       and LR number copied off the delivery
     - one LR cannot produce a second GRC, and a consumed LR leaves the list

   HOW TO RUN

     npx next build && npx next start -p 3111      (in one terminal)
     npm run test:grc                              (in another)

   It creates one GRC against a real LR and deletes it again, along with the
   temporary sign-in account. It modifies nothing else. */

import mongoose from 'mongoose';
import crypto from 'crypto';
const BASE=process.env.E2E_BASE||'http://127.0.0.1:3111';
await mongoose.connect(process.env.MONGODB_URI);
const db=mongoose.connection.db;
let pass=0,fail=0;
const ok=(n,c,d='')=>{ c?(pass++,console.log('  PASS  '+n)) : (fail++,console.log('  FAIL  '+n+(d?'  -> '+d:''))); };

const salt=crypto.randomBytes(16).toString('hex'); const pw='Grc-'+crypto.randomBytes(6).toString('hex');
const email='grc-test@example.invalid';
await db.collection('user').deleteOne({email});
await db.collection('user').insertOne({name:'GRC',email,password:salt+':'+crypto.scryptSync(pw,salt,64).toString('hex'),role:'Super Admin',isActive:true,createdAt:new Date(),updatedAt:new Date()});
const lg=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw})});
const cookie=(lg.headers.get('set-cookie')||'').split(';')[0];
const api=(p,o={})=>fetch(BASE+p,{...o,headers:{'Content-Type':'application/json',Cookie:cookie,...(o.headers||{})}}).then(async r=>({status:r.status,ok:r.ok,body:await r.json().catch(()=>null)}));

const lr=await db.collection('delivery').findOne({transactionNo:'LR/26/011'});
const business=String(lr.businessId), location=String(lr.locationId), finYear=lr.finYear;
const sup=await db.collection('contact').findOne({_id:lr.supplierId});
console.log(`\nreal data: ${lr.transactionNo} | supplier ${sup.businessName} (${sup.contactId}) | inv ${lr.invPmNumber}\n`);

console.log('--- 1. supplier dropdown ---');
const all=await api(`/api/options?ref=supplier&business=${business}`);
ok('loads without typing anything', all.ok && all.body.options.length>0, 'got '+(all.body?.options?.length));
ok('label carries the G-code', /\(G\d+\)|\([A-Z]+\d+\)/.test(all.body.options.map(o=>o.label).join('|')), all.body.options[0]?.label);
ok('value is the ObjectId, not the text', /^[a-f0-9]{24}$/.test(all.body.options[0]?.value||''), all.body.options[0]?.value);
const wrongBiz=await db.collection('contact').find({contactKind:'Supplier',businessId:{$ne:lr.businessId}}).toArray();
const leaked=all.body.options.filter(o=>wrongBiz.some(w=>String(w._id)===o.value));
ok('no other company\'s vendors leak in', leaked.length===0, leaked.map(l=>l.label).join(','));

console.log('--- 2. search ---');
const byName=await api(`/api/options?ref=supplier&business=${business}&q=KARNATAKA`);
ok('search by NAME finds it', byName.body.options.some(o=>o.value===String(sup._id)), byName.body.options.map(o=>o.label).slice(0,3).join(' | '));
const byCode=await api(`/api/options?ref=supplier&business=${business}&q=${sup.contactId}`);
ok(`search by G-CODE (${sup.contactId}) finds it`, byCode.body.options.some(o=>o.value===String(sup._id)), byCode.body.options.map(o=>o.label).slice(0,3).join(' | '));
console.log('     ->', byCode.body.options.find(o=>o.value===String(sup._id))?.label);

console.log('--- 3. vendor GST ---');
const det=await api('/api/supplier/'+sup._id);
ok('supplier detail returns gstNo for the GST box', det.ok && 'gstNo' in (det.body.doc||{}), JSON.stringify(det.body?.doc?.gstNo));

console.log('--- 4. LR filtered by vendor ---');
const lrs=await api(`/api/purchase-grc?availableLr=1&business=${business}&location=${location}&finYear=${finYear}&supplierId=${sup._id}`);
ok('this vendor\'s LR appears', (lrs.body.rows||[]).some(r=>r.transactionNo==='LR/26/011'), JSON.stringify((lrs.body.rows||[]).map(r=>r.transactionNo)));
const row=(lrs.body.rows||[]).find(r=>r.transactionNo==='LR/26/011');
ok('row carries lrNumber / invoice / value for the label', row?.lrNumber==='64187'&&row?.invPmNumber==='WH0001355'&&row?.value===22134, JSON.stringify({lr:row?.lrNumber,inv:row?.invPmNumber,val:row?.value}));
const otherSup=await db.collection('contact').findOne({contactKind:'Supplier',businessId:lr.businessId,_id:{$ne:sup._id}});
const lrs2=await api(`/api/purchase-grc?availableLr=1&business=${business}&location=${location}&finYear=${finYear}&supplierId=${otherSup._id}`);
ok('a DIFFERENT vendor does not see it', !(lrs2.body.rows||[]).some(r=>r.transactionNo==='LR/26/011'), 'got '+(lrs2.body.rows||[]).length+' rows');

console.log('--- 5. backend rejects a mismatched pair ---');
const base={ business, location, finYear };
const mk=(supplierId,lrId)=>({...base,data:{supplierId,lrTransactionId:lrId,grcDate:new Date().toISOString().slice(0,10),vendorDocNo:'',stockPointName:'Warehouse',freightMode:'Before Tax',freightAmount:0}});
const bad=await api('/api/purchase-grc',{method:'POST',body:JSON.stringify(mk(String(otherSup._id),String(lr._id)))});
ok('LR belonging to another vendor is REJECTED', bad.status===422 && /does not belong/i.test(bad.body?.errors?.lrTransactionId||''), JSON.stringify(bad.body));

console.log('--- 6. valid GRC ---');
const good=await api('/api/purchase-grc',{method:'POST',body:JSON.stringify(mk(String(sup._id),String(lr._id)))});
ok('valid vendor + LR is accepted', good.ok, JSON.stringify(good.body));
let created=null;
if(good.ok){
  created=await db.collection('grc').findOne({_id:new mongoose.Types.ObjectId(good.body.id)});
  ok('stores the supplier REFERENCE (not text)', String(created.supplierId)===String(sup._id), String(created.supplierId));
  ok('stores the LR reference', String(created.lrTransactionId)===String(lr._id), String(created.lrTransactionId));
  ok('invoice auto-fetched from the LR', created.vendorDocNo==='WH0001355', created.vendorDocNo);
  ok('LR number copied', created.lrTransactionNo==='LR/26/011', created.lrTransactionNo);
  ok('vendor GST snapshotted', created.vendorGstNo===(sup.gstNo||''), JSON.stringify(created.vendorGstNo));
  ok('business / location / finYear stored', String(created.businessId)===business&&String(created.locationId)===location&&created.finYear===finYear);

  console.log('--- 7. duplicate protection ---');
  const dup=await api('/api/purchase-grc',{method:'POST',body:JSON.stringify(mk(String(sup._id),String(lr._id)))});
  ok('the same LR cannot make a second GRC', dup.status===422 && /already has a GRC/i.test(dup.body?.errors?.lrTransactionId||''), JSON.stringify(dup.body));

  const after=await api(`/api/purchase-grc?availableLr=1&business=${business}&location=${location}&finYear=${finYear}&supplierId=${sup._id}`);
  ok('a consumed LR drops out of the dropdown', !(after.body.rows||[]).some(r=>r.transactionNo==='LR/26/011'));
  await db.collection('grc').deleteOne({_id:created._id});
  console.log('  (test GRC removed)');
}
await db.collection('user').deleteOne({email});
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
await mongoose.disconnect(); process.exit(fail?1:0);
