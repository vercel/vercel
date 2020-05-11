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
const originalName = pkg.name;

if (pkg.name === '@vercel/client') {
  // The legacy name for `@vercel/client` is `now-client` (global scope)
  pkg.name = 'now-client';
} else if (pkg.name === 'vercel') {
  // Set the "bin" for Now CLI to legacy "now", and remove `postinstall` script
  pkg.name = pkg.name.replace('vercel', 'now');
  pkg.bin = { now: pkg.bin.vercel };
} else {
  // Adjust the org scope to legacy `@now` for Runtimes
  pkg.name = pkg.name.replace('@vercel', '@now');
}

console.error(`Updated package name: "${originalName}" -> "${pkg.name}"`);

fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

// Log the directory name to stdout for the `publish-legacy.sh`
// script to consume for the `npm publish` that happens next.
console.log(packageDir);
