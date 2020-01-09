const { join } = require('path');
const { execSync } = require('child_process');

process.chdir(join(__dirname, '..'));

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

const log =
  execSync(`git log --pretty=format:"- %s [%an]" ${commit}...HEAD`)
    .toString()
    .trim()
    .split('\n')
    .filter(line => !line.startsWith('- Publish Canary '))
    .join('\n') || 'NO CHANGES DETECTED';

console.log(`Changes since the last Stable release (${commit.slice(0, 7)}):`);
console.log(`\n${log}\n`);

const pkgs =
  Array.from(
    new Set(
      execSync(`git diff --name-only ${commit}...HEAD`)
        .toString()
        .trim()
        .split('\n')
        .filter(line => line.startsWith('packages/'))
        .map(line => line.split('/')[1])
        .map(pkgName => require(`./packages/${pkgName}/package.json`).name)
    )
  ).join(',') || 'now';

console.log('To publish a stable release, execute the following:');
console.log(
  `\ngit pull && lerna version --message 'Publish Stable' --exact --force-publish=${pkgs}\n`
);
