const fs = require('node:fs');
const path = require('node:path');

const RESULT_DIR = path.join(__dirname, '..', '.results');

module.exports = async function runCronTask() {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RESULT_DIR, 'cron_result.json'),
    JSON.stringify({ executed: true })
  );
};
