/**
 * CommonJS-compatible wrapper around the WASM compilation output of
 * the Rust-based analyzer.
 *
 * Uses dynamic import() to load ESM modules. When running in Jest,
 * requires NODE_OPTIONS='--experimental-vm-modules' to be set.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type ModuleType = typeof import('#wasm/vercel_python_analysis.js');
type RootType = Awaited<ReturnType<ModuleType['instantiate']>>;

const WASI_SHIM_PATH = '@bytecodealliance/preview2-shim/instantiation';
const WASM_MODULE_PATH = '#wasm/vercel_python_analysis.js';

let wasmInstance: RootType | null = null;
let wasmLoadPromise: Promise<RootType> | null = null;

// Lazily resolve WASM path to avoid module load-time errors when bundled
let wasmDir: string | null = null;
function getWasmDir(): string {
  if (wasmDir === null) {
    const wasmModulePath = require.resolve(WASM_MODULE_PATH);
    wasmDir = dirname(wasmModulePath);
  }
  return wasmDir;
}

async function getCoreModule(path: string): Promise<WebAssembly.Module> {
  const wasmPath = join(getWasmDir(), path);
  const wasmBytes = await readFile(wasmPath);
  return WebAssembly.compile(wasmBytes);
}

export async function importWasmModule(): Promise<RootType> {
  if (wasmInstance) {
    return wasmInstance;
  }
  if (!wasmLoadPromise) {
    wasmLoadPromise = (async () => {
      // Use dynamic import() to load ESM modules
      // This works in Node.js and Jest (with --experimental-vm-modules)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wasiShimModule: any = await import(WASI_SHIM_PATH);
      const WASIShim = wasiShimModule.WASIShim;
      const wasmModule: ModuleType = await import(WASM_MODULE_PATH);
      const imports = new WASIShim().getImportObject();
      const instance = await wasmModule.instantiate(getCoreModule, imports);
      wasmInstance = instance;
      return instance;
    })();
  }
  return wasmLoadPromise;
}
