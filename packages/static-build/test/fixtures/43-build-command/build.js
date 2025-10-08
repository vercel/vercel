const path = require('path');
const { promises: fs } = require('fs');

async function main() {
  console.log('Starting to build...');

  await fs.mkdir(path.join(__dirname, 'public'));
  await fs.writeFile(
    path.join(__dirname, 'public', 'index.txt'),
    `Time of Creation: ${Date.now()}`
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
