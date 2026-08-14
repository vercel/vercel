/**
 * URL for the Vercel OpenAPI specification
 */
export const OPENAPI_URL = 'https://openapi.vercel.sh/';

/**
 * The vercel.com endpoint that exchanges a Vercel session for a deployment
 * protection JWT (`_vercel_jwt`).
 */
export const SSO_API_URL = 'https://vercel.com/sso-api';

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
 * Maximum OpenAPI spec response size in bytes (50 MiB)
 */
export const MAX_OPENAPI_SPEC_BYTES = 50 * 1024 * 1024;

/**
 * Sentinel `displayProperty` when the CLI renders the whole JSON object (no wrapper key).
 */
export const VERCEL_CLI_ROOT_DISPLAY_KEY = '__root__';
