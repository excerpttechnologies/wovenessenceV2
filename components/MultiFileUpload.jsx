'use client';
import { useState, useRef, useId } from 'react';
import Icon from './Icon';
import DocumentPreviewModal from './DocumentPreviewModal';
import ImageCropModal from './ImageCropModal';
import { compressImage, prettyBytes } from '@/lib/imageFile';

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

async function fileOrUrlToBlob(url) {
  if (typeof url === 'string' && url.startsWith('data:')) {
    return dataUrlToBlob(url);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not fetch image file');
  return await r.blob();
}

export function normalizeFiles(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((item, idx) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const trimmed = item.trim();
          if (!trimmed) return null;
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) return normalizeFiles(parsed);
            } catch {
              // ignore
            }
          }
          const name = trimmed.split('/').pop() || `Attachment-${idx + 1}`;
          const isPdf = /\.pdf$/i.test(name) || trimmed.includes('application/pdf');
          return {
            _id: `legacy_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            url: trimmed,
            name,
            size: 0,
            type: isPdf ? 'application/pdf' : 'image/jpeg',
          };
        }
        if (typeof item === 'object') {
          const url = item.url || '';
          if (!url) return null;
          const name = item.name || url.split('/').pop() || `Attachment-${idx + 1}`;
          const isPdf = /\.pdf$/i.test(name) || String(item.type || item.mime || '').includes('pdf');
          return {
            _id: item._id || item.id || `file_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            url,
            name,
            size: Number(item.size) || 0,
            type: item.type || item.mime || (isPdf ? 'application/pdf' : 'image/jpeg'),
          };
        }
        return null;
      })
      .flat()
      .filter((item) => item && item.url);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return normalizeFiles(parsed);
      } catch {
        // ignore
      }
    }
    const name = trimmed.split('/').pop() || 'Attachment';
    const isPdf = /\.pdf$/i.test(name) || trimmed.includes('application/pdf');
    return [{
      _id: `file_0_${Math.random().toString(36).slice(2, 6)}`,
      url: trimmed,
      name,
      size: 0,
      type: isPdf ? 'application/pdf' : 'image/jpeg',
    }];
  }

  if (typeof val === 'object' && val.url) {
    const isPdf = /\.pdf$/i.test(val.name || val.url || '') || String(val.type || val.mime || '').includes('pdf');
    return [{
      _id: val._id || val.id || 'file_0',
      url: val.url,
      name: val.name || val.url.split('/').pop() || 'Attachment',
      size: Number(val.size) || 0,
      type: val.type || val.mime || (isPdf ? 'application/pdf' : 'image/jpeg'),
    }];
  }

  return [];
}

