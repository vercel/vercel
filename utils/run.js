const { execSync, spawn } = require('child_process');
const { join, relative } = require('path');
const { readdirSync } = require('fs');

if (
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_REPOSITORY !== 'zeit/now'
) {
  console.log('Detected fork, skipping tests');
  return;
}

process.chdir(join(__dirname, '..'));

async function main() {
  const script = process.argv[2];
  const all = process.argv[3];
  let matches = [];

  if (!script) {
    console.error('Please provide at least one argument');
    process.exit(2);
  }

  if (all === 'all') {
    matches = readdirSync(join(__dirname, '..', 'packages'));
    console.log(`Running script "${script}" for all packages`);
  } else {
    const branch = execSync('git branch | grep "*" | cut -d " " -f2')
      .toString()
      .trim();

    const gitPath = branch === 'master' ? 'HEAD~1' : 'origin/master...HEAD';
    const diff = execSync(`git diff ${gitPath} --name-only`).toString();

    const changed = diff
      .split('\n')
      .filter(item => Boolean(item) && item.includes('packages/'))
      .map(item => relative('packages', item).split('/')[0])
      .concat('now-cli'); // Always run tests for Now CLI

    matches = Array.from(new Set(changed));

    if (matches.length === 0) {
      matches.push('now-node');
      console.log('No packages changed. Using default packages.');
    }

    console.log(
      `Running "${script}" on branch "${branch}" with the following packages:`
    );
  }

  // Sort the matches such that `utils` modules are compiled first,
  // because other packages (such as builders) depend on them.
  // We also need to ensure that `now-cli` is built last.

  matches.sort((a, b) => {
    if (a === 'now-routing-utils' && b !== 'now-routing-utils') {
      return -1;
    }
    if (b === 'now-routing-utils' && a !== 'now-routing-utils') {
      return 1;
    }
    if (a === 'now-build-utils' && b !== 'now-build-utils') {
      return -1;
    }
    if (b === 'now-build-utils' && a !== 'now-build-utils') {
      return 1;
    }
    if (a === 'now-cli' && b !== 'now-cli') {
      return 1;
    }
    if (b === 'now-cli' && a !== 'now-cli') {
      return -1;
    }
    return b - a;
  });

  console.log(matches.join('\n') + '\n');

  for (const pkgName of matches) {
    await runScript(pkgName, script);
  }

  if (process.env.NOW_GITHUB_DEPLOYMENT) {
    execSync(
      `rm -rf public && mkdir public && echo '<a href="https://vercel.com/import">https://vercel.com/import</a>' > public/output.html`
    );
  }
}

function runScript(pkgName, script) {
  return new Promise((resolve, reject) => {
    const cwd = join(__dirname, '..', 'packages', pkgName);
    let pkgJson = null;
    try {
      pkgJson = require(join(cwd, 'package.json'));
    } catch (e) {
      pkgJson = null;
    }
    if (pkgJson && pkgJson.scripts && pkgJson.scripts[script]) {
      console.log(`\n[${pkgName}] Running yarn ${script}`);
      const child = spawn('yarn', [script], {
        cwd,
        stdio: 'inherit',
        shell: true,
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code === 0) {
          return resolve();
        }
        reject(
          new Error(
            `[${pkgName}] Exited script "${script}" with code ${code ||
              signal}.`
          )
        );
      });
    } else {
      console.log(
        `[${pkgName}] Skipping since script "${script}" is missing from package.json`
      );
      resolve();
    }
  });
}

main()
  .then(() => {
    console.log('Success!');
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
