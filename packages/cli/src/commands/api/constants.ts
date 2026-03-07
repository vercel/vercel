/**
 * Base URL for the Vercel API
 */
export const API_BASE_URL = 'https://api.vercel.com';

/**
 * API endpoint paths known to return streaming (NDJSON) responses.
 * These endpoints automatically use streaming mode without requiring --stream.
 * Use `*` as a wildcard for dynamic path segments.
 */
export const STREAMING_ENDPOINTS: string[] = [
  '/v1/projects/*/deployments/*/runtime-logs',
  '/v3/now/deployments/*/events',
  '/v1/billing/charges',
];

// Re-export OpenAPI constants for backwards compatibility
export {
  OPENAPI_URL,
  CACHE_FILE,
  CACHE_TTL_MS,
  FETCH_TIMEOUT_MS,
} from '../../util/openapi';
