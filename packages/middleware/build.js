#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  // const srcDir = join(__dirname, 'src');
  const outDir = join(__dirname, 'dist');

  // Start fresh
  await fs.remove(outDir);

<<<<<<< HEAD
  await execa(
    'ncc',
    ['build', join(srcDir, 'index.ts'), '-o', outDir, '--external', 'esbuild'],
    { stdio: 'inherit' }
  );
=======
  await execa('tsc', [], {
    stdio: 'inherit',
  });
  // await execa(
  //   'ncc',
  //   ['build', join(srcDir, 'index.ts'), '-o', outDir, '--external', 'esbuild'],
  //   { stdio: 'inherit' }
  // );

  await fs.copyFile(join(__dirname, 'entries.js'), join(outDir, 'entries.js'));
>>>>>>> c71052ce (Move websandbox dependency to middleware plugin.)
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
