const execa = require('execa');
const { remove } = require('fs-extra');

async function main() {
  await remove('dist');
  await execa('tsc', [], { stdio: 'inherit' });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
