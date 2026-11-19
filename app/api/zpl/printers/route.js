import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Query installed Windows printers via PowerShell
    const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object -Property Name, DriverName, PortName | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd);
    const raw = stdout.trim();
    let printers = [];

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        printers = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        console.warn('Could not parse printer JSON:', e);
      }
    }

    // Identify recommended ZPL/Thermal printer
    const recommended = printers.find(
      (p) =>
        /ZPL|BOXP|Zebra|Thermal/i.test(p.Name) ||
        /ZPL|BOXP|Zebra|Thermal/i.test(p.DriverName)
    );

    return NextResponse.json({
      printers,
      recommended: recommended ? recommended.Name : (printers[0]?.Name || ''),
    });
  } catch (err) {
    console.error('Failed to list Windows printers:', err);
    return NextResponse.json({
      printers: [
        { Name: 'BOXP BP 4304e (300 dpi) - ZPL', DriverName: 'BOXP BP 4304e (300 dpi) - ZPL', PortName: 'USB004' },
      ],
      recommended: 'BOXP BP 4304e (300 dpi) - ZPL',
      error: err.message,
    });
  }
}
