/**
 * Sync vercel's optionalDependencies versions for native tarballs
 * to match vercel's own version. Must be exact pin (no range).
 *
 * This mirrors the release model for @vercel/vc-native-*:
 * they are published by release-binary via publish-packages.mjs
 * at the same version as vercel itself.
 *
 * Called from ci:version after `changeset version` so that the tar
 * that ci:publish produces has an exact matching optionalDependency pin.
 */
const fs = require('fs');
const path = require('path');

const CLI_PKG = path.join(__dirname, '..', 'packages', 'cli', 'package.json');
const NATIVE_PREFIX = '@vercel/vc-native-';

const raw = fs.readFileSync(CLI_PKG, 'utf8');
const pkg = JSON.parse(raw);
const version = pkg.version;

if (!version) {
  console.error('No version in packages/cli/package.json');
  process.exit(1);
}

const optionalDependencies = pkg.optionalDependencies;
if (!optionalDependencies || typeof optionalDependencies !== 'object') {
  console.log('No optionalDependencies to sync');
  process.exit(0);
}

let changed = false;
for (const [name, current] of Object.entries(optionalDependencies)) {
  if (!name.startsWith(NATIVE_PREFIX)) continue;
  if (current !== version) {
    console.log(`${name}: ${current} -> ${version}`);
    optionalDependencies[name] = version;
    changed = true;
  }
}

if (!changed) {
  console.log(`packages/cli optionalDependencies already pinned to ${version}`);
  process.exit(0);
}

fs.writeFileSync(CLI_PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log(
  `Synced packages/cli/package.json optionalDependencies to ${version}`
);
