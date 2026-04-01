/**
 * URL for the Vercel OpenAPI specification
 */
export const OPENAPI_URL = 'https://openapi.vercel.sh/';

/**
 * Filename for the cached OpenAPI spec
 */
export const CACHE_FILE = 'openapi-spec.json';

/**
 * Cache TTL in milliseconds (24 hours)
 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Timeout for fetching the OpenAPI spec in milliseconds (10 seconds)
 */
export const FETCH_TIMEOUT_MS = 10 * 1000;
