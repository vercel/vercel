/**
 * Semantic analyzer for detecting application entrypoint patterns in Python
 * source code.
 */

import { importWasmModule } from './load';

/**
 * Check if Python source code contains or exports:
 * - A top-level 'app' callable (e.g., Flask, FastAPI, Sanic apps)
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
  const mod = await importWasmModule();
  return mod.containsAppOrHandler(source);
}
