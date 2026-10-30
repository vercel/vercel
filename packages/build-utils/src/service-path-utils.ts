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

/**
 * Valid service names, which are also used as path segments.
 */
export const SERVICE_NAME_PATTERN = '^[a-z]([a-z_-]*[a-z])?$';

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

export function getInternalServiceWorkerPathPrefix(
  serviceName: string
): string {
  return `${INTERNAL_SERVICE_PREFIX}/${serviceName}/workers`;
}

export function getInternalServiceWorkerPath(
  serviceName: string,
  entrypoint: string,
  handler = 'worker'
): string {
  const normalizedEntrypoint = normalizeInternalServiceEntrypoint(entrypoint);
  return `${getInternalServiceWorkerPathPrefix(serviceName)}/${normalizedEntrypoint}/${handler}`;
}
