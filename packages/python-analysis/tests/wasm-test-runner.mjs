#!/usr/bin/env node
/**
 * WASM component test runner for wasm32-wasip2 test binaries.
 *
 * Used as `cargo test --target wasm32-wasip2` runner via .cargo/config.toml.
 * Transpiles the WASM component with jco, loads it with the real host-utils
 * implementation (same as production), and propagates the exit code.
 */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = dirname(__dirname);

// Import the real host-utils implementation (same as production)
const { createHostUtils } = await import(
  join(workspaceRoot, 'src', 'wasm', 'host-utils.ts')
);

const wasmPath = process.argv[2];
if (!wasmPath) {
  console.error('usage: wasm-test-runner.mjs <wasm-file> [args...]');
  process.exit(1);
}

// Transpile the WASM component to ESM
const tmpDir = await mkdtemp(join(tmpdir(), 'wasm-test-'));
try {
  const { files } = await transpile(wasmPath, {
    outDir: tmpDir,
    name: 'test_component',
    tlaCompat: true,
    instantiation: 'async',
  });
  await writeFiles(files);

  // Load the transpiled module
  const mod = await import(join(tmpDir, 'test_component.js'));

  async function getCoreModule(path) {
    const wasmBytes = new Uint8Array(await readFile(join(tmpDir, path)));
    return WebAssembly.compile(wasmBytes);
  }

  // Instantiate with WASI shim + real host-utils
  const { WASIShim } = await import(
    '@bytecodealliance/preview2-shim/instantiation'
  );
  const imports = {
    ...new WASIShim().getImportObject(),
    'vercel:python-analysis/host-utils': createHostUtils(),
  };

  const instance = await mod.instantiate(getCoreModule, imports);

  // wasi:cli/run#run -- returns void on success, throws on failure
  instance.run.run();
  process.exit(0);
} catch (e) {
  if (e && typeof e === 'object' && 'exitCode' in e) {
    process.exit(e.exitCode);
  }
  console.error(e);
  process.exit(1);
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}
