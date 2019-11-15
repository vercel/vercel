const { execSync } = require('child_process');

const commit = execSync('git log --pretty=format:"%s %H"')
  .toString()
  .trim()
  .split('\n')
  .find(line => line.startsWith('Publish Stable '))
  .split(' ')
  .pop();

if (!commit) {
  throw new Error('Unable to find last publish commit');
}

const log = execSync(`git log --pretty=format:"- %s [%an]" ${commit}...HEAD`)
  .toString()
  .trim()
  .split('\n')
  .filter(line => !line.startsWith('- Publish Canary '))
  .join('\n');

console.log(`Changes since the last Stable release (${commit.slice(0, 7)}):`);
console.log(`\n${log}\n`);
