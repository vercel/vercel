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

  const pkg = await fs.readJSON(join(__dirname, 'package.json'));
  const dependencies = Object.keys(pkg.dependencies ?? {});
  const externs = [];
  for (const dep of dependencies) {
    externs.push('--external', dep);
  }

  const mainDir = join(outDir, 'main');
  await execa(
    'ncc',
    ['build', join(srcDir, 'index.ts'), ...externs, '-o', mainDir],
    { stdio: 'inherit' }
  );
  await fs.rename(join(mainDir, 'index.js'), join(outDir, 'index.js'));
  await fs.rename(join(mainDir, 'types.d.ts'), join(outDir, 'index.d.ts'));

  // Delete all *.d.ts except for index.d.ts which is the public interface
  await Promise.all([
    fs.remove(mainDir),
    fs.remove(join(outDir, 'babel.d.ts')),
    fs.remove(join(outDir, 'dev-server.d.mts')),
    fs.remove(join(outDir, 'fork-dev-server.d.ts')),
    fs.remove(join(outDir, 'types.d.ts')),
    fs.remove(join(outDir, 'typescript.d.ts')),
    fs.remove(join(outDir, 'utils.d.ts')),
    fs.remove(join(outDir, 'edge-functions/edge-handler-template.d.ts')),
    fs.remove(join(outDir, 'edge-functions/edge-handler.d.mts')),
    fs.remove(join(outDir, 'edge-functions/edge-wasm-plugin.d.mts')),
    fs.remove(join(outDir, 'edge-functions/edge-node-compat-plugin.d.mts')),
    fs.remove(join(outDir, 'serverless-functions/helpers.d.ts')),
    fs.remove(join(outDir, 'serverless-functions/serverless-handler.d.mts')),
  ]);

  if (process.env.CI) {
    // Copy type file for ts test
    await fs.copyFile(
      join(outDir, 'index.d.ts'),
      join(__dirname, 'test/fixtures/15-helpers/ts/types.d.ts')
    );
  }

  await fs.copyFile(
    join(__dirname, 'src/edge-functions/edge-handler-template.js'),
    join(outDir, 'edge-functions/edge-handler-template.js')
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
