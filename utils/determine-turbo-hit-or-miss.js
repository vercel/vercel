const fs = require('fs-extra');
const path = require('path');

async function main() {
  const rootDir = path.join(__dirname, '..');
  const turboRunDir = path.join(rootDir, '.turbo/runs');
  const turboRunFiles = await fs.readdir(turboRunDir);
  let missCount = 0;

  await Promise.all(
    turboRunFiles.forEach(async fileName => {
      const runFile = path.join(turboRunDir, fileName);
      const runData = await fs.readJson(runFile);
      const { tasks = [] } = runData;
      const count = tasks.filter(
        taskData => taskData.cache.status === 'MISS'
      ).length;
      missCount += count;
    })
  );

  console.log(missCount);
}

main().catch(err => {
  console.log('error determining Turbo HIT or MISS', err);
  process.exit(1);
});
