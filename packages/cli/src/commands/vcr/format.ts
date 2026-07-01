import bytes from 'bytes';

export function formatBytes(size: number | null | undefined): string {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return '-';
  }
  return bytes.format(size, { decimalPlaces: 1 }) ?? '-';
}
