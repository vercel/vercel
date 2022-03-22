#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  const srcDir = join(__dirname, 'src');
  const outDir = join(__dirname, 'dist');

  // Start fresh
  await fs.remove(outDir);

  // Build TypeScript files
  await execa('tsc', [], {
    stdio: 'inherit',
  });

  // Copy type file for ts test
  try {
    await fs.copyFile(
      join(outDir, 'types.d.ts'),
      join(__dirname, 'test/fixtures/15-helpers/ts/types.d.ts')
    );
  } catch (err) {
    // ignore - `test` directory is not uploaded for Vercel deployments
  }

  // Setup symlink for symlink test
  try {
    const symlinkTarget = join(__dirname, 'test/fixtures/11-symlinks/symlink');
    await fs.remove(symlinkTarget);
    await fs.symlink('symlinked-asset', symlinkTarget);
  } catch (err) {
    // ignore - `test` directory is not uploaded for Vercel deployments
  }

  const mainDir = join(outDir, 'main');
  await execa(
    'ncc',
    [
      'build',
      join(srcDir, 'index.ts'),
      '-e',
      '@vercel/node-bridge',
      '-e',
      '@vercel/build-utils',
      '-e',
      'typescript',
      '-o',
      mainDir,
    ],
    { stdio: 'inherit' }
  );
  await fs.rename(join(mainDir, 'index.js'), join(outDir, 'index.js'));
  await Promise.all([
    fs.remove(mainDir),
    fs.remove(join(outDir, 'example-import.js')),
    fs.remove(join(outDir, 'example-import.d.ts')),
  ]);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
