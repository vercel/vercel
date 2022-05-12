#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  // Build TypeScript files
  await execa('tsc', [], {
    stdio: 'inherit',
  });

  // Bundle `helpers.ts` with ncc
  await fs.remove(join(__dirname, 'helpers.js'));
  const helpersDir = join(__dirname, 'helpers');
  await execa(
    'ncc',
    [
      'build',
      join(__dirname, 'helpers.ts'),
      '-e',
      '@vercel/node-bridge',
      '-e',
      '@vercel/build-utils',
      '-e',
      'typescript',
      '-o',
      helpersDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(join(helpersDir, 'index.js'), join(__dirname, 'helpers.js'));
  await fs.remove(helpersDir);

  // Bundle `source-map-support/register` with ncc for source maps
  const sourceMapSupportDir = join(__dirname, 'source-map-support');
  await execa(
    'ncc',
    [
      'build',
      join(__dirname, '../../node_modules/source-map-support/register'),
      '-e',
      '@vercel/node-bridge',
      '-e',
      '@vercel/build-utils',
      '-e',
      'typescript',
      '-o',
      sourceMapSupportDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(
    join(sourceMapSupportDir, 'index.js'),
    join(__dirname, 'source-map-support.js')
  );
  await fs.remove(sourceMapSupportDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
