const { execSync } = require('child_process');

const commit = execSync('git log --pretty=format:"%s %H"')
  .toString()
  .trim()
  .split('\n')
  .find(line => line.startsWith('Publish '))
  .split(' ')
  .pop();

if (!commit) {
  throw new Error('Unable to find last publish commit');
}

const log = execSync(`git log --pretty=format:"- %s [%an]" ${commit}...HEAD`).toString().trim();

console.log(`Changes since the last publish commit ${commit}:`);
console.log(`\n${log}\n`);
