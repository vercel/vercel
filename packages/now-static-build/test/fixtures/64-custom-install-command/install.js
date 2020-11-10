const path = require('path');
const { promises: fs } = require('fs');

async function main() {
  console.log('installCommand...');

  await fs.mkdir(path.join(__dirname, 'public'));
  await fs.writeFile(
    path.join(__dirname, 'public', 'index.txt'),
    `installCommand.`
  );

  console.log('Finished installing...');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
