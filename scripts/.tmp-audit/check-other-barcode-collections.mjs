import fs from 'fs';
import { MongoClient } from 'mongodb';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const query = { $or: [{ barcodeNo: { $in: ['OM1098', 'OM1109'] } }, { itemCode: '10.CTNSLK-SL' }, { itemName: '10.CTNSLK-SL' }, { barcode: 'OM1098' }] };
for (const coll of ['barcodeitem', 'barcodelabels', 'stockmovement', 'barcodesetting', 'barcodelabelsetting']) {
  try {
    const d = await db.collection(coll).find(query).limit(3).toArray();
    console.log(coll, d.length);
    for (const x of d) console.log(' ', JSON.stringify({ id: x._id, keys: Object.keys(x).slice(0, 14), sup: x.supplierId, ref: x.referenceNo || x.refNo || x.docNo || x.grcNo }));
  } catch (e) { console.log(coll, 'err', e.message); }
}
await c.close();
