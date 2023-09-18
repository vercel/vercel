const fs = require('fs-extra');
const path = require('path');

async function main(turboRunDirectory, turboRunDirectoryParent) {
  const turboRunDir = path.join(turboRunDirectoryParent, turboRunDirectory);
  const turboRunFiles = await fs.readdir(turboRunDir);

  let missCount = 0;

  await Promise.all(
    turboRunFiles.map(async fileName => {
      const runFile = path.join(turboRunDir, fileName);
      const runData = await fs.readJson(runFile);
      const { attempted, cached } = runData.execution;

      missCount += attempted - cached;
    })
  );

  // log because STDOUT is how GitHub Actions communicates
  console.log(missCount);

  // Return so we can unit test.
  return missCount;
}

const turboRunDirectory = '.turbo/runs';
const turboRunDirectoryParent = path.join(__dirname, '..');

main(turboRunDirectory, turboRunDirectoryParent).catch(err => {
  console.log('error determining Turbo HIT or MISS', err);
  process.exit(1);
});

module.exports = main;
