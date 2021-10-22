#!/usr/bin/env node
const fs = require('fs-extra');
const execa = require('execa');
const { join } = require('path');

async function main() {
  const outDir = join(__dirname, 'dist');

  // Start fresh
  await fs.remove(outDir);

  // Build TypeScript files
  await execa('tsc', [], {
    stdio: 'inherit',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
