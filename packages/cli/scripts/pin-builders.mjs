// Rewrites the `builders` manifest in package.json from `workspace:*`
// markers to the exact versions of those packages in this workspace.
// Runs as `prepack` so the published tarball carries pinned versions,
// and `postpack` restores the original file. Fails the pack (and
// therefore the publish) if any entry cannot be pinned exactly.
import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgJsonPath = join(cliRoot, 'package.json');
const backupPath = join(cliRoot, 'package.json.prepack-backup');

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;

export function getWorkspaceVersions(packagesDir) {
  const versions = new Map();
  for (const entry of readdirSync(packagesDir)) {
    const pkgPath = join(packagesDir, entry, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name) versions.set(pkg.name, pkg.version);
  }
  return versions;
}

export function pinBuilders(pkg, workspaceVersions) {
  const builders = pkg.builders;
  if (!builders || Object.keys(builders).length === 0) {
    throw new Error('package.json has no `builders` manifest to pin');
  }
  const pinned = {};
  for (const [name, marker] of Object.entries(builders)) {
    if (!marker.startsWith('workspace:')) {
      // Already rewritten (e.g. to a tarball URL by utils/pack.ts)
      pinned[name] = marker;
      continue;
    }
    const version = workspaceVersions.get(name);
    if (!version) {
      throw new Error(`Builder "${name}" not found in the workspace`);
    }
    if (!EXACT_VERSION.test(version)) {
      throw new Error(
        `Builder "${name}" has non-exact workspace version "${version}"`
      );
    }
    pinned[name] = version;
  }
  return { ...pkg, builders: pinned };
}

function main() {
  const mode = process.argv[2];
  if (mode === 'pin') {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const pinned = pinBuilders(pkg, getWorkspaceVersions(join(cliRoot, '..')));
    copyFileSync(pkgJsonPath, backupPath);
    writeFileSync(pkgJsonPath, `${JSON.stringify(pinned, null, 2)}\n`);
    console.log(
      `pin-builders: pinned ${Object.keys(pinned.builders).length} builders`
    );
  } else if (mode === 'restore') {
    if (existsSync(backupPath)) {
      renameSync(backupPath, pkgJsonPath);
      console.log('pin-builders: restored package.json');
    }
  } else {
    console.error('Usage: pin-builders.mjs <pin|restore>');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
