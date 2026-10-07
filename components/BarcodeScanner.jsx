'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function BarcodeScanner({ onScan, onClose }) {
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(true);
  const scannerRef = useRef(null);
  const html5QrcodeScannerRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        if (!html5QrcodeScannerRef.current) {
          html5QrcodeScannerRef.current = new Html5QrcodeScanner(
            'reader',
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            },
            false
          );
        }

        html5QrcodeScannerRef.current.render(
          (decodedText, decodedResult) => {
            if (mounted && decodedText) {
              onScan(decodedText);
              handleClose();
            }
          },
          (errorMessage) => {
            // Ignore frame processing errors
          }
        );
      } catch (err) {
        if (mounted) {
          setError('Unable to access camera. Please allow camera access or enter the waybill number manually.');
          setScanning(false);
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      handleClose();
    };
  }, [onScan]);

  const handleClose = () => {
    if (html5QrcodeScannerRef.current) {
      html5QrcodeScannerRef.current.clear().catch(() => {});
      html5QrcodeScannerRef.current = null;
    }
    setScanning(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="card-title">Scan Vendor Waybill</span>
          <button
            type="button"
            className="btn"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {error ? (
            <div className="flex items-center gap-3 rounded-md border border-[#f5c2c7] bg-[#f8d7da] px-4 py-3 text-[13px] text-[#842029]">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          ) : (
            <>
              <div className="mb-4 text-center text-sm text-gray-600">
                Point camera at barcode
              </div>
              <div id="reader" className="w-full" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
