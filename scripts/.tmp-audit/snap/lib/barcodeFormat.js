export function computeSampleBarcode(prefix = '', serial = 1, suffix = '', length = 4) {
  const width = Number(length) || 4;
  return String(prefix || '') + String(serial).padStart(width, '0') + String(suffix || '');
}