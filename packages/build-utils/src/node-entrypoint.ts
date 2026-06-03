import fs from 'fs';
import debug from './debug';
import type FileFsRef from './file-fs-ref';

const HTTP_METHODS = 'GET|HEAD|OPTIONS|POST|PUT|DELETE|PATCH';

/**
 * Regex patterns that indicate a file is a valid Node.js API entrypoint.
 * A file must match at least one pattern to be considered an entrypoint.
 */
const VALID_EXPORT_PATTERNS = [
  // ESM default export: export default function handler() {}
  /export\s+default\b/,
  // CJS default export: module.exports = (req, res) => {}
  /module\.exports\s*=/,
  // ESM named HTTP method or fetch exports: export function GET() {}
  new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+(?:${HTTP_METHODS}|fetch)\\b`
  ),
  // ESM re-exports: export { GET } or export { handler as default }
  new RegExp(`export\\s*\\{[^}]*\\b(?:${HTTP_METHODS}|fetch|default)\\b`),
  // CJS named exports: exports.GET = ... or module.exports.GET = ...
  new RegExp(`(?:module\\.)?exports\\.(?:${HTTP_METHODS}|fetch|default)\\s*=`),
  // Server handler: http.createServer(...).listen() with no exports
  /http\.createServer\s*\(/,
];

/**
 * Strip single-line (//) and multi-line (/* ... *​/) comments from source code.
 * This is a heuristic to avoid false positives from commented-out exports.
 *
 * A naive regex-based stripper is string/regex-unaware: a string literal such as
 * the `Accept: ... *​/*; q=0.8` header contains the sequence `/*`, which a regex
 * treats as the start of a block comment and then deletes everything up to the
 * next real `*​/` later in the file — frequently swallowing the actual handler
 * export. To avoid that, this scanner walks the source character by character and
 * only treats `//` and `/* *​/` as comments when they appear in code context
 * (i.e. not inside a string, template literal, or regex literal).
 */
function stripComments(content: string): string {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const char = content[i];
    const next = content[i + 1];

    // Line comment: skip until end of line (preserve the newline).
    if (char === '/' && next === '/') {
      i += 2;
      while (i < len && content[i] !== '\n') i++;
      continue;
    }

    // Block comment: skip until the closing */ (preserve newlines inside it so
    // that line-anchored regexes downstream still behave).
    if (char === '/' && next === '*') {
      i += 2;
      while (i < len && !(content[i] === '*' && content[i + 1] === '/')) {
        if (content[i] === '\n') result += '\n';
        i++;
      }
      i += 2; // skip the closing */
      continue;
    }

    // String literal: copy verbatim until the matching unescaped quote.
    if (char === '"' || char === "'") {
      const quote = char;
      result += char;
      i++;
      while (i < len) {
        result += content[i];
        if (content[i] === '\\') {
          // copy the escaped character too
          i++;
          if (i < len) result += content[i];
          i++;
          continue;
        }
        if (content[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Template literal: copy verbatim until the matching unescaped backtick.
    // Nested `${ ... }` expressions are copied as-is; any `/*` inside them is
    // unlikely to matter for export detection and keeping it simple is safer
    // than mis-stripping real code.
    if (char === '`') {
      result += char;
      i++;
      while (i < len) {
        result += content[i];
        if (content[i] === '\\') {
          i++;
          if (i < len) result += content[i];
          i++;
          continue;
        }
        if (content[i] === '`') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Regex literal: only when a `/` appears in a position where a regex is
    // valid (i.e. preceded by a token that cannot end an expression). This
    // prevents treating division operators as regex while still copying real
    // regex literals verbatim so their contents aren't mistaken for comments.
    if (char === '/' && isRegexContext(result)) {
      result += char;
      i++;
      let inClass = false;
      while (i < len) {
        result += content[i];
        if (content[i] === '\\') {
          i++;
          if (i < len) result += content[i];
          i++;
          continue;
        }
        if (content[i] === '[') inClass = true;
        else if (content[i] === ']') inClass = false;
        else if (content[i] === '/' && !inClass) {
          i++;
          break;
        } else if (content[i] === '\n') {
          // Unterminated regex (shouldn't happen in valid code); bail out.
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Determine whether a `/` should start a regex literal based on the code emitted
 * so far. A regex can appear where an expression is expected, which is after
 * operators, keywords, opening brackets, etc. — but not after an identifier,
 * number, or closing bracket (which would make `/` a division operator).
 */
function isRegexContext(prefix: string): boolean {
  const trimmed = prefix.replace(/\s+$/, '');
  if (trimmed === '') return true;
  const last = trimmed[trimmed.length - 1];
  // After these, a `/` is division, not a regex.
  if (/[A-Za-z0-9_$)\]}.]/.test(last)) {
    // `return/.../`, `typeof/.../` etc. are regex contexts; check for keywords.
    const keywordMatch = trimmed.match(/(?:^|[^A-Za-z0-9_$])([A-Za-z]+)$/);
    if (keywordMatch) {
      const REGEX_PRECEDING_KEYWORDS = new Set([
        'return',
        'typeof',
        'instanceof',
        'in',
        'of',
        'new',
        'delete',
        'void',
        'do',
        'else',
        'yield',
        'await',
        'case',
      ]);
      if (REGEX_PRECEDING_KEYWORDS.has(keywordMatch[1])) return true;
    }
    return false;
  }
  return true;
}

/**
 * Check if a Node.js/TypeScript file is a valid API entrypoint by detecting
 * export patterns that correspond to supported handler shapes:
 * - Default function export (req, res handler)
 * - Named HTTP method exports (GET, POST, etc.)
 * - Fetch export
 * - module.exports / exports assignments
 *
 * Returns `true` on error as a safe default — if we can't read the file,
 * let the existing build pipeline handle it.
 */
export async function isNodeEntrypoint(
  file: FileFsRef | { fsPath?: string }
): Promise<boolean> {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return true;
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    if (!content.trim()) return false;
    const stripped = stripComments(content);
    return VALID_EXPORT_PATTERNS.some(pattern => pattern.test(stripped));
  } catch (err) {
    debug(`Failed to check Node.js entrypoint: ${err}`);
    return true;
  }
}
