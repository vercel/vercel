/**
 * Host-side implementation of the `vercel:python-analysis/host-utils` WIT interface.
 * Provides IDNA domain-to-ASCII conversion and Unicode normalization (NFC, NFD, NFKC, NFKD),
 * eliminating ~450 KB of ICU/Unicode lookup tables from the WASM binary.
 */
import { LRUCache } from 'lru-cache';
import { domainToUnicode as nodeDomainToUnicode } from 'url';

export function createHostUtils() {
  // Cache compiled RegExp instances, scoped to this host-utils instance.
  const regexCache = new LRUCache<string, RegExp>({ max: 64 });

  return {
    domainToAscii(domain: string): string {
      try {
        // Use the WHATWG URL parser for IDNA2008 conversion.
        // We must validate the input to avoid URL-level parsing artifacts:
        // colons would be interpreted as port separators, brackets as IPv6,
        // @ as userinfo separator, # as fragment, ? as query, / as path,
        // % as percent-encoding, etc.
        if (/[:#?/@[\]%]/.test(domain)) {
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

    regexNew(pattern: string): void {
      // Pattern already has JS syntax ((?P<name>...) -> (?<name>...)) from Rust side.
      try {
        const re = new RegExp(pattern, 'gdu');
        regexCache.set(pattern, re);
      } catch (e) {
        // jco expects { payload: string } for WIT result<_, string> errors
        throw { payload: e instanceof Error ? e.message : String(e) };
      }
    },

    regexFindAll(pattern: string, text: string): string {
      // Reuse cached RegExp compiled during regexNew, fall back to fresh instance
      const re = regexCache.get(pattern) ?? new RegExp(pattern, 'gdu');
      re.lastIndex = 0;
      const matches: Array<{
        overall: [number, number];
        groups: Array<[number, number] | null>;
        named: Record<string, [number, number] | null>;
      }> = [];

      // Build a UTF-16 offset -> UTF-8 byte offset mapping.
      // For all-ASCII text we can skip this (offsets are identical).
      const isAscii = /^[\x00-\x7f]*$/.test(text);
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
        const groups: Array<[number, number] | null> = [];
        for (let gi = 1; gi < indices.length; gi++) {
          const span = indices[gi];
          if (span) {
            groups.push([toUtf8(span[0]), toUtf8(span[1])]);
          } else {
            groups.push(null);
          }
        }

        const named: Record<string, [number, number] | null> = {};
        if (indices.groups) {
          for (const [name, span] of Object.entries(indices.groups)) {
            if (span) {
              named[name] = [toUtf8(span[0]), toUtf8(span[1])];
            } else {
              named[name] = null;
            }
          }
        }

        matches.push({
          overall: [toUtf8(overallStart), toUtf8(overallEnd)],
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

      return JSON.stringify(matches);
    },
  };
}
