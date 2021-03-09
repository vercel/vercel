#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  const outDir = join(__dirname, 'dist');

  // Start fresh
  await fs.remove(outDir);

  // Compile TypeScript
  await execa('tsc', [], { stdio: 'inherit' });

  // Run `ncc`
  const mainDir = join(outDir, 'main');
  await execa('ncc', ['build', 'src/index.ts', '-o', mainDir], {
    stdio: 'inherit',
  });
  // Move compiled ncc file to out dir
  await fs.rename(join(mainDir, 'index.js'), join(outDir, 'index.js'));

  // Delete leftover "main" dir
  await fs.remove(mainDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
