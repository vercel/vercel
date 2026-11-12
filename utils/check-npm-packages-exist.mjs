#!/usr/bin/env node
// Fail when a public workspace package does not exist on npm yet.
//
// Why this exists:
//   Release publishes with npm trusted publishing (OIDC), and npm only lets
//   you set that up on a package that already exists. A brand-new public
//   package therefore merges fine and then fails the release with ENEEDAUTH,
//   which blocks every other package from publishing (see #1582).
//   `npm publish --dry-run` does not catch this because it skips auth, so
//   check the registry directly on every PR instead.
//
// Usage:
//   node utils/check-npm-packages-exist.mjs

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Public workspace packages, from the same `pnpm ls` listing that
 * utils/npm-publish.sh publishes from.
 *
 * @param {string} cwd
 * @returns {Promise<string[]>}
 */
export async function listPublicPackages(cwd) {
  const { stdout } = await execFileAsync(
    'pnpm',
    ['ls', '-r', '--depth', '-1', '--json'],
    { cwd, maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(stdout)
    .filter(pkg => pkg.private !== true)
    .map(pkg => pkg.name);
}

/**
 * @param {string} name
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function existsOnNpm(name, fetchImpl = fetch) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2f')}`;
  const res = await fetchImpl(url, { method: 'HEAD' });
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`Unexpected ${res.status} from ${url}`);
  }
  return true;
}

/**
 * @param {string[]} names
 * @param {object} [options]
 * @param {(name: string) => Promise<boolean>} [options.exists]
 * @returns {Promise<string[]>} the names that are not on npm
 */
export async function findMissingPackages(
  names,
  { exists = existsOnNpm } = {}
) {
  const results = await Promise.all(
    names.map(async name => [name, await exists(name)])
  );
  return results.filter(([, found]) => !found).map(([name]) => name);
}

// How to get a new package created (needs a Vercel Notion login).
const NEW_PACKAGE_GUIDE =
  'https://app.notion.com/p/3f9e06b059c4818e9582c545651c42e9';

/**
 * @param {string[]} missing
 */
export function formatMissingError(missing) {
  return [
    `Not on npm yet: ${missing.join(', ')}`,
    '',
    'The release can only publish packages that already exist on npm and have trusted publishing set up. Someone with npm admin rights has to do this once for each new package.',
    '',
    'Before merging:',
    '1. Ask IT to create the package and set up trusted publishing with:',
    `     Packages:     ${missing.join(', ')}`,
    '     Repository:   vercel/vercel-internal',
    '     Workflow:     release.yml',
    '     Environment:  release',
    '     Visibility:   public',
    `   How to ask: ${NEW_PACKAGE_GUIDE}`,
    '2. Re-run this check once IT is done.',
    '',
    'Not ready to publish yet? Add "private": true to the package\'s package.json.',
  ].join('\n');
}

async function main() {
  const names = await listPublicPackages(process.cwd());
  const missing = await findMissingPackages(names);
  if (missing.length > 0) {
    throw new Error(formatMissingError(missing));
  }
  console.log(`All ${names.length} public packages exist on npm.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(err => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
