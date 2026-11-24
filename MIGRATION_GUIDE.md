# MongoDB Migration Guide

## Overview
This guide helps you migrate data from your cloud MongoDB (MONGODB_URI) to your local MongoDB (NEW_MONGODB_URI), excluding POS, GRC, and DC data.

## Connection Details

### Source (Cloud MongoDB)
```
mongodb+srv://wovenessanceexcerpt_db_user:****@cluster0.m3qylyn.mongodb.net/grooretailerp1
```

### Target (Local MongoDB)
```
mongodb://wovenessence:****@127.0.0.1:27017/grooretailerp1?authSource=admin
```

## What Gets Migrated

### ✅ INCLUDED Collections:
- **Master Data**: businesses, locations, finyears, users
- **Inventory**: items, stockmovements, barcodelabels, barcodesettings
- **Contacts**: suppliers, customers, agents, contacts
- **E-commerce**: ecommerceproducts, productgalleries, producttypes, categories
- **Settings**: All configuration collections
- **Other**: Any collection not explicitly excluded

### ❌ EXCLUDED Collections:
- **POS Data**: pos, possales, posreturn
- **GRC Data**: grc, grcs, purchasegrc
- **DC Data**: dc, dcs, deliverychallan, delivery, deliveries

## Migration Steps

### Step 1: Run the Migration Script

```bash
node scripts/migrateToNewMongoDB.mjs
```

This will:
1. Connect to both databases
2. List all collections
3. Skip POS/GRC/DC collections
4. Migrate all other data with indexes
5. Show progress for each collection
6. Display a summary at the end

### Step 2: Verify the Migration

```bash
node scripts/verifyMigration.mjs
```

This will:
1. Compare document counts between source and target
2. Show a table with all collections
3. Highlight any mismatches
4. Provide a summary report

### Step 3: Update Your Application

Once verified, update `.env`:

```bash
# Comment out old URI
#MONGODB_URI=mongodb+srv://wovenessanceexcerpt_db_user:...

# Use the new local URI
MONGODB_URI=mongodb://wovenessence:wovenessence%40123@127.0.0.1:27017/grooretailerp1?authSource=admin
```

### Step 4: Restart Application

```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

## Troubleshooting

### Error: "Connection refused"
- Make sure your local MongoDB is running
- Check that MongoDB is listening on port 27017
- Verify credentials are correct

### Error: "Authentication failed"
- Check username and password in NEW_MONGODB_URI
- Ensure the user exists in the admin database
- Verify authSource=admin is in the connection string

### Error: "Database not found"
- The database will be created automatically
- Just make sure MongoDB service is running

### Some Collections Show Count Mismatch
- This is normal if the collection was partially migrated before
- Re-run the migration script - it will drop and recreate collections
- Check the excluded collections list if something is missing

## Creating MongoDB User (If Needed)

If you need to create the MongoDB user on your local instance:

```bash
mongosh admin
```

```javascript
db.createUser({
  user: "wovenessence",
  pwd: "wovenessence@123",
  roles: [
    { role: "readWrite", db: "grooretailerp1" },
    { role: "dbAdmin", db: "grooretailerp1" }
  ]
})
```

## Migration Features

- ✅ Batch processing (1000 documents at a time)
- ✅ Progress tracking
- ✅ Index migration
- ✅ Automatic retry on conflicts
- ✅ Empty collection detection
- ✅ Existing data cleanup
- ✅ Priority ordering (master data first)
- ✅ Comprehensive error handling

## Safety Notes

1. **Backup First**: The script drops existing collections in target before migrating
2. **Test Mode**: Run verification after migration to ensure data integrity
3. **Rollback**: Keep MONGODB_URI available until you're sure migration is complete
4. **POS/GRC/DC**: This data is NOT migrated - remains only in cloud database

## Need Help?

Check the console output for detailed error messages. The scripts provide:
- Real-time progress updates
- Error details with collection names
- Summary statistics
- Specific recommendations

---

**Last Updated**: 2026-11-24