export default function MultiFileUpload({
  value,
  onChange,
  accept = 'image/*,.pdf,application/pdf',
  label = '',
  placeholder = 'Choose File(s)',
  disabled = false,
  readOnly = false,
  compact = false,
  title = 'Document Preview',
}) {
  const inputId = useId();
  const cropInputId = useId();
  const fileInputRef = useRef(null);
  const cropInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [err, setErr] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [croppingItem, setCroppingItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const files = normalizeFiles(value);

  async function uploadOne(file) {
    let blob = file;
    let name = file.name || 'file';

    if (file.type && file.type.startsWith('image/')) {
      try {
        const out = await compressImage(file, { maxDim: 1600, maxBytes: 800 * 1024 });
        blob = out.blob;
        if (out.type === 'image/jpeg' && !/\.jpe?g$/i.test(name)) {
          name = name.replace(/\.[^.]+$/, '') + '.jpg';
        }
      } catch (ex) {
        console.warn('Image compression skipped, using raw file:', ex);
      }
    }

    const body = new FormData();
    body.append('file', blob, name);
    const r = await fetch('/api/upload', { method: 'POST', body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(d.error || `Upload failed for ${name}`);
    }
    return {
      _id: `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      url: d.url,
      name: d.name || name,
      size: d.size || blob.size || 0,
      type: d.type || file.type || (/\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg'),
    };
  }

  async function handleFilesSelected(selectedFileList) {
    if (!selectedFileList || !selectedFileList.length) return;
    const incoming = Array.from(selectedFileList);
    if (!incoming.length) return;

    // If user picks a single image file -> immediately open ImageCropModal!
    if (incoming.length === 1 && incoming[0].type && incoming[0].type.startsWith('image/')) {
      const singleImage = incoming[0];
      setCroppingItem({
        isNew: true,
        imageFile: singleImage,
        file: { name: singleImage.name, type: singleImage.type, size: singleImage.size },
      });
      return;
    }

    setErr('');
    setBusy(true);
    setBusyText(`Uploading ${incoming.length} file${incoming.length > 1 ? 's' : ''}...`);

    try {
      const uploadedResults = [];
      for (let i = 0; i < incoming.length; i++) {
        setBusyText(`Uploading file ${i + 1} of ${incoming.length}...`);
        const item = await uploadOne(incoming[i]);
        uploadedResults.push(item);
      }

      /* Append new files to existing files - NEVER overwrite */
      const next = [...files, ...uploadedResults];
      onChange(next);
    } catch (ex) {
      console.error('MultiFileUpload upload error:', ex);
      setErr(ex.message || 'Failed to upload one or more files.');
    } finally {
      setBusy(false);
      setBusyText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (cropInputRef.current) {
        cropInputRef.current.value = '';
      }
    }
  }

  function handleRemoveItem(idxToRemove) {
    const itemToRemove = files[idxToRemove];
    if (!itemToRemove) return;

    const confirmed = window.confirm(`Remove attachment "${itemToRemove.name}"?`);
    if (!confirmed) return;

    const next = files.filter((_, idx) => idx !== idxToRemove);
    onChange(next);
  }

  async function handleStartCrop(file, index) {
    try {
      setBusy(true);
      setBusyText('Preparing image for cropping...');
      const blob = await fileOrUrlToBlob(file.url);
      const imgFile = new File([blob], file.name || 'image.jpg', { type: blob.type || 'image/jpeg' });
      setCroppingItem({ isNew: false, file, index, imageFile: imgFile });
    } catch (ex) {
      console.error('Failed to prepare image for crop:', ex);
      alert('Could not load this image for cropping.');
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  async function handleCroppedResult(dataUrl) {
    if (!croppingItem) return;
    try {
      setBusy(true);
      setBusyText('Saving cropped image...');
      const blob = dataUrlToBlob(dataUrl);
      const body = new FormData();
      const rawName = croppingItem.file?.name || croppingItem.imageFile?.name || 'image.jpg';
      const cleanBase = rawName.replace(/\.[^.]+$/, '').replace(/^cropped-/, '');
      const filename = `cropped-${cleanBase}.jpg`;
      body.append('file', blob, filename);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Failed to upload cropped image');

      const croppedEntry = {
        _id: `crop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: d.url,
        name: filename,
        size: d.size || blob.size,
        type: 'image/jpeg',
      };

      if (croppingItem.isNew) {
        // Appending newly cropped image
        onChange([...files, croppedEntry]);
      } else {
        // Replacing existing image at index in-place
        const next = [...files];
        next[croppingItem.index] = {
          ...next[croppingItem.index],
          ...croppedEntry,
        };
        onChange(next);
      }
      setCroppingItem(null);
    } catch (ex) {
      console.error('Save cropped image error:', ex);
      alert(ex.message || 'Failed to save cropped image.');
    } finally {
      setBusy(false);
      setBusyText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cropInputRef.current) cropInputRef.current.value = '';
    }
  }

  async function handleUploadOriginal() {
    if (!croppingItem?.imageFile) return;
    const file = croppingItem.imageFile;
    setCroppingItem(null);
    setBusy(true);
    setBusyText('Uploading original image...');
    try {
      const item = await uploadOne(file);
      onChange([...files, item]);
    } catch (ex) {
      console.error('Failed to upload image:', ex);
      setErr(ex.message || 'Failed to upload image.');
    } finally {
      setBusy(false);
      setBusyText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cropInputRef.current) cropInputRef.current.value = '';
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !readOnly) setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || readOnly) return;
    if (e.dataTransfer?.files?.length) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }

  const isImageFile = (item) => {
    const t = String(item.type || '').toLowerCase();
    const u = String(item.url || '').toLowerCase();
    const n = String(item.name || '').toLowerCase();
    return t.startsWith('image/') || u.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(n || u);
  };

  return (
    <div className="w-full">
      {/* Upload Action Bar / Zone */}
      <div
        className={
          'relative flex flex-col justify-center rounded-md border transition-colors '
          + (isDragging
            ? 'border-brand bg-brand/5'
            : files.length > 0
              ? 'border-linestrong bg-slate-50/70 p-2'
              : 'border-dashed border-linestrong bg-white p-2.5 hover:border-brand')
        }
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Multiple File Upload Input */}
            <label
              htmlFor={inputId}
              className={
                'inline-flex items-center gap-2 rounded border border-linestrong bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-xs transition-colors '
                + (busy || disabled || readOnly
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer hover:border-brand hover:text-brand')
              }
            >
              <Icon name="upload" size={14} className="text-slate-500" />
              <span>
                {busy
                  ? busyText || 'Uploading...'
                  : files.length > 0
                    ? '+ Add More Files'
                    : placeholder}
              </span>
              <input
                id={inputId}
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={accept}
                disabled={busy || disabled || readOnly}
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
            </label>

            {/* Direct Crop & Add Image Button */}
            {!disabled && !readOnly && !busy && (
              <label
                htmlFor={cropInputId}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#bfe3cf] bg-[#f3fbf6] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#0f9d57] shadow-xs transition-colors hover:bg-[#0f9d57] hover:text-white"
                title="Select an image to crop and attach"
              >
                <span>✂</span>
                <span>Crop &amp; Add Image</span>
                <input
                  id={cropInputId}
                  ref={cropInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy || disabled || readOnly}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setCroppingItem({
                        isNew: true,
                        imageFile: f,
                        file: { name: f.name, type: f.type, size: f.size },
                      });
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          <div className="text-[12px] text-inkmuted">
            {busy ? (
              <span className="flex items-center gap-1.5 text-brand font-medium">
                <span className="spin inline-block h-3 w-3 border-2 border-brand border-t-transparent rounded-full" />
                {busyText}
              </span>
            ) : files.length > 0 ? (
              <span className="font-medium text-slate-700">
                {files.length} file{files.length > 1 ? 's' : ''} attached
              </span>
            ) : (
              <span>Upload multiple files (PDF/Images) with auto-crop for images</span>
            )}
          </div>
        </div>

        {err && <div className="mt-2 text-[12px] text-red-600 font-medium">{err}</div>}
      </div>

      {/* Files List / Thumbnails Grid */}
      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((file, idx) => {
            const isImg = isImageFile(file);
            return (
              <div
                key={file._id || `${file.url}_${idx}`}
                className="group flex items-center justify-between gap-2.5 rounded-md border border-line bg-white p-1.5 shadow-2xs hover:border-linestrong transition-all"
              >
                {/* Thumbnail / File Icon */}
                <div
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-line bg-slate-50"
                  onClick={() => setPreviewItem(file)}
                  title="Click to preview"
                >
                  {isImg ? (
                    <img
                      src={file.url}
                      alt={file.name || 'image'}
                      className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-0.5 text-center">
                      <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 uppercase leading-none">
                        PDF
                      </span>
                    </div>
                  )}
                </div>

                {/* File Details */}
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[12.5px] font-medium text-slate-800 cursor-pointer hover:text-brand"
                    onClick={() => setPreviewItem(file)}
                    title={file.name}
                  >
                    {file.name}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-inkmuted">
                    {file.size > 0 && <span>{prettyBytes(file.size)}</span>}
                    <span className="capitalize font-medium text-slate-600">
                      {isImg ? 'Image' : 'PDF Document'}
                    </span>
                  </div>
                </div>

                {/* File Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewItem(file)}
                    className="attachment-action hover:border-brand hover:text-brand"
                    title="Preview document"
                  >
                    View
                  </button>

                  {/* Crop button explicitly available for every image file */}
                  {isImg && !disabled && !readOnly && (
                    <button
                      type="button"
                      onClick={() => handleStartCrop(file, idx)}
                      className="attachment-action hover:border-brand hover:text-brand font-bold"
                      title="Crop this image"
                    >
                      ✂ Crop
                    </button>
                  )}

                  <a
                    href={file.url}
                    download={file.name || 'download'}
                    className="attachment-action hover:border-slate-500 hover:text-slate-700"
                    title="Download file"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download
                  </a>

                  {!disabled && !readOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="attachment-action attachment-action-danger"
                      title="Remove this attachment"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewItem && (
        <DocumentPreviewModal
          open={Boolean(previewItem)}
          url={previewItem.url}
          title={previewItem.name || title}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Image Crop Modal */}
      {croppingItem && (
        <ImageCropModal
          imageFile={croppingItem.imageFile}
          onCrop={handleCroppedResult}
          onCancel={() => {
            setCroppingItem(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cropInputRef.current) cropInputRef.current.value = '';
          }}
          onSkip={croppingItem.isNew ? handleUploadOriginal : undefined}
        />
      )}
    </div>
  );
}
