#!/usr/bin/env node
/**
 * Updates the `package.json` file to contain the legacy "now" `name` field.
 * The provided argument should be a tag containing the new name.
 */
const fs = require('fs');
const { join } = require('path');
const npa = require('npm-package-arg');

const parsed = npa(process.argv[2]);

// Find the correct directory for this package
const packagesDir = join(__dirname, '..', 'packages');
const packageDir = fs.readdirSync(packagesDir).find(p => {
  if (p.startsWith('.')) return false;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(join(packagesDir, p, 'package.json'), 'utf8')
    );
    return pkg.name === parsed.name;
  } catch (err) {
    console.error(err);
  }
});

if (!packageDir) {
  throw new Error(`Could not find the package directory for "${parsed.name}"`);
}

const pkgJsonPath = join(packagesDir, packageDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const vcName = pkg.name;
const version = pkg.version;

if (pkg.name === '@vercel/client') {
  // The legacy name for `@vercel/client` is `now-client` (global scope)
  pkg.name = 'now-client';
} else {
  pkg.name = pkg.name.replace('vercel', 'now');
  if (pkg.bin && pkg.bin.vercel) {
    // The legacy "bin" for Now CLI is "now"
    pkg.bin = { now: pkg.bin.vercel };
  }
}

const nowName = pkg.name;
console.error(`Updated package name: "${vcName}" -> "${nowName}"`);

fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

// Log the directory name to stdout for the `publish-legacy.sh`
// script to consume for the `npm publish` that happens next.
const IFS = '|';
console.log([packageDir, vcName, nowName, version].join(IFS));
