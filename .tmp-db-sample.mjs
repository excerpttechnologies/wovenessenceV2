import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI;
await mongoose.connect(uri, { bufferCommands: false });
const db = mongoose.connection.db;

const show = (label, value) => console.log('\n=== ' + label + ' ===\n' + JSON.stringify(value, null, 2));

show('contact kinds', await db.collection('contact').aggregate([{ $group: { _id: '$contactKind', n: { $sum: 1 } } }]).toArray());
show('posinvoice sample', await db.collection('posinvoice').find({}).sort({ _id: -1 }).limit(2).toArray());
show('posinvoice line key union', await db.collection('posinvoice').aggregate([
  { $unwind: '$items' },
  { $project: { keys: { $objectToArray: '$items' } } },
  { $unwind: '$keys' },
  { $group: { _id: '$keys.k', n: { $sum: 1 }, samples: { $addToSet: '$keys.v' } } },
  { $sort: { n: -1 } },
  { $project: { n: 1, samples: { $slice: ['$samples', 3] } } },
]).toArray());
show('posreturn sample', await db.collection('posreturn').find({}).sort({ _id: -1 }).limit(1).toArray());
show('grc sample', await db.collection('grc').find({}).sort({ _id: -1 }).limit(1).toArray());
show('delivery sample', await db.collection('delivery').find({}).sort({ _id: -1 }).limit(1).toArray());
show('salesinvoice sample', await db.collection('salesinvoice').find({}).limit(1).toArray());
show('stocktransferlocation sample', await db.collection('stocktransferlocation').find({}).limit(1).toArray());
show('voucher sample', await db.collection('voucher').find({}).limit(1).toArray());
show('supplier sample', await db.collection('supplier').find({}).limit(1).toArray());
show('customer sample', await db.collection('customer').find({}).limit(1).toArray());
show('agent sample', await db.collection('agent').find({}).limit(1).toArray());
show('salesperson sample', await db.collection('salesperson').find({}).limit(2).toArray());

await mongoose.disconnect();
