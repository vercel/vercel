import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transpile, writeFiles } from '@bytecodealliance/jco-transpile';

// This package uses a rust-toolchain.toml file to manage the Rust toolchain and
// the wasm32-wasip2 target, which requires cargo to be a rustup shim. Detect
// this early so we can provide a clear error instead of a confusing build failure.
function checkToolchain() {
  try {
    execFileSync('rustup', ['which', 'cargo'], { stdio: 'ignore' });
    return; // cargo is managed by rustup and a working toolchain exists
  } catch {
    // fall through to diagnose
  }

  let hasRustup = false;
  try {
    execFileSync('rustup', ['--version'], { stdio: 'ignore' });
    hasRustup = true;
  } catch {
    // rustup not found
  }

  let hasRustc = false;
  try {
    execFileSync('rustc', ['--version'], { stdio: 'ignore' });
    hasRustc = true;
  } catch {
    // rustc not found
  }

  if (hasRustup) {
    // rustup exists but `rustup which cargo` failed — no toolchain configured
    console.error(`
error: rustup is installed but no working Rust toolchain was found.

This package requires a functioning cargo managed by rustup. Run the following
to install a default toolchain:

  rustup default stable

Then restart your shell and try building again.
`);
  } else if (hasRustc) {
    // Rust is installed but not via rustup (e.g. distro package)
    console.error(`
error: a Rust installation was found but it is not managed by rustup.

This package uses a rust-toolchain.toml file to manage the Rust toolchain and
the wasm32-wasip2 target. Distro-installed or standalone Rust does not support
this — rustup is needed to automatically install and manage the correct
toolchain and compilation targets.

To install rustup alongside your existing Rust installation, run:

  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

For more information, see: https://rustup.rs

After installing, restart your shell and try building again.
`);
  } else {
    // No Rust tooling found at all
    console.error(`
error: no Rust toolchain found. rustup is required to build @vercel/python-analysis.

This package uses a rust-toolchain.toml file to manage the Rust toolchain and
the wasm32-wasip2 target. rustup is needed to automatically install and manage
the correct toolchain and compilation targets.

To install rustup, run:

  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

For more information, see: https://rustup.rs

After installing, restart your shell and try building again.
`);
  }
  process.exit(1);
}
checkToolchain();

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
