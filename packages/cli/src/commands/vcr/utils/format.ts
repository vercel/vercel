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

export type VcrImageStatus = 'ready' | 'preparing' | 'unoptimized' | null;

export function formatImageStatus(status: VcrImageStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'preparing':
      return 'Preparing';
    case 'unoptimized':
      return 'Ready (unoptimized)';
    default:
      return '-';
  }
}

export const VCR_REGISTRY = 'vcr.vercel.com';

export function formatImageReference(
  teamSlug: string,
  projectName: string,
  repositoryName: string,
  digest: string | null | undefined
): string {
  if (!digest) {
    return '-';
  }
  return `${VCR_REGISTRY}/${teamSlug}/${projectName}/${repositoryName}@${digest}`;
}

export function formatTagReference(
  teamSlug: string,
  projectName: string,
  repositoryName: string,
  tag: string | null | undefined
): string {
  if (!tag) {
    return '-';
  }
  return `${VCR_REGISTRY}/${teamSlug}/${projectName}/${repositoryName}:${tag}`;
}
