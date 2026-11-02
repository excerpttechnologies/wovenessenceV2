/* Proves the GST rate cache expires: correct the Tax master and the next
   resolution must charge the new rate instead of the cached one.
   Run with GST_CACHE_TTL_MS=0 so an entry is never reused:
     GST_CACHE_TTL_MS=0 node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/.tmp-audit/verify-gst-cache.mjs */
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import { resolveGstRate } from '@/lib/storeGst';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
};

await dbConnect();

const tax = await Tax.create({ taxName: 'E2E CACHE TEST', igst: null, cgst: 2.5, sgst: 2.5, status: 'Active' });
const hsn = await Hsn.create({
  code: 'E2ECACHE' + Date.now(),
  businessId: null,
  status: 'Active',
  taxSlabs: [{ gstTaxNameId: tax._id, amountFrom: null, amountTo: null }],
});

const first = await resolveGstRate({ businessId: '', hsnCode: hsn.code, amount: 100 });

/* the master is corrected while the server is running */
await Tax.updateOne({ _id: tax._id }, { $set: { cgst: 6, sgst: 6 } });
const second = await resolveGstRate({ businessId: '', hsnCode: hsn.code, amount: 100 });

check('the rate is resolved from the master', first.gstPct === 5, first.gstPct + '%');
check('a corrected tax master is picked up instead of the cached rate',
  second.gstPct === 12, first.gstPct + '% -> ' + second.gstPct + '%');

await Hsn.deleteOne({ _id: hsn._id });
await Tax.deleteOne({ _id: tax._id });
console.log('\ncleanup: test HSN and Tax rows removed');

const failed = results.filter((r) => !r.ok);
console.log((results.length - failed.length) + '/' + results.length + ' checks passed');
await mongoose.connection.close();
process.exit(failed.length ? 1 : 0);
