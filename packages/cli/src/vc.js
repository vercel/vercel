#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI entry point */
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
// enableCompileCache was added in Node.js 22.8.0, so we need to handle older versions.
try {
  const { enableCompileCache } = await import('node:module');
  if (enableCompileCache) {
    enableCompileCache();
  }
} catch {}

// Native-first: spawn a @vercel/vc-native-{platform}-{arch} binary when
// present and exit with its result, otherwise fall through to the JS CLI.
// The native package is declared as an os/cpu-filtered optionalDependency
// so at most one platform binary downloads per install.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function resolveNative() {
  // Already running inside the native binary — never trampoline again.
  if (process.env.VERCEL_VC_NATIVE === '1') return null;
  const pkgName = `@vercel/vc-native-${process.platform}-${process.arch}`;
  const binName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  try {
    // Resolve only from this install's own tree, never from NODE_PATH.
    const dir = dirname(
      require.resolve(`${pkgName}/package.json`, { paths: [__dirname] })
    );
    const a = join(dir, 'bin', binName);
    if (existsSync(a)) return a;
    const b = join(dir, binName);
    if (existsSync(b)) return b;
  } catch {}
  return null;
}

const bin = resolveNative();

if (bin) {
  process.env.VERCEL_VC_NATIVE = '1';
  const r = spawnSync(bin, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (r.error && (r.error.code === 'ENOENT' || r.error.code === 'EACCES')) {
    delete process.env.VERCEL_VC_NATIVE;
    // fall through to JS
  } else {
    if (r.error) {
      console.error(r.error.message);
      process.exit(1);
    }
    if (r.signal) {
      try {
        process.kill(process.pid, r.signal);
      } catch {}
    }
    process.exit(r.status ?? 1);
  }
}

// Fast path for --version to avoid loading the entire CLI
if (
  process.argv.length === 3 &&
  (process.argv[2] === '--version' || process.argv[2] === '-v')
) {
  const { version } = await import('./version.mjs');
  const binaryLabel = process.env.VERCEL_VC_NATIVE === '1' ? ' (native)' : '';
  console.error(`Vercel CLI ${version}${binaryLabel}`);
  console.log(version);
  process.exit(0);
}

// Fast path for --help to avoid loading the entire CLI
if (
  process.argv.length === 3 &&
  (process.argv[2] === '--help' || process.argv[2] === '-h')
) {
  const { version } = await import('./version.mjs');
  const { help } = await import('./help.js');
  console.error(`Vercel CLI ${version}`);
  console.error(help());
  process.exit(0);
}

await import('./index.js');
