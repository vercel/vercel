#!/usr/bin/env node
// Promote one saved release's vercel package from canary to npm latest, then
// mark its GitHub release latest. Other packages are published to latest
// directly. Safe to rerun; never moves latest backward.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeRelease } from './finalize-release.mjs';

const command = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const registry = '--registry=https://registry.npmjs.org';

function parse(value) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-.]+)?$/.exec(
      value
    );
  assert(match, `Invalid version: ${value}`);
  return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') };
}

// SemVer precedence. Stable versions outrank their prereleases.
export function compareVersions(left, right) {
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  }
  if (!a.pre || !b.pre) return Number(!a.pre) - Number(!b.pre);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn !== yn) return xn ? -1 : 1;
    return (xn ? BigInt(x) > BigInt(y) : x > y) ? 1 : -1;
  }
  return 0;
}

export function promoteRelease(directory, run = command, log = console.log) {
  assert(directory, 'Usage: promote-release.mjs <saved-bundle-directory>');
  directory = resolve(directory);
  const manifest = JSON.parse(
    readFileSync(join(directory, 'npm/manifest.json'), 'utf8')
  );
  const npm = args => run('npm', [...args, registry]);
  const view = (spec, field) => {
    const output = npm(['view', spec, field, '--json']).trim();
    return output ? JSON.parse(output) : null;
  };

  const promoted = manifest.packages.filter(pkg => pkg.name === 'vercel');
  // Only move latest onto the exact tarball this release saved and tested.
  for (const { name, version, integrity } of promoted) {
    assert.equal(
      view(`${name}@${version}`, 'version'),
      version,
      `${name}@${version} is not published`
    );
    assert.equal(
      view(`${name}@${version}`, 'dist.integrity'),
      integrity,
      `${name}@${version} on npm is not the saved release tarball`
    );
  }
  for (const { name, version } of promoted) {
    const spec = `${name}@${version}`;
    if (parse(version).pre) {
      log(`skip: ${spec} (prerelease stays off latest)`);
      continue;
    }
    const latest = view(name, 'dist-tags.latest');
    if (latest && compareVersions(latest, version) >= 0) {
      log(`skip: ${spec} (latest is ${latest})`);
      continue;
    }
    npm(['dist-tag', 'add', spec, 'latest']);
    log(`promoted: ${spec}`);
  }

  // Tags, GitHub releases and assets are idempotent; this marks vercel latest.
  finalizeRelease(directory, run);

  // Notes once latest is this CLI; its bytes were checked above.
  const cli = promoted[0];
  if (
    cli &&
    !parse(cli.version).pre &&
    view('vercel', 'dist-tags.latest') === cli.version
  ) {
    return { sourceSha: manifest.sourceSha, cli };
  }
  return { sourceSha: manifest.sourceSha, cli: null };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    const { sourceSha, cli } = promoteRelease(process.argv[2]);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `source-sha=${sourceSha}\ncli-version=${cli?.version || ''}\ncli-integrity=${cli?.integrity || ''}\n`
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
