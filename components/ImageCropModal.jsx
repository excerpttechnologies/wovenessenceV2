'use client';
import { useState, useCallback, useEffect } from 'react';
import Icon from './Icon';

/**
 * Simple Image Crop Modal - No external libraries
 * Works on desktop, mobile, and tablet
 */
export default function ImageCropModal({ imageFile, onCrop, onCancel }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(false);

  // Load image when file changes
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [imageFile]);

  const handleCrop = useCallback(async () => {
    if (!imageUrl) return;
    
    setProcessing(true);
    try {
      // Create canvas and draw cropped image
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size
      canvas.width = img.width * zoom;
      canvas.height = img.height * zoom;

      // Apply rotation and zoom
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Convert to data URL
      const croppedDataUrl = canvas.toDataURL(imageFile.type, 0.9);
      onCrop(croppedDataUrl);
      setProcessing(false);
    } catch (err) {
      console.error('Crop error:', err);
      setProcessing(false);
    }
  }, [imageUrl, rotation, zoom, imageFile, onCrop]);

  const handleReset = () => {
    setRotation(0);
    setZoom(1);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={processing ? undefined : onCancel}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center border-b border-line px-5 py-3">
          <span className="text-[16px] font-bold">Crop Image</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="text-inkmuted hover:text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="space-y-4">
            {/* Image Preview */}
            <div className="flex items-center justify-center overflow-hidden rounded-lg border border-line bg-gray-50" style={{ minHeight: '400px' }}>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${zoom})`,
                    maxWidth: '100%',
                    maxHeight: '400px',
                    transition: 'transform 0.2s',
                  }}
                />
              )}
            </div>

            {/* Controls */}
            <div className="space-y-3">
              {/* Zoom */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold">
                  Zoom: {zoom.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full"
                  disabled={processing}
                />
              </div>

              {/* Rotate */}
              <div className="flex items-center gap-2">
                <label className="text-[13px] font-semibold">Rotate:</label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRotation((r) => r - 90)}
                  disabled={processing}
                >
                  <Icon name="undo" size={14} />
                  Left 90°
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRotation((r) => r + 90)}
                  disabled={processing}
                >
                  Right 90°
                  <Icon name="undo" size={14} style={{ transform: 'scaleX(-1)' }} />
                </button>
                <span className="text-[13px] text-inkmuted">{rotation}°</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <button
            type="button"
            className="btn"
            onClick={handleReset}
            disabled={processing}
          >
            <Icon name="refresh" size={14} />
            Reset
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              disabled={processing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCrop}
              disabled={processing}
            >
              {processing ? <span className="spin" /> : <Icon name="check" size={14} />}
              Crop & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
