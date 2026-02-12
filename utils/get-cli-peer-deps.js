// @ts-check
/**
 * Prints workspace peer dependency names of packages/cli (one per line).
 * Used by CI to build peer deps before running vercel package tests.
 */
const path = require('path');
const fs = require('fs');

const cliPkgPath = path.resolve(__dirname, '../packages/cli/package.json');
const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));
const peerDependencies = cliPkg.peerDependencies || {};

const workspacePeers = Object.entries(peerDependencies)
  .filter(
    ([, spec]) =>
      spec === 'workspace:*' ||
      (typeof spec === 'string' && spec.startsWith('workspace:'))
  )
  .map(([name]) => name);

workspacePeers.forEach(name => console.log(name));
