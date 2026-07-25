#!/usr/bin/env node

import { basename } from 'node:path';

const [, , script] = process.argv;

process.env.VERCEL_VC_NATIVE = '1';

const defaultWarningListeners = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', warning => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0169') {
    return;
  }
  for (const listener of defaultWarningListeners) {
    listener(warning);
  }
});

// In the standalone binary, process.execPath points back to this binary.
// Route internal worker invocations here so script paths are not parsed as CLI args.
if (script && basename(script) === 'get-latest-worker.cjs') {
  process.argv.splice(2, 1);
  await import('./dist/get-latest-worker.cjs');
} else {
  await import('./dist/vc.js');
}
