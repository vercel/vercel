/**
 * Publish non-npm runtime packages before pnpm publish.
 *
 * Currently delegates to:
 *   - python/vercel-runtime/publish.mjs  (PyPI)
 *
 * Called by ci:publish so that if any runtime publish fails,
 * npm publish never happens.
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function run(script) {
  console.log(`\n--- Running ${script} ---`);
  execFileSync('node', [resolve(root, script)], { stdio: 'inherit' });
}

run('python/vercel-runtime/publish.mjs');
