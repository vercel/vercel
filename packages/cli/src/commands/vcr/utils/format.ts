import ms from 'ms';
import bytes from 'bytes';

export function formatBytes(size: number | null | undefined): string {
  if (typeof size !== 'number' || Number.isNaN(size)) {
    return '-';
  }
  return bytes.format(size, { decimalPlaces: 1 }) ?? '-';
}

export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return '-';
  }
  return `${ms(Date.now() - time)} ago`;
}

export function formatDigest(digest: string | null | undefined): string {
  if (!digest) {
    return '-';
  }
  return digest.replace(/^sha256:/, '').slice(0, 12);
}
