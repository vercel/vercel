/**
 * Semantic analyzer for detecting application entrypoint patterns in Python
 * source code.
 */

import { importWasmModule } from '../wasm/load';

/**
 * Check if Python source code contains or exports:
 * - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
 * - A top-level 'application' callable (e.g., Django )
 * - A top-level 'handler' class (e.g., BaseHTTPRequestHandler subclass)
 *
 * This function uses a WASM-based Python parser (ruff_python_ast) for
 * accurate AST analysis without requiring a Python runtime.
 *
 * @param source - The Python source code to analyze
 * @returns Promise that resolves to true if an app or handler is found, false otherwise.
 *          Returns false for invalid Python syntax.
 *
 * @example
 * ```typescript
 * import { containsAppOrHandler } from '@vercel/python-analysis';
 *
 * const hasApp = await containsAppOrHandler(`
 * from flask import Flask
 * app = Flask(__name__)
 * `);
 * console.log(hasApp); // true
 * ```
 */
export async function containsAppOrHandler(source: string): Promise<boolean> {
  // Skip parsing if file doesn't contain {app|application|[Hh]andler}
  if (
    !source.includes('app') &&
    !source.includes('application') &&
    !source.includes('handler') &&
    !source.includes('Handler')
  ) {
    return false;
  }
  const mod = await importWasmModule();
  return mod.containsAppOrHandler(source);
}

/**
 * Extract the string value of a top-level constant with the given name.
 * Only considers simple assignments (NAME = "string") and annotated assignments
 * (NAME: str = "string") at module level. If multiple assignments exist, the last
 * one is used. Returns null if not found or the value is not a string literal.
 *
 * @param source - Python source code
 * @param name - Constant name (e.g. "VERSION", "APP_NAME")
 * @returns The string value or null
 */
export async function getStringConstant(
  source: string,
  name: string
): Promise<string | null> {
  const mod = await importWasmModule();
  return mod.getStringConstant(source, name) ?? null;
}

/**
 * Result of `getStringConstantOrImport`: either a directly-assigned string
 * value, or a list of sibling module names to follow.
 */
export type StringConstantOrImport =
  | { type: 'value'; value: string }
  | { type: 'imports'; imports: string[] };

/**
 * Like `getStringConstant`, but when no direct assignment is found, returns
 * the sibling module names (e.g. `"base"`, `"common"`) from which the constant
 * may be imported instead. If multiple statements match, the last one is used.
 *
 * Priority:
 * 1. Direct string assignment → `{ type: 'value', value: string }`
 * 2. Explicit named sibling import (`from .base import NAME`) →
 *    `{ type: 'imports', imports: ['base'] }`
 * 3. Wildcard sibling imports (`from .base import *`) →
 *    `{ type: 'imports', imports: ['common', 'base', …] }`
 *
 * Non-relative and bare-package imports are ignored.
 * Returns `null` if nothing is found.
 *
 * @param source - Python source code
 * @param name - Constant name (e.g. "WSGI_APPLICATION")
 */
export async function getStringConstantOrImport(
  source: string,
  name: string
): Promise<StringConstantOrImport | null> {
  const mod = await importWasmModule();
  const result = mod.getStringConstantOrImport(source, name);
  if (!result) return null;
  if (result.tag === 'value') {
    return { type: 'value', value: result.val as string };
  }
  return { type: 'imports', imports: result.val as string[] };
}

/** Simple check for DJANGO_SETTINGS_MODULE presence so we can skip WASM when absent */
const DJANGO_SETTINGS_MODULE_PATTERN_RE = /DJANGO_SETTINGS_MODULE/;

/**
 * Parse manage.py content for DJANGO_SETTINGS_MODULE (e.g. from
 * os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')).
 * Uses the WASM Python parser to extract the value from the AST.
 *
 * @param content - Raw content of manage.py
 * @returns The settings module string (e.g. 'app.settings') or null if not found
 */
export async function parseDjangoSettingsModule(
  content: string
): Promise<string | null> {
  if (!DJANGO_SETTINGS_MODULE_PATTERN_RE.test(content)) {
    return null;
  }
  const mod = await importWasmModule();
  return mod.parseDjangoSettingsModule(content) ?? null;
}
