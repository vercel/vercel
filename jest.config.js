const childProcess = require('child_process');
const path = require('path');

const command = 'git diff HEAD~1 --name-only';
const diff = childProcess.execSync(command).toString();

const changed = diff
  .split('\n')
  .filter(item => Boolean(item) && item.includes('packages/'))
  .map(item => path.relative('packages', item).split('/')[0]);

const matches = [];

if (changed.length > 0) {
  console.log('The following packages have changed:');

  changed.map((item) => {
    matches.push(item);
    console.log(item);

    return null;
  });
} else {
  matches.push('now-node');
  console.log(`No packages changed, defaulting to ${matches[0]}`);
}

const testMatch = Array.from(new Set(matches)).map(
  item => `**/${item}/**/?(*.)+(spec|test).[jt]s?(x)`,
);

module.exports = {
  testEnvironment: 'node',
  testMatch,
  collectCoverageFrom: [
    'packages/(!test)/**/*.{js,jsx}',
    '!**/node_modules/**',
    '!**/test/**',
  ],
};
