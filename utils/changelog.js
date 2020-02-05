const { join } = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

process.chdir(join(__dirname, '..'));

async function main() {
  const res = await fetch(
    'https://api.github.com/repos/zeit/now/releases/latest'
  );
  const { tag_name } = await res.json();

  // git log --pretty=format:"- %s [%an]" `git show-ref -s 'now@16.7.3'`...HEAD | grep -v '\- Publish '

  if (!tag_name) {
    throw new Error('Unable to find last publish commit');
  }

  const log =
    execSync(`git log --pretty=format:"- %s [%an]" ${tag_name}...HEAD`)
      .toString()
      .trim()
      .split('\n')
      .filter(line => !line.startsWith('- Publish '))
      .join('\n') || 'NO CHANGES DETECTED';

  console.log(`Changes since the last Stable release (${tag_name}):`);
  console.log(`\n${log}\n`);

  const pkgs =
    Array.from(
      new Set(
        execSync(`git diff --name-only ${tag_name}...HEAD`)
          .toString()
          .trim()
          .split('\n')
          .filter(line => line.startsWith('packages/'))
          .map(line => line.split('/')[1])
          .map(pkgName => {
            try {
              const pkg = require(`../packages/${pkgName}/package.json`);
              return pkg.name;
            } catch {
              // Failed to read package.json
            }
          })
      )
    ).join(',') || 'now';

  console.log('To publish a stable release, execute the following:');
  console.log(
    `\ngit pull && npx lerna version --message 'Publish Stable' --exact --force-publish=${pkgs}\n`
  );
}

main().catch(console.error);
