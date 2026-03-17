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
 * @returns Promise that resolves to the matched variable name (e.g. "app",
 *          "application", "handler"), or null if not found.
 *          Returns null for invalid Python syntax.
 *
 * @example
 * ```typescript
 * import { containsAppOrHandler } from '@vercel/python-analysis';
 *
 * const name = await containsAppOrHandler(`
 * from flask import Flask
 * app = Flask(__name__)
 * `);
 * console.log(name); // "app"
 * ```
 */
export async function containsAppOrHandler(
  source: string
): Promise<string | null> {
  // Skip parsing if file doesn't contain {app|application|[Hh]andler}
  if (
    !source.includes('app') &&
    !source.includes('application') &&
    !source.includes('handler') &&
    !source.includes('Handler')
  ) {
    return null;
  }
  const mod = await importWasmModule();
  return mod.containsAppOrHandler(source) ?? null;
}

/**
 * Check if a top-level callable with the given name exists in Python source.
 *
 * Returns true if found, false otherwise.
 * Returns false for invalid Python syntax.
 *
 * @param source - The Python source code to analyze
 * @param name - The callable name to look for (e.g. "cleanup")
 */
export async function containsTopLevelCallable(
  source: string,
  name: string
): Promise<boolean> {
  if (!source.includes(name)) {
    return false;
  }
  const mod = await importWasmModule();
  return mod.containsTopLevelCallable(source, name);
}

/**
 * Extract the string value of a top-level constant with the given name.
 * Only considers simple assignments (NAME = "string") and annotated assignments
 * (NAME: str = "string") at module level. Returns the first matching string
 * value, or null if not found or the value is not a string literal.
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
