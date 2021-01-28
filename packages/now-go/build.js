#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  const outDir = join(__dirname, 'dist');

  // Start fresh
  await fs.remove(outDir);

  // Build with `ncc`
  await execa(
    'ncc',
    [
      'build',
      'index.ts',
      '-e',
      '@vercel/build-utils',
      '-e',
      '@now/build-utils',
      '-o',
      outDir,
    ],
    {
      stdio: 'inherit',
    }
  );

  const installDir = join(outDir, 'install');
  await execa(
    'ncc',
    [
      'build',
      'install.ts',
      '-e',
      '@vercel/build-utils',
      '-e',
      '@now/build-utils',
      '-o',
      installDir,
    ],
    {
      stdio: 'inherit',
    }
  );

  // Move compiled ncc file to out dir
  await fs.rename(join(installDir, 'index.js'), join(outDir, 'install.js'));

  // Delete leftover "install" dir
  await fs.remove(installDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
