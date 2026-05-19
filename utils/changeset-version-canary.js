const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '.changeset', 'config.json');
const originalConfig = fs.readFileSync(configPath, 'utf8');

function restoreConfig() {
  fs.writeFileSync(configPath, originalConfig);
}

try {
  const config = JSON.parse(originalConfig);
  config.changelog = false;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = spawnSync('changeset', ['version', '--snapshot', 'canary'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  restoreConfig();
}
