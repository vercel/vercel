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

const cliArgs = process.argv.slice(2);
const hasVersionFlag = cliArgs.includes('--version') || cliArgs.includes('-v');
const hasVerboseFlag = cliArgs.includes('--verbose');
const isVersionCmd = hasVersionFlag && cliArgs.length === 1;
const isVersionVerboseCmd =
  hasVersionFlag && hasVerboseFlag && cliArgs.length === 2;

// Managed CLI store redirect (experimental) — see util/cli-store/README.md.
// Best-effort: any failure falls through to running this install.
// Skipped for verbose version output, which inspects the invoked copy.
if (
  !isVersionVerboseCmd &&
  process.env.VERCEL_CLI_STORE !== '0' &&
  process.env.VERCEL_VC_NATIVE !== '1' &&
  process.env.VERCEL_CLI_STORE_REDIRECTED !== '1'
) {
  try {
    const { redirectToStoreIfNewer } = await import('./store-redirect.mjs');
    await redirectToStoreIfNewer();
  } catch {}
}

// Fast path for --version to avoid loading the entire CLI
if (isVersionCmd) {
  const { version } = await import('./version.mjs');
  const binaryLabel = process.env.VERCEL_VC_NATIVE === '1' ? ' (native)' : '';
  console.error(`Vercel CLI ${version}${binaryLabel}`);
  console.log(version);
  process.exit(0);
}

// `vc -v --verbose`: version + install/store diagnostics, still fast-path
if (isVersionVerboseCmd) {
  const { printVerboseVersion } = await import('./store-redirect.mjs');
  await printVerboseVersion();
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
