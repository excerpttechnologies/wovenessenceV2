# AutoPrintWatcher.ps1
# Monitors C:\Users\Admin\Downloads for new .prn files and sends them directly to the BOXP printer

param(
    [string]$PrinterName = "BOXP BP 4304e (300 dpi) - ZPL",
    [string]$WatchFolder = "$env:USERPROFILE\Downloads"
)

$HelperScript = Join-Path $PSScriptRoot "rawPrintHelper.ps1"
if (-not (Test-Path $HelperScript)) {
    $HelperScript = "C:\Users\Admin\Desktop\deploy\wovenessenceV2\scripts\rawPrintHelper.ps1"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   WOVEN ESSENCE - AUTOMATIC PRN THERMAL PRINT WATCHER    " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Printer : $PrinterName" -ForegroundColor Yellow
Write-Host "Watching Folder: $WatchFolder" -ForegroundColor Yellow
Write-Host "Status         : RUNNING - Any downloaded .prn prints automatically!" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host "----------------------------------------------------------"

$processed = @{}

# Mark existing files as already seen
Get-ChildItem -Path $WatchFolder -Filter "*.prn" -ErrorAction SilentlyContinue | ForEach-Object {
    $processed[$_.FullName] = $_.LastWriteTimeUtc.Ticks
}

while ($true) {
    Start-Sleep -Milliseconds 800
    try {
        $files = Get-ChildItem -Path $WatchFolder -Filter "*.prn" -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            $key = $file.FullName
            $lastWrite = $file.LastWriteTimeUtc.Ticks
            if (-not $processed.ContainsKey($key) -or ($processed[$key] -ne $lastWrite)) {
                $processed[$key] = $lastWrite
                
                # Small wait to ensure file is completely written by browser
                Start-Sleep -Milliseconds 300
                
                Write-Host "`n[NEW FILE DETECTED] $($file.Name)" -ForegroundColor Cyan
                Write-Host "Sending to $PrinterName..." -ForegroundColor White
                
                & powershell -NoProfile -ExecutionPolicy Bypass -File $HelperScript -PrinterName $PrinterName -FilePath $file.FullName
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "[SUCCESS] Printed $($file.Name) successfully!`n" -ForegroundColor Green
                } else {
                    Write-Host "[ERROR] Failed to print $($file.Name)`n" -ForegroundColor Red
                }
            }
        }
    } catch {
        # continue loop
    }
}
