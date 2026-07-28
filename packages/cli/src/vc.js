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

// Spawn the @vercel/vc-native-{platform}-{arch} binary when it's present and
// the user has opted in (`useNativeBinary`); otherwise run the JS CLI.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveNative() {
  // Already running inside the native binary — never trampoline again.
  if (process.env.VERCEL_VC_NATIVE === '1') return null;
  const pkgName = `@vercel/vc-native-${process.platform}-${process.arch}`;
  const binName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  // Walk up from this install's own tree looking for a sibling native
  // package. `require.resolve()` is not used because it falls back to
  // NODE_PATH and the global folders even when `paths` is given.
  let dir = __dirname;
  while (true) {
    const pkgDir = join(dir, 'node_modules', pkgName);
    if (existsSync(join(pkgDir, 'package.json'))) {
      const a = join(pkgDir, 'bin', binName);
      if (existsSync(a)) return a;
      const b = join(pkgDir, binName);
      if (existsSync(b)) return b;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Read `--global-config`/`-Q` without loading the full CLI arg parser.
function globalConfigDirFromArgv() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--global-config' || arg === '-Q') {
      return argv[i + 1];
    }
    if (arg.startsWith('--global-config=')) {
      return arg.slice('--global-config='.length);
    }
  }
  return undefined;
}

// Any failure to read config counts as "not opted in".
async function isNativeBinaryOptedIn() {
  const envOverride = process.env.VERCEL_CLI_USE_NATIVE_BINARY;
  if (envOverride === '1' || envOverride === 'true') return true;
  if (envOverride === '0' || envOverride === 'false') return false;

  try {
    // Zod-free subpath to avoid loading zod + schemas on this hot path.
    const config = await import('@vercel/cli-config/paths');
    const argDir = globalConfigDirFromArgv();
    const configDir = argDir
      ? resolve(process.cwd(), argDir)
      : config.getGlobalPathConfig();
    const configPath = config.getConfigFilePath(configDir);
    return config.readGlobalConfigFlag(configPath, 'useNativeBinary') === true;
  } catch {
    return false;
  }
}

const bin = resolveNative();

if (bin && (await isNativeBinaryOptedIn())) {
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
