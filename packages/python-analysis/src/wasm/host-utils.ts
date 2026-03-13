/**
 * Host-side implementation of the `vercel:python-analysis/host-utils` WIT interface.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalize } from 'node:path';

/**
 * Function type for reading referenced requirement files.
 */
export type ReadFileFn = (path: string) => string | null;

export interface ReadFileContext {
  readFile: ReadFileFn;
  workingDir?: string;
}

export const readFileStorage = new AsyncLocalStorage<ReadFileContext>();

/**
 * Error class for WIT `result<_, string>` returns.
 *
 * jco (>=0.14) translates a host-side throw into a WIT error result when
 * the thrown object has a `payload` property matching the error type.
 * See: https://github.com/bytecodealliance/jco/blob/main/docs/src/runtime.md
 */
class WitResultError extends Error {
  payload: string;
  constructor(message: string) {
    super(message);
    this.payload = message;
  }
}

export function createHostUtils() {
  return {
    readFile(path: string): string {
      const ctx = readFileStorage.getStore();
      if (ctx?.readFile) {
        const relative = stripWorkingDir(path, ctx.workingDir);
        if (relative != null) {
          const result = ctx.readFile(relative);
          if (result != null) return result;
        }
      }
      // No readFile callback or it returned null -- do not fall through to
      // readFileSync because the WASM module could request arbitrary host
      // paths (e.g. via `-r /etc/passwd` in requirements.txt).
      throw new WitResultError(`File not found: ${path}`);
    },
  };
}

/**
 * Strip the workingDir prefix from an absolute path to produce a relative
 * path for the readFile callback.  If the path is outside the workingDir,
 * returns `null` to signal that the file should not be accessible.
 */
function stripWorkingDir(path: string, workingDir?: string): string | null {
  // Normalize first to resolve `.` and `..` segments (e.g. /foo/../a.txt -> /a.txt)
  const normalized = normalize(path);
  if (!workingDir) {
    return normalized;
  }
  const normalizedDir = normalize(workingDir);
  const prefix = normalizedDir.endsWith('/')
    ? normalizedDir
    : normalizedDir + '/';
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length);
  }
  // Handle exact match (path is the workingDir itself)
  if (normalized === normalizedDir) {
    return '';
  }
  // Path is outside workingDir -- do not expose it to the callback.
  return null;
}
