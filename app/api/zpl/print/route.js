import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { zpl, printerName } = body;

    if (!zpl || typeof zpl !== 'string') {
      return NextResponse.json({ error: 'Missing zpl content' }, { status: 400 });
    }

    // Default target printer if not specified
    const target = printerName || 'BOXP BP 4304e (300 dpi) - ZPL';

    // Write ZPL to a temporary PRN file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `zpl_print_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.prn`);
    fs.writeFileSync(tmpFile, zpl, 'utf8');

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'rawPrintHelper.ps1');

    // Call PowerShell raw print helper
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -PrinterName "${target}" -FilePath "${tmpFile}"`;

    const { stdout, stderr } = await execAsync(cmd);

    // Clean up temporary file
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}

    if (stderr && stderr.includes('FAILED')) {
      return NextResponse.json({
        success: false,
        error: stderr.trim(),
        printerName: target,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Print job sent to ${target}`,
      printerName: target,
      output: stdout.trim(),
    });
  } catch (err) {
    console.error('Direct print error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to send print job to Windows printer queue',
    }, { status: 500 });
  }
}
