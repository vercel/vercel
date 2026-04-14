/**
 * URL for the Vercel OpenAPI specification
 */
export const OPENAPI_URL = 'https://openapi.vercel.sh/';

/**
 * When set, the CLI loads the OpenAPI document from this file path instead of
 * fetching {@link OPENAPI_URL} (skips network and the global on-disk cache).
 * Use for local iteration (e.g. `export VERCEL_OPENAPI_SPEC_PATH=~/code/vercel/openapi.json`).
 */
export const VERCEL_OPENAPI_SPEC_PATH = process.env.VERCEL_OPENAPI_SPEC_PATH;

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
