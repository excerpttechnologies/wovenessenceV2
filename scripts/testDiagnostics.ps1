$printerName = "BOXP BP 4304e (300 dpi) - ZPL"
$filePath = "C:\Users\Admin\Downloads\90x68 PRN FILE.prn"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Write-Host "Read bytes:" $bytes.Length

$rawPrinterCode = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawTester {
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
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static string TestPrint(string szPrinter, byte[] bytes) {
        IntPtr hPrinter = IntPtr.Zero;
        if (!OpenPrinter(szPrinter, out hPrinter, IntPtr.Zero)) {
            return "OpenPrinter failed, error: " + Marshal.GetLastWin32Error();
        }
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Test ZPL Job";
        di.pDataType = "RAW";
        int docId = StartDocPrinter(hPrinter, 1, di);
        if (docId <= 0) {
            int err = Marshal.GetLastWin32Error();
            ClosePrinter(hPrinter);
            return "StartDocPrinter failed: " + docId + ", error: " + err;
        }
        if (!StartPagePrinter(hPrinter)) {
            int err = Marshal.GetLastWin32Error();
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return "StartPagePrinter failed, error: " + err;
        }
        IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pBytes, bytes.Length);
        int written = 0;
        bool writeOk = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
        int writeErr = Marshal.GetLastWin32Error();
        Marshal.FreeCoTaskMem(pBytes);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return string.Format("WriteOk: {0}, written: {1}/{2}, writeErr: {3}, docId: {4}", writeOk, written, bytes.Length, writeErr, docId);
    }
}
"@

Add-Type -TypeDefinition $rawPrinterCode
$diag = [RawTester]::TestPrint($printerName, $bytes)
Write-Host "Diagnostic Output:" $diag
