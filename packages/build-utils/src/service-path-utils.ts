/**
 * Shared utilities for generating internal service paths.
 *
 * These are used by builders (e.g. @vercel/python) to produce cron entries
 * and rewrite routes for service builds.
 */

/**
 * Reserved internal namespace used by services routing/runtime plumbing.
 */
export const INTERNAL_SERVICE_PREFIX = '/_svc';

function normalizeInternalServiceEntrypoint(entrypoint: string): string {
  const normalized = entrypoint
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.[^/.]+$/, '');
  return normalized || 'index';
}

export function getInternalServiceFunctionPath(serviceName: string): string {
  return `${INTERNAL_SERVICE_PREFIX}/${serviceName}/index`;
}

export function getInternalServiceCronPathPrefix(serviceName: string): string {
  return `${INTERNAL_SERVICE_PREFIX}/${serviceName}/crons`;
}

export function getInternalServiceCronPath(
  serviceName: string,
  entrypoint: string,
  handler = 'cron'
): string {
  const normalizedEntrypoint = normalizeInternalServiceEntrypoint(entrypoint);
  return `${getInternalServiceCronPathPrefix(serviceName)}/${normalizedEntrypoint}/${handler}`;
}
