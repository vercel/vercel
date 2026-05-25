#!/usr/bin/env node

import { basename } from 'node:path';

const [, , script] = process.argv;

// In the standalone binary, process.execPath points back to this binary.
// Route internal worker invocations here so script paths are not parsed as CLI args.
if (script && basename(script) === 'get-latest-worker.cjs') {
  process.argv.splice(2, 1);
  await import('./dist/get-latest-worker.cjs');
} else {
  await import('./dist/vc.js');
}
