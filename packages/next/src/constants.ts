export const KIB = 1024;

export const MIB = 1024 * KIB;

/**
 * The maximum size of a *compressed* edge function.
 */
export const EDGE_FUNCTION_SIZE_LIMIT = 4 * MIB;

export const MAX_UNCOMPRESSED_LAMBDA_SIZE = 250 * MIB;

// we need to leave wiggle room as other files are added
// post build so we don't want to completely pack the function
export const LAMBDA_RESERVED_UNCOMPRESSED_SIZE = 25 * MIB;

export const LAMBDA_RESERVED_COMPRESSED_SIZE = 5 * MIB;
