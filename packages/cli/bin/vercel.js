#!/usr/bin/env node
// Native-first trampoline with JS fallback. No postinstall.
// ESM entry so we can `await import(dist/vc.js)` in-process when no native
// binary is present. Cost: ~25-30ms Node start + 1 require.resolve.
// When native binary exists, we exit early via spawnSync.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function platformPkg() {
  return `@vercel/vc-native-${process.platform}-${process.arch}`;
}
function binName() {
  return process.platform === 'win32' ? 'vercel.exe' : 'vercel';
}
function resolveNative() {
  try {
    const pkgJson = require.resolve(`${platformPkg()}/package.json`);
    const dir = dirname(pkgJson);
    const a = join(dir, 'bin', binName());
    if (existsSync(a)) return a;
    const b = join(dir, binName());
    if (existsSync(b)) return b;
  } catch {}
  return null;
}

const force = process.env.VERCEL_NATIVE;
const bin = force === '0' ? null : resolveNative();

if (force === '1' && !bin) {
  console.error(`Native binary requested but not found (expected ${platformPkg()}).`);
  process.exit(1);
}

if (bin) {
  process.env.VERCEL_VC_NATIVE = '1';
  const r = spawnSync(bin, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (r.error && (r.error.code === 'ENOENT' || r.error.code === 'EACCES')) {
    // fall through to JS
  } else {
    if (r.error) {
      console.error(r.error.message);
      process.exit(1);
    }
    if (r.signal) {
      try { process.kill(process.pid, r.signal); } catch {}
    }
    process.exit(r.status ?? 1);
  }
}

// JS fallback: direct in-process import — no extra Node spawn.
await import(join(__dirname, '..', 'dist', 'vc.js'));
