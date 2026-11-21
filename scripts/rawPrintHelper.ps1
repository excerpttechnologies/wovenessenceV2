param(
    [Parameter(Mandatory=$true)]
    [string]$PrinterName,
    
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

if (-not (Test-Path $FilePath)) {
    Write-Error "FAILED: File not found: $FilePath"
    exit 1
}

# 1. Verify printer is installed in Windows
$printer = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Error "FAILED: Printer '$PrinterName' is not installed on this system."
    exit 1
}

# 2. Verify printer is not Offline
if ($printer.PrinterStatus -eq 'Offline' -or $printer.WorkOffline) {
    Write-Error "FAILED: Printer '$PrinterName' is Offline. Please turn ON the printer and check connection."
    exit 1
}

# 3. For USB printer, verify physical connection
if ($printer.PortName -like 'USB*') {
    $pnpPrinter = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { 
        $_.FriendlyName -eq $PrinterName -or $_.InstanceId -like "*$($printer.PortName)*"
    }
    if (-not $pnpPrinter) {
        $shortName = ($PrinterName -split '\s+')[0]
        $pnpByKeyword = if ($shortName -and $shortName.Length -gt 2) {
            Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like "*$shortName*" }
        } else { $null }

        if (-not $pnpByKeyword) {
            Write-Error "FAILED: Printer '$PrinterName' is not physically connected. Please connect the USB cable and turn the printer ON."
            exit 1
        }
    }
}

# 4. For network IP printer, verify ping
if ($printer.PortName -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
    $canPing = Test-Connection -ComputerName $printer.PortName -Count 1 -Quiet -ErrorAction SilentlyContinue
    if (-not $canPing) {
        Write-Error "FAILED: Network printer '$PrinterName' at IP $($printer.PortName) is unreachable."
        exit 1
    }
}

$rawPrinterCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        if (!File.Exists(szFileName)) return false;
        byte[] bytes = File.ReadAllBytes(szFileName);
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "WovenEssence ZPL Print Job";
        di.pDataType = "RAW";
        bool bSuccess = false;

        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
        Add-Type -TypeDefinition $rawPrinterCode
    }
    $resolvedPath = (Resolve-Path $FilePath).Path
    $result = [RawPrinterHelper]::SendFileToPrinter($PrinterName, $resolvedPath)
    if ($result) {
        Write-Output "SUCCESS: Sent $resolvedPath to $PrinterName"
        exit 0
    } else {
        $lastError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Error "FAILED: Could not write to printer $PrinterName. Win32 Error: $lastError"
        exit 1
    }
} catch {
    Write-Error "ERROR: $_"
    exit 1
}
