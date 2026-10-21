'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/* ==========================================================================
   Physical barcode scanner support.

   A USB/Bluetooth scanner is a keyboard: it types the barcode and presses
   Enter. That is easy to read from a focused input - and useless the moment
   the operator's focus is anywhere else, which at a till is most of the time
   (they have just tapped a quantity box, or a customer field, or nothing at
   all). The requirement is that scanning adds the item without the operator
   first hunting for the search box.

   So the listener is on the WINDOW, and a scan is told apart from typing by
   its speed. A person cannot produce eight characters at 20ms intervals; a
   scanner cannot produce them slower than about 50ms. The gap between those
   two is wide enough that a simple inter-key threshold separates them
   reliably, which is why this is the approach every retail front end uses.

   What it handles, all of which are real at a counter:
     - focus anywhere on the page, including no focus at all
     - the Enter (or Tab) suffix scanners are configured to send
     - a scan that arrives while a previous one is still being looked up
     - the operator typing into a real input - never intercepted
     - a double trigger sending the same code twice in a few hundred ms
   ========================================================================== */

/* Inter-keystroke gap above which the input is treated as human typing.
   Scanners land well under 30ms; deliberately generous so a slow USB hub or
   a busy render does not split one scan into two. */
const HUMAN_GAP_MS = 60;

/* A scan shorter than this is noise - a stray keypress, not a barcode. */
const MIN_LENGTH = 4;

/* The same code arriving again inside this window is a double trigger on one
   physical label, not the operator deliberately scanning an identical second
   item. Unique barcodes are unique, so a genuine repeat cannot be valid; for
   batch barcodes the caller decides, via `allowRepeat`. */
const REPEAT_MS = 700;

export function useScanner(onScan, { enabled = true, allowRepeat = false, minLength = MIN_LENGTH } = {}) {
  const buffer = useRef('');
  const lastKeyAt = useRef(0);
  const lastScan = useRef({ code: '', at: 0 });
  const handler = useRef(onScan);
  const [scanning, setScanning] = useState(false);

  /* kept in a ref so changing the callback does not tear down the listener
     mid-scan and lose a half-buffered barcode */
  useEffect(() => { handler.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(e) {
      /* Never steal keystrokes the operator is aiming at a field. The one
         exception is an input that opts in with data-scan-target, which is
         how the till's own search box shares the same code path. */
      const el = e.target;
      const tag = String(el?.tagName || '').toLowerCase();
      const typingInField =
        (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) &&
        el?.dataset?.scanTarget === undefined;
      if (typingInField) return;

      /* a modifier means a shortcut, not a scan */
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      /* A slow keystroke starts a new buffer rather than extending the old
         one - this is what stops two separate scans merging when the operator
         pauses, and what discards stray single keys. */
      if (gap > HUMAN_GAP_MS) buffer.current = '';

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = buffer.current.trim();
        buffer.current = '';
        if (code.length < minLength) return;

        /* Suppress the suffix so Enter does not also submit the form behind
           the scanner, and Tab does not move focus mid-scan. */
        e.preventDefault();

        if (!allowRepeat && code === lastScan.current.code && now - lastScan.current.at < REPEAT_MS) {
          return;                       // double trigger on one label
        }
        lastScan.current = { code, at: now };

        setScanning(true);
        Promise.resolve(handler.current?.(code)).finally(() => setScanning(false));
        return;
      }

      /* printable characters only - a barcode has no arrow keys in it */
      if (e.key.length === 1) buffer.current += e.key;
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, allowRepeat, minLength]);

  return { scanning };
}

/* ==========================================================================
   The other half: the server call every scanner screen makes.

   One hook so POS, Stock Transfer, receiving and returns all talk to
   /api/barcode/scan the same way and surface the same messages. The screen
   supplies its intent; the server decides whether the unit may be used for
   it.
   ========================================================================== */
export function useBarcodeLookup({ business, location, intent, invoiceId, transferId }) {
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(async (code, alreadyScanned = []) => {
    setBusy(true);
    try {
      const r = await fetch('/api/barcode/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code, business, location, intent, invoiceId, transferId, scanned: alreadyScanned,
        }),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        return { ok: false, error: d.error || 'That barcode could not be read.', code: d.code || 'ERROR', unit: d.unit || null };
      }
      return { ok: true, unit: d.unit };
    } catch {
      /* a scanner in a shop with a flaky connection must say so, not fail
         silently and leave the operator thinking the item was added */
      return { ok: false, error: 'No response from the server - check the connection and scan again.', code: 'OFFLINE' };
    } finally {
      setBusy(false);
    }
  }, [business, location, intent, invoiceId, transferId]);

  return { lookup, busy };
}

/* Short audible feedback. A scanner operator is looking at the goods, not the
   screen, so a failed scan has to be heard. Uses the Web Audio API rather
   than an asset so there is nothing to load or to 404. */
export function useScanSound() {
  const ctxRef = useRef(null);

  return useCallback((kind = 'ok') => {
    try {
      if (!ctxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      /* a short high blip for success, a lower double for a refusal */
      osc.frequency.value = kind === 'ok' ? 1180 : 320;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'ok' ? 0.09 : 0.22));

      osc.start();
      osc.stop(ctx.currentTime + (kind === 'ok' ? 0.1 : 0.24));
    } catch {
      /* audio blocked until the page has been interacted with - not worth
         reporting, the on-screen message still shows */
    }
  }, []);
}
