const path = require('path');
const { promises: fs } = require('fs');

async function main() {
  console.log('buildCommand...');

  await fs.appendFile(
    path.join(__dirname, 'public', 'index.txt'),
    `buildCommand\n`
  );

  console.log('Finished building...');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
