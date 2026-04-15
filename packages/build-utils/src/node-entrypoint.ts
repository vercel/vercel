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
 * This is a simple heuristic to avoid false positives from commented-out exports.
 */
function stripComments(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '') // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // multi-line comments
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
