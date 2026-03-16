/**
 * Host-side implementation of the `vercel:python-analysis/host-utils` WIT interface.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalize } from 'node:path';
import { LRUCache } from 'lru-cache';
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

const ASCII_ONLY = /^[\x00-\x7f]*$/;

export function createHostUtils() {
  // Cache compiled RegExp instances, scoped to this host-utils instance.
  const regexCache = new LRUCache<string, RegExp>({ max: 64 });

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
        throw new WitResultError(`Invalid domain: ${domain}`);
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

    regexNew(pattern: string, reFlags: string): void {
      // Pattern and flags have been fully translated from Rust regex syntax to
      // JS syntax by the Rust-side translate_pattern function.  reFlags already
      // includes g, d, v — the host just passes them straight to RegExp.
      try {
        const re = new RegExp(pattern, reFlags);
        regexCache.set(pattern + '\0' + reFlags, re);
      } catch (e) {
        throw new WitResultError(e instanceof Error ? e.message : String(e));
      }
    },

    regexFindAll(
      pattern: string,
      reFlags: string,
      text: string
    ): Array<{
      overall: { start: number; end: number };
      groups: Array<{ start: number; end: number } | undefined>;
      named: Array<{
        name: string;
        span: { start: number; end: number } | undefined;
      }>;
    }> {
      const cacheKey = pattern + '\0' + reFlags;
      // Reuse cached RegExp compiled during regexNew, fall back to fresh instance.
      let re = regexCache.get(cacheKey);
      if (!re) {
        re = new RegExp(pattern, reFlags);
        regexCache.set(cacheKey, re);
      }
      re.lastIndex = 0;
      const matches: Array<{
        overall: { start: number; end: number };
        groups: Array<{ start: number; end: number } | undefined>;
        named: Array<{
          name: string;
          span: { start: number; end: number } | undefined;
        }>;
      }> = [];

      // Build a UTF-16 offset -> UTF-8 byte offset mapping.
      // For all-ASCII text we can skip this (offsets are identical).
      const isAscii = ASCII_ONLY.test(text);
      let utf16ToUtf8: Uint32Array | null = null;
      if (!isAscii) {
        // Build mapping: for each UTF-16 code unit index, store the
        // corresponding UTF-8 byte offset.
        utf16ToUtf8 = new Uint32Array(text.length + 1);
        let byteOffset = 0;
        for (let i = 0; i < text.length; i++) {
          utf16ToUtf8[i] = byteOffset;
          const code = text.charCodeAt(i);
          if (code < 0x80) {
            byteOffset += 1;
          } else if (code < 0x800) {
            byteOffset += 2;
          } else if (
            code >= 0xd800 &&
            code <= 0xdbff &&
            i + 1 < text.length &&
            text.charCodeAt(i + 1) >= 0xdc00 &&
            text.charCodeAt(i + 1) <= 0xdfff
          ) {
            // High surrogate + low surrogate pair = 4 UTF-8 bytes
            byteOffset += 4;
            i++; // skip low surrogate
            utf16ToUtf8[i] = byteOffset;
          } else {
            byteOffset += 3;
          }
        }
        utf16ToUtf8[text.length] = byteOffset;
      }

      const toUtf8 = (pos: number): number => {
        if (isAscii || utf16ToUtf8 === null) return pos;
        return utf16ToUtf8[pos];
      };

      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        // `indices` is available because we use the `d` flag
        const mWithIndices = m as RegExpExecArray & {
          indices: Array<[number, number] | undefined> & {
            groups?: Record<string, [number, number] | undefined>;
          };
        };
        const indices = mWithIndices.indices;
        const [overallStart, overallEnd] = indices[0]!;

        // Positional groups (indices[1], indices[2], ...)
        const groups: Array<{ start: number; end: number } | undefined> = [];
        for (let gi = 1; gi < indices.length; gi++) {
          const span = indices[gi];
          if (span) {
            groups.push({
              start: toUtf8(span[0]),
              end: toUtf8(span[1]),
            });
          } else {
            groups.push(undefined);
          }
        }

        const named: Array<{
          name: string;
          span: { start: number; end: number } | undefined;
        }> = [];
        if (indices.groups) {
          for (const [name, span] of Object.entries(indices.groups)) {
            if (span) {
              named.push({
                name,
                span: {
                  start: toUtf8(span[0]),
                  end: toUtf8(span[1]),
                },
              });
            } else {
              named.push({ name, span: undefined });
            }
          }
        }

        matches.push({
          overall: {
            start: toUtf8(overallStart),
            end: toUtf8(overallEnd),
          },
          groups,
          named,
        });

        // Advance past zero-length matches to avoid infinite loop.
        // Must advance by a full code point (not just one UTF-16 code unit)
        // to avoid landing in the middle of a surrogate pair.
        if (m[0].length === 0) {
          if (
            re.lastIndex < text.length &&
            text.charCodeAt(re.lastIndex) >= 0xd800 &&
            text.charCodeAt(re.lastIndex) <= 0xdbff
          ) {
            re.lastIndex += 2;
          } else {
            re.lastIndex++;
          }
        }
      }

      return matches;
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
