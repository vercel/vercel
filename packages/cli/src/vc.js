#!/usr/bin/env node
/* eslint-disable no-console */
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
// enableCompileCache was added in Node.js 22.8.0, so we need to handle older versions.
try {
  const { enableCompileCache } = await import('node:module');
  if (enableCompileCache) {
    enableCompileCache();
  }
} catch {}

// Fast path for --version to avoid loading the entire CLI
if (
  process.argv.length === 3 &&
  (process.argv[2] === '--version' || process.argv[2] === '-v')
) {
  const { version } = await import('./version.mjs');
  console.error(`Vercel CLI ${version}`);
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
