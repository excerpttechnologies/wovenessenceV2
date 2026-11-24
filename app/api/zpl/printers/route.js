import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

function resolvePowerShellExe() {
  if (process.platform !== 'win32') return null;
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const candidates = [
    path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(sysRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'powershell.exe',
  ];
  for (const c of candidates) {
    if (c.includes('\\') && fs.existsSync(c)) return c;
  }
  return 'powershell.exe';
}

export async function GET() {
  const defaultFallback = {
    printers: [
      { Name: 'BOXP BP 4304e (300 dpi) - ZPL', DriverName: 'BOXP BP 4304e (300 dpi) - ZPL', PortName: 'USB004' },
    ],
    recommended: 'BOXP BP 4304e (300 dpi) - ZPL',
  };

  if (process.platform !== 'win32') {
    return NextResponse.json(defaultFallback);
  }

  const psExe = resolvePowerShellExe();
  if (!psExe) {
    return NextResponse.json(defaultFallback);
  }

  try {
    const args = [
      '-NoProfile',
      '-Command',
      'Get-Printer | Select-Object -Property Name, DriverName, PortName | ConvertTo-Json',
    ];
    const { stdout } = await execFileAsync(psExe, args, { timeout: 3500 });
    const raw = stdout ? stdout.trim() : '';
    let printers = [];

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        printers = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        console.warn('Could not parse printer JSON:', e);
      }
    }

    if (!printers.length) {
      printers = defaultFallback.printers;
    }

    const recommended = printers.find(
      (p) =>
        /ZPL|BOXP|BOXB|Zebra|Thermal/i.test(p.Name) ||
        /ZPL|BOXP|BOXB|Zebra|Thermal/i.test(p.DriverName)
    );

    return NextResponse.json({
      printers,
      recommended: recommended ? recommended.Name : (printers[0]?.Name || defaultFallback.recommended),
    });
  } catch (err) {
    return NextResponse.json(defaultFallback);
  }
}
