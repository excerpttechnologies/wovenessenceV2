import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export async function POST(req) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `zpl_print_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.prn`);
  let target = 'BOXP BP 4304e (300 dpi) - ZPL';

  try {
    const body = await req.json().catch(() => ({}));
    const { zpl, printerName } = body;

    if (!zpl || typeof zpl !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing zpl content' }, { status: 400 });
    }

    if (printerName && typeof printerName === 'string') {
      target = printerName.trim();
    }

    // Write ZPL to a temporary PRN file
    fs.writeFileSync(tmpFile, zpl, 'utf8');

    const scriptPath = path.resolve(process.cwd(), 'scripts', 'rawPrintHelper.ps1');

    // Call PowerShell raw print helper using execFile for safe argument handling
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-PrinterName',
      target,
      '-FilePath',
      tmpFile,
    ];

    const { stdout, stderr } = await execFileAsync('powershell', args);

    if (stderr && stderr.includes('FAILED:')) {
      const flat = stderr.replace(/\r?\n\s*/g, ' ');
      const cleanErr = flat.split('FAILED:')[1]?.split('+ CategoryInfo')[0]?.trim() || stderr.trim();
      return NextResponse.json({
        success: false,
        error: cleanErr,
        printerName: target,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Print job sent to ${target}`,
      printerName: target,
      output: stdout ? stdout.trim() : '',
    });
  } catch (cmdErr) {
    const rawMsg = cmdErr.stderr || cmdErr.stdout || cmdErr.message || '';
    const flat = rawMsg.replace(/\r?\n\s*/g, ' ');
    let cleanErr = `Printer '${target}' is not connected or offline.`;
    if (flat.includes('FAILED:')) {
      cleanErr = flat.split('FAILED:')[1]?.split('+ CategoryInfo')[0]?.trim();
    } else if (rawMsg) {
      cleanErr = rawMsg.split('\n')[0].replace(/^.*Write-Error.*?:/, '').trim();
    }

    return NextResponse.json({
      success: false,
      error: cleanErr || `Printer '${target}' is not connected or offline.`,
      printerName: target,
    }, { status: 400 });
  } finally {
    // Clean up temporary file
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}
