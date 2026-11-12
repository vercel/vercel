import { readNonEmptyEnv } from './env.js';

/** Base URL for the Vercel API when no region is available. */
export const API_BASE_URL = 'https://api.vercel.com';

/**
 * Resolves the Vercel API base URL for a region. The region comes from the
 * `region` argument, then the `VERCEL_REGION` environment variable; without
 * either, requests go to the global {@link API_BASE_URL}.
 */
export function resolveBaseUrl({ region }: { region?: string } = {}): string {
  const resolved = region ?? readNonEmptyEnv('VERCEL_REGION');
  return resolved ? `https://api-${resolved}.vercel.com` : API_BASE_URL;
}
