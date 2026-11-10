#!/usr/bin/env node

import { statSync } from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installNativeEsbuildLoader } from './native-esbuild.js';

const [, , script] = process.argv;
const snapshotRoot = dirname(fileURLToPath(import.meta.url));
const scriptExtensions = new Set(['.js', '.cjs', '.mjs']);

function isEmbeddedScript(path) {
  if (!path || !isAbsolute(path) || !scriptExtensions.has(extname(path))) {
    return false;
  }

  const relativePath = relative(snapshotRoot, path);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return false;
  }

  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

process.env.VERCEL_VC_NATIVE = '1';
// dist/vc.js sets this when it ran a binary it downloaded (`download`) or one
// from its download cache (`cache`). Remove it so child processes don't
// inherit it.
const nativeSource = process.env.__VERCEL_CLI_NATIVE_SOURCE;
delete process.env.__VERCEL_CLI_NATIVE_SOURCE;
// Child processes inherit VERCEL_VC_NATIVE, so telemetry identifies the native
// binary by this in-process marker instead. Read by dist/vc.js and src/index.ts.
globalThis[Symbol.for('vercel.cli.launch')] = nativeSource
  ? { runtime: 'native', source: nativeSource }
  : { runtime: 'native' };
installNativeEsbuildLoader();

const defaultWarningListeners = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', warning => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') {
    return;
  }
  // node:sqlite (pulled in by @vltpkg/graph) is still ExperimentalWarning.
  if (
    warning.name === 'ExperimentalWarning' &&
    warning.message.includes('SQLite')
  ) {
    return;
  }
  for (const listener of defaultWarningListeners) {
    listener(warning);
  }
});

// The SEA bootstrap always starts this entrypoint, even when a packaged process
// launches an embedded script with process.execPath. Restore Node's script
// execution semantics for any JavaScript file in the immutable snapshot.
delete process.env.PKG_EXECPATH;
if (script === '--internal-eject') {
  const target = process.argv[3];
  if (!target || process.argv.length > 4) {
    process.stderr.write('Usage: vercel --internal-eject <directory>\n');
    process.exit(2);
  }
  const { ejectSnapshot } = await import('./native-eject.js');
  const { version, files } = ejectSnapshot(snapshotRoot, target);
  process.stderr.write(
    `Ejected Vercel CLI ${version} (${Object.keys(files).length} files) to ${resolve(target)}\n`
  );
  process.exit(0);
} else if (isEmbeddedScript(script)) {
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else {
  await import('./dist/vc.js');
}
