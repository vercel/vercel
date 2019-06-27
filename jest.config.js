const { execSync } = require('child_process');
const { relative } = require('path');

const branch = execSync('git branch | grep "*" | cut -d " " -f2')
  .toString()
  .trim();
console.log(`Running tests on branch "${branch}"`);
const gitPath = branch === 'master' ? 'HEAD~1' : 'origin/canary...HEAD';
const diff = execSync(`git diff ${gitPath} --name-only`).toString();

const changed = diff
  .split('\n')
  .filter(item => Boolean(item) && item.includes('packages/'))
  .map(item => relative('packages', item).split('/')[0]);

const matches = Array.from(new Set(changed));

if (matches.length === 0) {
  matches.push('now-node');
  console.log(`No packages changed, defaulting to ${matches[0]}`);
} else {
  console.log('The following packages have changed:');
  console.log(matches.join('\n'));
}

const testMatch = matches.map(
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
