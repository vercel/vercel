import fs from 'fs';
import {
  init as initEsmLexer,
  parse as parseEsmExports,
} from 'es-module-lexer';
import {
  init as initCjsLexer,
  parse as parseCjsExports,
} from 'cjs-module-lexer';
import debug from './debug';
import type FileFsRef from './file-fs-ref';

/**
 * Export names that identify a file as a valid Node.js API entrypoint:
 * - `default`: default `(req, res)` handler or a `fetch`-style Web handler
 * - HTTP method exports (`GET`, `POST`, …): App Router style handlers
 * - `fetch`: Web handler export
 *
 * These map directly to the handler shapes that `@vercel/node` resolves at
 * runtime (see `serverless-handler.mts`).
 */
const HANDLER_EXPORTS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'fetch',
  'default',
]);

/**
 * The two remaining handler shapes that are not expressible as a named export,
 * so the module lexers below cannot surface them:
 * - `module.exports = <fn>`: resolved at runtime via `typeof listener === 'function'`
 * - a server that calls `.listen()` (`http.createServer().listen()`, an Express
 *   `app.listen()`, Fastify, etc.): `@vercel/node` stubs `.listen()` on import to
 *   capture the server instance.
 *
 * These are matched against comment-stripped source so commented-out code does
 * not count as a handler.
 */
const NON_EXPORT_HANDLER_PATTERNS = [
  /\bmodule\.exports\s*=(?!=)/,
  /\.listen\s*\(/,
];

/**
 * Blank out comments and string/template literals, leaving only code structure
 * for {@link NON_EXPORT_HANDLER_PATTERNS} to match against.
 *
 * Comments and literals are matched by one alternation, so a literal is always
 * consumed as a single token *before* the engine can look inside it — a `/*` or
 * `//` sequence within a string (e.g. the `*​/*` in an `Accept: *​/*` header) is
 * therefore never mistaken for the start of a comment. Literals are blanked
 * rather than preserved so their contents can't be misread as code either (e.g.
 * the literal text `"module.exports ="` inside a string).
 */
function stripCommentsAndLiterals(content: string): string {
  const COMMENT_OR_LITERAL =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
  return content.replace(COMMENT_OR_LITERAL, ' ');
}

/**
 * Collect the export names declared by a module using real ESM/CJS lexers.
 *
 * The lexers are token-aware by construction, so — unlike a regex over raw text
 * — they are never fooled by export-like text appearing inside strings,
 * comments, template literals, or regex literals.
 *
 * `esmUnparsed` is `true` when the ESM lexer could not parse the file (e.g. a
 * `.tsx` handler whose body contains JSX). In that case we cannot trust the
 * absence of a handler export and must fall back to the safe default rather
 * than risk dropping a real entrypoint. The CJS lexer routinely throws on ESM
 * `import` syntax, so its failures are expected and ignored.
 */
async function getHandlerExportNames(content: string): Promise<{
  names: Set<string>;
  esmUnparsed: boolean;
}> {
  const names = new Set<string>();
  let esmUnparsed = false;

  await initEsmLexer;
  try {
    const [, exports] = parseEsmExports(content);
    for (const { n } of exports) {
      if (n) names.add(n);
    }
  } catch {
    esmUnparsed = true;
  }

  await initCjsLexer();
  try {
    for (const name of parseCjsExports(content).exports) {
      names.add(name);
    }
  } catch {
    // Expected for ESM source; the ESM lexer above already covers it.
  }

  return { names, esmUnparsed };
}

/**
 * Check if a Node.js/TypeScript file is a valid API entrypoint by detecting
 * the handler export shapes supported by `@vercel/node`:
 * - Default export (`(req, res)` handler, Web handler, or object of handlers)
 * - Named HTTP method exports (`GET`, `POST`, …) or a `fetch` export
 * - `module.exports = <fn>`
 * - A server that calls `.listen()`
 *
 * Returns `true` on error as a safe default — if we can't read or confidently
 * analyze the file, let the existing build pipeline handle it rather than risk
 * dropping a real Vercel Function.
 */
export async function isNodeEntrypoint(
  file: FileFsRef | { fsPath?: string }
): Promise<boolean> {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return true;
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    if (!content.trim()) return false;

    const { names, esmUnparsed } = await getHandlerExportNames(content);
    for (const name of names) {
      if (HANDLER_EXPORTS.has(name)) return true;
    }

    // The ESM lexer couldn't parse the file, so a missing handler export is
    // inconclusive — don't risk filtering out a real entrypoint.
    if (esmUnparsed) return true;

    const code = stripCommentsAndLiterals(content);
    return NON_EXPORT_HANDLER_PATTERNS.some(pattern => pattern.test(code));
  } catch (err) {
    debug(`Failed to check Node.js entrypoint: ${err}`);
    return true;
  }
}
