@echo off
echo ========================================
echo Multi-Database MongoDB Migration
echo ========================================
echo.
echo This will migrate TWO databases:
echo   1. grooretailerp1 (ERP - excluding POS/GRC/DC)
echo   2. woven_essence_web (Website - ALL data)
echo.
echo From: Cloud MongoDB (Atlas)
echo To:   Local MongoDB (127.0.0.1:27017)
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo Step 1: Checking connections...
echo ----------------------------------------
node scripts/checkMongoDB.mjs
if errorlevel 1 (
    echo.
    echo Cannot proceed - fix connection issues first
    pause
    exit /b 1
)

echo.
echo.
echo Step 2: Migrating both databases...
echo ----------------------------------------
echo This may take several minutes depending on data size...
echo.
node scripts/migrateBothDatabases.mjs
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
node scripts/verifyBothDatabases.mjs

echo.
echo ========================================
echo Migration Complete!
echo ========================================
echo.
echo IMPORTANT: Both databases migrated:
echo   ✓ grooretailerp1 (ERP data)
echo   ✓ woven_essence_web (Website data)
echo.
echo Next steps:
echo 1. Review verification results above
echo 2. Update connection strings in .env if needed
echo 3. Restart your application
echo.
pause
