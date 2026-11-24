# 🚀 Quick Start: MongoDB Migration

## Prerequisites Check

### 1. Ensure Local MongoDB is Running

**Check if MongoDB is running:**
```bash
mongosh "mongodb://localhost:27017" --eval "db.version()"
```

**If MongoDB is not running, start it:**

**Windows (Command Prompt as Administrator):**
```bash
net start MongoDB
```

**Or start manually:**
```bash
"C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe" --dbpath="C:\data\db"
```

### 2. Create MongoDB User (First Time Only)

Connect to MongoDB:
```bash
mongosh admin
```

Create user:
```javascript
db.createUser({
  user: "wovenessence",
  pwd: "wovenessence@123",
  roles: [
    { role: "readWrite", db: "grooretailerp1" },
    { role: "dbAdmin", db: "grooretailerp1" }
  ]
});
```

Exit:
```javascript
exit
```

### 3. Test Connection

```bash
mongosh "mongodb://wovenessence:wovenessence%40123@127.0.0.1:27017/grooretailerp1?authSource=admin"
```

You should see a successful connection. Type `exit` to close.

---

## Migration Steps

### Step 1: Run Migration

```bash
cd c:\Users\Admin\Desktop\deploy\wovenessenceV2
node scripts/migrateToNewMongoDB.mjs
```

**What happens:**
- Connects to cloud MongoDB (source)
- Connects to local MongoDB (target)
- Lists all collections
- Skips POS, GRC, DC data
- Migrates everything else
- Copies indexes
- Shows progress

**Expected output:**
```
🚀 Starting MongoDB Migration...

📍 Source: mongodb+srv://wovenessanceexcerpt_db_user:****@...
📍 Target: mongodb://wovenessence:****@127.0.0.1:27017/...

🔌 Connecting to source database...
🔌 Connecting to target database...
✅ Connected to both databases

📦 Found 45 collections in source database

✅ Will migrate 38 collections
⏭️  Skipping 7 collections (POS/GRC/DC data)

📦 Migrating users: 15 documents...
   ✅ Completed: 15 documents migrated

📦 Migrating items: 2847 documents...
   ⏳ Progress: 1000/2847 documents
   ⏳ Progress: 2000/2847 documents
   ✅ Completed: 2847 documents migrated

...

📊 Migration Summary
============================================================
Total Collections: 38
✅ Successfully Migrated: 38
⏭️  Skipped (empty): 0
❌ Failed: 0
📄 Total Documents Migrated: 15,432
============================================================

🎉 Migration completed successfully!
```

### Step 2: Verify Migration

```bash
node scripts/verifyMigration.mjs
```

**What happens:**
- Compares document counts between source and target
- Shows a table with all collections
- Highlights any mismatches

**Expected output:**
```
🔍 Verifying MongoDB Migration...

📊 Collection Comparison:

Source collections: 45
Target collections: 38

┌─────────────────────────────────┬─────────────┬─────────────┬────────┐
│ Collection                      │ Source Docs │ Target Docs │ Status │
├─────────────────────────────────┼─────────────┼─────────────┼────────┤
│ users                           │          15 │          15 │   ✅   │
│ items                           │       2,847 │       2,847 │   ✅   │
│ ecommerceproducts               │         342 │         342 │   ✅   │
│ barcodelabels                   │       8,521 │       8,521 │   ✅   │
│ pos                             │       1,245 │           0 │   ⏭️   │
│ grc                             │         187 │           0 │   ⏭️   │
└─────────────────────────────────┴─────────────┴─────────────┴────────┘

📈 Summary:
   ✅ Perfect match: 38 collections
   ⏭️  Skipped (not in target): 7 collections
   ⚠️  Count mismatch: 0 collections

✅ Verification complete - all migrated collections match!
```

### Step 3: Switch to Local Database

**Edit `.env` file:**

```bash
# Comment out cloud MongoDB
#MONGODB_URI=mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net/grooretailerp1

# Use local MongoDB
MONGODB_URI=mongodb://wovenessence:wovenessence%40123@127.0.0.1:27017/grooretailerp1?authSource=admin
```

### Step 4: Restart Application

```bash
# Stop current server (Ctrl+C if running)

# Start dev server
npm run dev
```

---

## Troubleshooting

### ❌ "Connection refused"

**Problem:** Local MongoDB is not running

**Solution:**
```bash
net start MongoDB
```

Or check MongoDB installation:
```bash
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --version
```

### ❌ "Authentication failed"

**Problem:** User doesn't exist or wrong password

**Solution:** Create the user (see Prerequisites step 2 above)

### ❌ "ECONNREFUSED 127.0.0.1:27017"

**Problem:** MongoDB not listening on port 27017

**Solutions:**
1. Check if another process is using port 27017
2. Check MongoDB configuration file (mongod.cfg)
3. Start MongoDB with: `mongod --port 27017 --dbpath C:\data\db`

### ⚠️ Some collections show count mismatch

**Problem:** Collections were partially migrated before

**Solution:** Re-run migration script - it will drop and recreate

---

## What Data is Migrated?

### ✅ MIGRATED:
- Master data (users, businesses, locations, finyears)
- Inventory (items, stockmovements, barcodelabels)
- Contacts (suppliers, customers, agents)
- **E-commerce (products, galleries, categories)** ← All e-commerce data
- Settings and configurations
- All other collections

### ❌ NOT MIGRATED:
- POS sales data
- GRC (Goods Receipt Challan) data
- DC (Delivery Challan) data

---

## Post-Migration Checklist

- [ ] MongoDB service is running
- [ ] User created successfully
- [ ] Migration script completed without errors
- [ ] Verification shows all collections match
- [ ] `.env` updated to use NEW_MONGODB_URI
- [ ] Application restarted
- [ ] Test login works
- [ ] Check e-commerce products visible
- [ ] Check inventory data loaded
- [ ] Verify master data (suppliers, customers, etc.)

---

## Need More Help?

Check these files:
- `MIGRATION_GUIDE.md` - Detailed migration guide
- `scripts/migrateToNewMongoDB.mjs` - Migration script
- `scripts/verifyMigration.mjs` - Verification script

---

**Created**: 2026-11-24  
**Purpose**: Transfer all data except POS/GRC/DC from cloud to local MongoDB
