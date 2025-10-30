export const KIB = 1024;

export const MIB = 1024 * KIB;

/**
 * The maximum size of a *compressed* edge function.
 */
export const EDGE_FUNCTION_SIZE_LIMIT = 4 * MIB;

/**
 * The maximum size of an uncompressed function.
 */
export const DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE = 250 * MIB;

/**
 * The maximum size of an uncompressed function using Bun. It's 100 MiB smaller
 * than the default limit due to Bun's binary size.
 */
export const DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE_BUN = 150 * MIB;

// we need to leave wiggle room as other files are added
// post build so we don't want to completely pack the function
export const LAMBDA_RESERVED_UNCOMPRESSED_SIZE = 25 * MIB;

export const INTERNAL_PAGES = ['_app.js', '_error.js', '_document.js'];
