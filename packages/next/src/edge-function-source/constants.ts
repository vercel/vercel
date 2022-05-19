const KIB = 1024;
const MIB = 1024 * KIB;

/**
 * The limit after compression. it has to be kibibyte instead of kilobyte
 * See https://github.com/cloudflare/wrangler/blob/8907b12add3d70ee21ac597b69cd66f6807571f4/src/wranglerjs/output.rs#L44
 */
const EDGE_FUNCTION_SCRIPT_SIZE_LIMIT = MIB;

/**
 * This safety buffer must cover the size of our whole runtime layer compressed
 * plus some extra space to allow it to grow in the future. At the time of
 * writing this comment the compressed size size is ~7KiB so 20KiB should
 * be more than enough.
 */
const EDGE_FUNCTION_SCRIPT_SIZE_BUFFER = 20 * KIB;

/**
 * The max size we allow for compressed user code is the compressed script
 * limit minus the compressed safety buffer. We must check this limit after
 * compressing the user code.
 */
export const EDGE_FUNCTION_USER_SCRIPT_SIZE_LIMIT =
  EDGE_FUNCTION_SCRIPT_SIZE_LIMIT - EDGE_FUNCTION_SCRIPT_SIZE_BUFFER;
