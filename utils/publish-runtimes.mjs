/**
 * Publish non-npm runtime packages before pnpm publish.
 *
 * Currently delegates to:
 *   - python/publish.mjs  (PyPI Python packages)
 *
 * Called by ci:publish so that if any runtime publish fails,
 * npm publish never happens.
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const args = process.argv.slice(2);

function run(script, scriptArgs = []) {
  const displayCommand = [script, ...scriptArgs].join(' ');
  console.log(`\n--- Running ${displayCommand} ---`);
  execFileSync('node', [resolve(root, script), ...scriptArgs], {
    stdio: 'inherit',
  });
}

run('python/publish.mjs', args);
