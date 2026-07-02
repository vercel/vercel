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

// Managed CLI store redirect (experimental, VERCEL_CLI_STORE=1): when the
// self-owned store at ~/.vercel/cli holds a newer version than this install,
// run that version instead. This makes `vc upgrade` take effect for every
// install of the CLI on the machine (npm, pnpm, yarn, any node version)
// without touching any package manager. Best-effort: any failure falls
// through to running this install, which is the pre-store behavior.
if (
  process.env.VERCEL_CLI_STORE === '1' &&
  process.env.VERCEL_VC_NATIVE !== '1' &&
  process.env.VERCEL_CLI_STORE_REDIRECTED !== '1'
) {
  try {
    const { redirectToStoreIfNewer } = await import('./store-redirect.mjs');
    await redirectToStoreIfNewer();
  } catch {}
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
