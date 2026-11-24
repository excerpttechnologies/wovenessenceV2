#!/usr/bin/env node

/**
 * MongoDB Connection Checker
 * 
 * Tests connections to both source and target MongoDB instances
 * 
 * Usage: node scripts/checkMongoDB.mjs
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SOURCE_URI = process.env.MONGODB_URI;
const TARGET_URI = process.env.NEW_MONGODB_URI;

function maskUri(uri) {
  if (!uri) return 'NOT SET';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

async function testConnection(label, uri) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`URI: ${maskUri(uri)}\n`);

  if (!uri) {
    console.log('❌ Not configured in .env file');
    return false;
  }

  let client;
  try {
    console.log('🔌 Connecting...');
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    
    await client.connect();
    console.log('✅ Connection successful!');

    const db = client.db();
    const dbName = db.databaseName;
    console.log(`📊 Database: ${dbName}`);

    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`📦 Collections: ${collections.length}`);

    // Count total documents
    let totalDocs = 0;
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      totalDocs += count;
    }
    console.log(`📄 Total documents: ${totalDocs.toLocaleString()}`);

    // Server info
    const admin = db.admin();
    const serverStatus = await admin.serverStatus();
    console.log(`🖥️  MongoDB version: ${serverStatus.version}`);
    console.log(`⏰ Server uptime: ${Math.floor(serverStatus.uptime / 3600)} hours`);

    return true;

  } catch (error) {
    console.log('❌ Connection failed!');
    console.log(`Error: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • MongoDB service may not be running');
      console.log('   • Start with: net start MongoDB');
      console.log('   • Or check if MongoDB is installed');
    } else if (error.message.includes('Authentication failed')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Check username and password');
      console.log('   • User may not exist - create with:');
      console.log('     mongosh admin');
      console.log('     db.createUser({ user: "wovenessence", pwd: "wovenessence@123", ... })');
    } else if (error.message.includes('timed out')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Network connectivity issue');
      console.log('   • Check firewall settings');
      console.log('   • Verify connection string');
    }

    return false;

  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function main() {
  console.log('🔍 MongoDB Connection Checker');
  console.log('=' .repeat(60));
  console.log('This script will test connections to your MongoDB instances\n');

  const sourceOk = await testConnection('SOURCE (Cloud MongoDB)', SOURCE_URI);
  const targetOk = await testConnection('TARGET (Local MongoDB)', TARGET_URI);

  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Source (Cloud): ${sourceOk ? '✅ Ready' : '❌ Not accessible'}`);
  console.log(`Target (Local): ${targetOk ? '✅ Ready' : '❌ Not accessible'}`);
  console.log('='.repeat(60));

  if (sourceOk && targetOk) {
    console.log('\n🎉 Both databases are accessible!');
    console.log('You can now run the migration script:');
    console.log('   node scripts/migrateToNewMongoDB.mjs\n');
  } else {
    console.log('\n⚠️  One or more databases are not accessible.');
    console.log('Please fix the connection issues before running migration.\n');
    process.exit(1);
  }
}

main().catch(console.error);
