const { MongoClient, ObjectId } = require('mongodb');

async function run() {
  const erpUri = 'mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net/grooretailerp1';
  const webUri = 'mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net/woven_essence_web';

  const client = new MongoClient(erpUri);
  await client.connect();
  const db = client.db('grooretailerp1');

  // Let's see how ecommercewovenessanceV2 gets products for pavada
  const pavadaGroup = '6ae2ee67eb54c4ea4fd9b4c3'; // from add-on-categories.ts
  console.log('Pavada group ID:', pavadaGroup);

  // 1. In add-on categories:
  // getLabelIdsForProductGroups(['6ae2ee67eb54c4ea4fd9b4c3'])
  // Step 1: find active & published ecommerceproduct
  const ecomms = await db.collection('ecommerceproduct').find({
    status: { $in: ['active', 'ACTIVE'] },
    isPublished: true,
  }).toArray();
  console.log('Total published ecommerce products:', ecomms.length);

  const pavadaEcomm = ecomms.filter(e => e.productType === 'PAVADA' || String(e.itemId) === '6a9187e18f389a91529a1987');
  console.log('Pavada in ecommerceproduct:', pavadaEcomm.map(e => ({
    _id: e._id,
    barcode: e.barcode,
    publishedBarcodes: e.publishedBarcodes,
    productType: e.productType
  })));

  // How does barcode-label.repository.ts resolve publishedBarcodes to barcodeLabel docs?
  // Let's check savedBarcodes
  const barcodes = pavadaEcomm.flatMap(e => Array.isArray(e.publishedBarcodes) ? e.publishedBarcodes : [e.barcode]);
  console.log('Published barcodes for Pavada:', barcodes);

  // Step 2: barcodeLabel query
  const matchingLabels = await db.collection('barcodeLabel').find({
    $or: [
      { barcodeNo: { $in: barcodes } },
      { barcodeGenerated: { $in: barcodes } }
    ]
  }).toArray();
  console.log('Matching barcodeLabel records in grooretailerp1:', matchingLabels.map(l => ({
    _id: l._id,
    barcodeNo: l.barcodeNo,
    itemCode: l.itemCode,
    status: l.status,
    groupId: l.groupId
  })));

  await client.close();
}

run().catch(console.error);
