#!/usr/bin/env node
// Run from trusted main after publication/acceptance; the saved bundle is data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const command = (file, args) =>
  execFileSync(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
function notes(directory, { name, version, tarball }) {
  let changelog = '';
  try {
    const path = join(directory, 'changelogs', `${tarball}.md`);
    changelog = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const section = changelog
    .split(/^## /m)
    .slice(1)
    .find(text => text.split(/\r?\n/, 1)[0] === version);
  return section?.slice(version.length).trim() || `Release ${name}@${version}.`;
}

export function finalizeRelease(directory, run = command) {
  assert(directory, 'Usage: finalize-release.mjs <saved-bundle-directory>');
  directory = resolve(directory);
  const {
    sourceSha: sha,
    tags,
    releases,
  } = JSON.parse(readFileSync(join(directory, 'npm/manifest.json'), 'utf8'));
  const gh = (...args) => run('gh', args);
  const api = (path, ...args) =>
    gh('api', `repos/{owner}/{repo}/${path}`, ...args);
  const get = path => JSON.parse(api(path, '--method=GET'));
  // tojson emits one JSON record per line across pages, including string names.
  const pages = (path, fields) =>
    api(
      `${path}?per_page=100`,
      '--method=GET',
      '--paginate',
      `--jq=.[] | ${fields} | tojson`
    )
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  for (const { name, version } of tags) {
    const tag = `${name}@${version}`;
    const ref = `refs/tags/${tag}`;
    let object = get(`git/matching-refs/tags/${encodeURIComponent(tag)}`).find(
      item => item.ref === ref
    )?.object;
    if (object) {
      // Preserve annotated tags too, comparing their peeled commit to H.
      while (object.type === 'tag')
        object = get(`git/tags/${object.sha}`).object;
      assert(
        object.type === 'commit' && object.sha === sha,
        `Tag ${tag} does not point to ${sha}; refusing to move it`
      );
    } else {
      api('git/refs', '-X', 'POST', '-f', `ref=${ref}`, '-f', `sha=${sha}`);
    }
  }
  if (!releases.length) return;
  // Only a successful empty listing means absent; errors must propagate.
  const existingReleases = pages('releases', '{id, tag_name}');
  for (const pkg of releases) {
    const tag = `${pkg.name}@${pkg.version}`;
    const release = existingReleases.find(item => item.tag_name === tag);
    if (!release) {
      gh(
        'release',
        'create',
        tag,
        '--verify-tag',
        `--title=${tag}`,
        `--notes=${notes(directory, pkg)}`,
        '--latest=false'
      );
    }
    if (pkg.name !== 'vercel') continue;
    const existing = new Set(
      release ? pages(`releases/${release.id}/assets`, '.name') : []
    );
    const missing = readdirSync(join(directory, 'native'))
      .filter(name => !existing.has(name))
      .map(name => join(directory, 'native', name));
    if (missing.length) gh('release', 'upload', tag, ...missing);
    // Read immediately before promotion; historical retries must not roll back latest.
    const registry = '--registry=https://registry.npmjs.org';
    const latest = JSON.parse(
      run('npm', ['view', 'vercel', 'dist-tags.latest', '--json', registry])
    );
    if (latest === pkg.version) gh('release', 'edit', tag, '--latest');
  }
}
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  try {
    finalizeRelease(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
