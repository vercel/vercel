/**
 * Host-side implementation of the `vercel:python-analysis/host-utils` WIT interface.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalize } from 'node:path/posix';
import { domainToUnicode as nodeDomainToUnicode } from 'url';

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
    domainToAscii(domain: string): string {
      try {
        // Use the WHATWG URL parser for IDNA2008 conversion.
        // We must validate the input to avoid URL-level parsing artifacts:
        // colons would be interpreted as port separators, brackets as IPv6,
        // @ as userinfo separator, # as fragment, ? as query, / as path,
        // \ as path separator (equivalent to / in special schemes),
        // % as percent-encoding, tab/LF/CR are silently stripped by the URL parser.
        if (/[:#?/@[\]%\\\t\n\r]/.test(domain)) {
          throw new Error('domain contains invalid characters');
        }
        const url = new URL(`http://${domain}/`);
        // Verify the hostname wasn't mangled by URL parsing (e.g. empty after normalization)
        if (url.hostname === '' && domain !== '') {
          throw new Error('domain resolved to empty hostname');
        }
        return url.hostname;
      } catch {
        // jco expects { payload: string } for WIT result<_, string> errors
        throw { payload: `Invalid domain: ${domain}` };
      }
    },

    domainToUnicode(domain: string): [string, boolean] {
      // Node.js url.domainToUnicode provides full UTS #46 domain-to-unicode:
      // punycode decoding, case folding, and NFC normalization.
      // Node returns '' on failure; we return the input as best-effort in that
      // case (matching upstream idna which returns a string even on error).
      const result = nodeDomainToUnicode(domain);
      if (result !== '' || domain === '') {
        return [result, true];
      }
      return [domain, false];
    },

    nfcNormalize(s: string): string {
      return s.normalize('NFC');
    },

    nfdNormalize(s: string): string {
      return s.normalize('NFD');
    },

    nfkcNormalize(s: string): string {
      return s.normalize('NFKC');
    },

    nfkdNormalize(s: string): string {
      return s.normalize('NFKD');
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
