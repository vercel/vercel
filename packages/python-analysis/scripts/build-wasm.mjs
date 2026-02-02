import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)));
const distWasmDir = join(__dirname, 'dist', 'wasm');
const wasmPath = join(
  __dirname,
  'target',
  'wasm32-wasip2',
  'release',
  'vercel_python_analysis.wasm'
);

execFileSync('cargo', ['build', '--target', 'wasm32-wasip2', '--release'], {
  cwd: __dirname,
  stdio: 'inherit',
});

const { files } = await transpile(wasmPath, {
  outDir: distWasmDir,
  name: 'vercel_python_analysis',
  tlaCompat: true,
  instantiation: 'async',
});

await writeFiles(files);
