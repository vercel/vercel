const { execSync } = require('child_process');
const { relative } = require('path');

const branch = execSync('git branch | grep "*" | cut -d " " -f2').toString();
console.log(`Running tests on branch "${branch}"`);
const base = branch === 'master' ? 'HEAD~1' : 'origin/canary';
const diff = execSync(`git diff ${base} --name-only`).toString();

const changed = diff
  .split('\n')
  .filter(item => Boolean(item) && item.includes('packages/'))
  .map(item => relative('packages', item).split('/')[0]);

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
