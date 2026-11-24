@echo off
echo ========================================
echo MongoDB Migration Tool
echo ========================================
echo.
echo This will migrate all data from cloud MongoDB to local MongoDB
echo EXCLUDING: POS, GRC, and DC data
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo Step 1: Checking MongoDB connections...
echo ----------------------------------------
node scripts/checkMongoDB.mjs
if errorlevel 1 (
    echo.
    echo Migration cannot proceed - fix connection issues first
    pause
    exit /b 1
)

echo.
echo.
echo Step 2: Running migration...
echo ----------------------------------------
node scripts/migrateToNewMongoDB.mjs
if errorlevel 1 (
    echo.
    echo Migration failed!
    pause
    exit /b 1
)

echo.
echo.
echo Step 3: Verifying migration...
echo ----------------------------------------
node scripts/verifyMigration.mjs

echo.
echo ========================================
echo Migration Process Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Review the verification results above
echo 2. Update MONGODB_URI in .env file to use NEW_MONGODB_URI
echo 3. Restart your application
echo.
pause
