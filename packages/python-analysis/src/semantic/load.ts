/**
 * CommonJS-compatible wrapper around the WASM compilation output of
 * the Rust-based analyzer.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type ModuleType = typeof import('#wasm/vercel_python_analysis.js');
type RootType = Awaited<ReturnType<ModuleType['instantiate']>>;

let wasmInstance: RootType | null = null;
let wasmLoadPromise: Promise<RootType> | null = null;

const wasmModulePath = require.resolve('#wasm/vercel_python_analysis.js');
const wasmDir = dirname(wasmModulePath);

async function getCoreModule(path: string): Promise<WebAssembly.Module> {
  const wasmPath = join(wasmDir, path);
  const wasmBytes = await readFile(wasmPath);
  return WebAssembly.compile(wasmBytes);
}

export async function importWasmModule(): Promise<RootType> {
  if (wasmInstance) {
    return wasmInstance;
  }
  if (!wasmLoadPromise) {
    wasmLoadPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {
        WASIShim,
      } = require('@bytecodealliance/preview2-shim/instantiation');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wasmModule: ModuleType = require('#wasm/vercel_python_analysis.js');
      const imports = new WASIShim().getImportObject();
      const instance = await wasmModule.instantiate(getCoreModule, imports);
      wasmInstance = instance;
      return instance;
    })();
  }
  return wasmLoadPromise;
}
