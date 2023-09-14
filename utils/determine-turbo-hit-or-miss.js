const fs = require('fs-extra');
const path = require('path');

async function main() {
  const rootDir = path.join(__dirname, '..');
  const turboRunDir = path.join(rootDir, '.turbo/runs');
  const turboRunFiles = await fs.readdir(turboRunDir);

  turboRunFiles.forEach(async fileName => {
    const runFile = path.join(turboRunDir, fileName);
    const runData = await fs.readJson(runFile);
    const tasksReports = runData.tasks || [];

    const missCount = tasksReports.reduce((total, taskData) => {
      console.log(taskData.cache.status);
      if (taskData.cache.status === 'MISS') {
        return total + 1;
      }

      return total;
    }, 0);

    console.log(missCount);
    return process.exit(missCount);
  });
}

main().catch(err => {
  console.log('error determining', err);
  process.exit(1);
});
