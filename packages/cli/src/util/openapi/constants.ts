/**
 * Published OpenAPI document URL. The CLI fetches this (with a disk cache) for
 * `vercel api`, `vercel openapi`, interactive endpoint search, and webhooks.
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

/**
 * Sentinel `displayProperty` when the CLI renders the whole JSON object (no wrapper key).
 */
export const VERCEL_CLI_ROOT_DISPLAY_KEY = '__root__';
