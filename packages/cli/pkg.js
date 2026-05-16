#!/usr/bin/env node

const [, , script] = process.argv;

if (script && script.endsWith('dist/get-latest-worker.cjs')) {
  process.argv.splice(2, 1);
  await import('./dist/get-latest-worker.cjs');
} else {
  await import('./dist/vc.js');
}
