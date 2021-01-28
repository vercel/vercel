#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  const srcDir = join(__dirname, 'src');
  const outDir = join(__dirname, 'dist');
  const bridgeDir = join(__dirname, '../now-node-bridge');

  // Copy shared dependencies
  await Promise.all([
    fs.copyFile(join(bridgeDir, 'src/bridge.ts'), join(srcDir, 'bridge.ts')),
    fs.copyFile(
      join(bridgeDir, 'src/launcher.ts'),
      join(srcDir, 'launcher.ts')
    ),
  ]);

  // Start fresh
  await fs.remove(outDir);

  // Build TypeScript files
  await execa('tsc', [], {
    stdio: 'inherit',
  });

  // Copy type file for ts test
  await fs.copyFile(
    join(outDir, 'types.d.ts'),
    join(__dirname, 'test/fixtures/15-helpers/ts/types.d.ts')
  );

  // Setup symlink for symlink test
  const symlinkTarget = join(__dirname, 'test/fixtures/11-symlinks/symlink');
  await fs.remove(symlinkTarget);
  await fs.symlink('symlinked-asset', symlinkTarget);

  // Use types.d.ts as the main types export
  await Promise.all(
    (await fs.readdir(outDir))
      .filter(p => p.endsWith('.d.ts') && p !== 'types.d.ts')
      .map(p => fs.remove(join(outDir, p)))
  );
  await fs.rename(join(outDir, 'types.d.ts'), join(outDir, 'index.d.ts'));

  // Bundle helpers.ts with ncc
  await fs.remove(join(outDir, 'helpers.js'));
  const helpersDir = join(outDir, 'helpers');
  await execa(
    'ncc',
    [
      'build',
      join(srcDir, 'helpers.ts'),
      '-e',
      '@vercel/build-utils',
      '-e',
      '@now/build-utils',
      '-o',
      helpersDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(join(helpersDir, 'index.js'), join(outDir, 'helpers.js'));
  await fs.remove(helpersDir);

  // Build source-map-support/register for source maps
  const sourceMapSupportDir = join(outDir, 'source-map-support');
  await execa(
    'ncc',
    [
      'build',
      join(__dirname, '../../node_modules/source-map-support/register'),
      '-e',
      '@vercel/build-utils',
      '-e',
      '@now/build-utils',
      '-o',
      sourceMapSupportDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(
    join(sourceMapSupportDir, 'index.js'),
    join(outDir, 'source-map-support.js')
  );
  await fs.remove(sourceMapSupportDir);

  const mainDir = join(outDir, 'main');
  await execa(
    'ncc',
    [
      'build',
      join(srcDir, 'index.ts'),
      '-e',
      '@vercel/build-utils',
      '-e',
      '@now/build-utils',
      '-e',
      'typescript',
      '-o',
      mainDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(join(mainDir, 'index.js'), join(outDir, 'index.js'));
  await fs.remove(mainDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
