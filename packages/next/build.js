const execa = require('execa');
const { remove, rename } = require('fs-extra');
const buildEdgeFunctionTemplate = require('./scripts/build-edge-function-template');

async function main() {
  const isDevBuild = process.argv.includes('--dev');

  await remove('dist');
  await execa('tsc', [], { stdio: 'inherit' });
  await buildEdgeFunctionTemplate();

  if (!isDevBuild) {
    await execa(
      'ncc',
      [
        'build',
        'src/index.ts',
        '--minify',
        '-e',
        'esbuild',
        '-e',
        '@vercel/build-utils',
        '-o',
        'dist/main',
      ],
      { stdio: 'inherit' }
    );
    await rename('dist/main/index.js', 'dist/index.js');
    await remove('dist/main');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
