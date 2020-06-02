const { join } = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

process.chdir(join(__dirname, '..'));

async function main() {
  const res = await fetch(
    'https://api.github.com/repos/vercel/vercel/releases/latest'
  );
  const { tag_name } = await res.json();

  // git log --pretty=format:"- %s [%an]" `git show-ref -s 'now@16.7.3'`...HEAD | grep -v '\- Publish '

  if (!tag_name) {
    throw new Error('Unable to find last GitHub Release tag.');
  }

  const log =
    execSync(`git log --pretty=format:"- %s [%an]" ${tag_name}...HEAD`)
      .toString()
      .trim()
      .split('\n')
      .filter(line => !line.startsWith('- Publish '))
      .join('\n') || 'NO CHANGES DETECTED';

  console.log(`Changes since the last stable release (${tag_name}):`);
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
              return require(`../packages/${pkgName}/package.json`).name;
            } catch {
              // Failed to read package.json (perhaps the pkg was deleted)
            }
          })
          .filter(s => Boolean(s))
      )
    ).join(',') || 'now';

  console.log('To publish a stable release, execute the following:');
  console.log(
    `\nnpx lerna version --message 'Publish Stable' --exact --force-publish=${pkgs}\n`
  );
}

main().catch(console.error);
