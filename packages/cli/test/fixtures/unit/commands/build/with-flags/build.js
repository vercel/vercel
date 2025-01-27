const fs = require('fs');
const path = require('path');

async function main() {
  const outputDir = path.join(__dirname, '.vercel', 'output');

  await fs.promises.mkdir(outputDir).catch((error) => {
    if (error.code === 'EEXIST') return;
    throw error;
  });

  await fs.promises.copyFile(path.join(__dirname, 'config.json'), path.join(outputDir, 'config.json'));
  await fs.promises.copyFile(path.join(__dirname, 'flags.json'), path.join(outputDir, 'flags.json'));
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
