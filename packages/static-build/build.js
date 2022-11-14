const execa = require('execa');
const { remove } = require('fs-extra');

async function main() {
  await remove('dist');

  await execa('tsc', [], { stdio: 'inherit' });

  await execa(
    'ncc',
    ['build', 'src/index.ts', '-e', '@vercel/build-utils', '-o', 'dist'],
    { stdio: 'inherit' }
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
