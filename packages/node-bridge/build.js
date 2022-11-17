#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  await fs.remove(join(__dirname, 'helpers.js'));
  await fs.remove(join(__dirname, 'web-handler.js'));

  // Build TypeScript files
  await execa('tsc', [], {
    stdio: 'inherit',
  });

  // Bundle `helpers.ts` with ncc
  await bundle(join(__dirname, 'helpers.ts'), 'helpers');

  // Bundle `source-map-support/register` with ncc for source maps
  await bundle(
    join(__dirname, '../../node_modules/source-map-support/register'),
    'source-map-support'
  );

  // Bundle `web-handler.ts` with ncc
  await bundle(join(__dirname, 'web-handler.ts'), 'web-handler');
}

async function bundle(sourceFile, finalName) {
  const outputDir = join(__dirname, finalName);
  await execa(
    'ncc',
    [
      'build',
      sourceFile,
      '-e',
      '@vercel/node-bridge',
      '-e',
      '@vercel/build-utils',
      '-e',
      'typescript',
      '-o',
      outputDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(
    join(outputDir, 'index.js'),
    join(__dirname, `${finalName}.js`)
  );
  await fs.remove(outputDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
