/**
 * Publish vercel-runtime on PyPI.
 *
 * Should be called by `ci:publish` via `publish-runtimes.mjs` before
 * `pnpm publish -r` so that if PyPI publication fails the npm publish
 * never happens.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PYPROJECT_PATH = 'python/vercel-runtime/pyproject.toml';

function getVersion(tomlContent) {
  const match = tomlContent.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not parse version from pyproject.toml`);
  }
  return match[1];
}

// Current version on disk
const currentToml = readFileSync(resolve(__dirname, 'pyproject.toml'), 'utf8');
const currentVersion = getVersion(currentToml);

// Previous version from parent commit
let previousVersion = '';
try {
  const previousToml = execFileSync(
    'git',
    ['show', `HEAD^:${PYPROJECT_PATH}`],
    { encoding: 'utf8' }
  );
  previousVersion = getVersion(previousToml);
} catch {
  // First commit or file didn't exist - treat as changed
  previousVersion = '';
}

const force = process.argv.includes('--force');

if (currentVersion === previousVersion && !force) {
  console.log(
    `Python vercel-runtime version unchanged (${currentVersion}), skipping PyPI publication.`
  );
  process.exit(0);
}

console.log(
  `Python vercel-runtime version changed: ${previousVersion || '(none)'} -> ${currentVersion}`
);

function run(cmd, args) {
  const cmdline = `${cmd} ${args.join(' ')}`;
  console.log(`$ ${cmdline}`);
  try {
    execFileSync(cmd, args, { stdio: 'inherit' });
  } catch (err) {
    const code = err.status ?? 1;
    console.error(`command failed with exit code ${code}: ${cmdline}`);
    process.exit(code);
  }
}

// Sanity check: the version we're about to publish must match what
// @vercel/python will request when building projects.
const runtimeVersionTs = readFileSync(
  resolve(__dirname, '..', '..', 'packages', 'python', 'src', 'runtime-version.ts'),
  'utf8'
);
const pinnedMatch = runtimeVersionTs.match(/VERCEL_RUNTIME_VERSION\s*=\s*'([^']+)'/);
if (!pinnedMatch) {
  throw new Error('Could not parse VERCEL_RUNTIME_VERSION from packages/python/src/runtime-version.ts');
}
if (pinnedMatch[1] !== currentVersion) {
  throw new Error(
    `Version mismatch: pyproject.toml has ${currentVersion} but ` +
    `packages/python/src/runtime-version.ts pins ${pinnedMatch[1]}`
  );
}

// Clean stale artifacts so globs match exactly one wheel
const distDir = resolve(__dirname, 'dist');
rmSync(distDir, { recursive: true, force: true });

// Build
run('uv', [
  'build',
  '--package',
  'vercel-runtime',
  '--out-dir',
  'python/vercel-runtime/dist/',
]);

// Verify exactly one wheel was produced
const wheels = readdirSync(distDir).filter(f => f.endsWith('.whl'));
if (wheels.length !== 1) {
  throw new Error(
    `Expected exactly 1 wheel in dist/, found ${wheels.length}: ${wheels.join(', ')}`
  );
}
const wheelPath = join(distDir, wheels[0]);

// Smoke test the wheel
run('uv', [
  'run',
  '--isolated',
  '--no-project',
  '--with',
  wheelPath,
  'python/vercel-runtime/tests/release_smoke_test.py',
]);

// Publish to PyPI (relies on OIDC trusted publishing env set up by the release.yml workflow)
run('uv', ['publish', '--directory', 'python/vercel-runtime/']);

console.log(`Successfully published vercel-runtime ${currentVersion} on PyPI.`);
