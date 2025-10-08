const { execSync, spawn } = require('child_process');
const { join, relative, sep } = require('path');

// The order matters because we must build dependencies first
const allPackages = [
  'routing-utils',
  'frameworks',
  'fs-detectors',
  'build-utils',
  'static-config',
  'client',
  'next',
  'node',
  'go',
  'python',
  'ruby',
  'redwood',
  'remix',
  'static-build',
  'cli',
];

process.chdir(join(__dirname, '..'));

async function main() {
  const script = process.argv[2];
  const all = process.argv[3];
  let modifiedPackages = new Set(allPackages);

  if (!script) {
    console.error('Please provide at least one argument');
    process.exit(2);
  }

  if (all === 'all') {
    console.log(`Running script "${script}" for all packages`);
  } else {
    const branch =
      process.env.GITHUB_HEAD_REF ||
      execSync('git branch --show-current').toString().trim();

    const gitPath = branch === 'main' ? 'HEAD~1' : 'origin/main...HEAD';
    const diff = execSync(`git diff ${gitPath} --name-only`).toString();

    const changed = diff
      .split('\n')
      .filter(item => Boolean(item) && item.startsWith('packages'))
      .map(item => relative('packages', item).split(sep)[0])
      .concat('cli'); // Always run tests for Vercel CLI

    modifiedPackages = new Set(changed);

    console.log(
      `Running "${script}" on branch "${branch}" with the following packages:\n`
    );
  }

  for (const pkgName of allPackages) {
    if (modifiedPackages.has(pkgName)) {
      console.log(` - ${pkgName}`);
    }
  }

  for (const pkgName of allPackages) {
    if (modifiedPackages.has(pkgName)) {
      await runScript(pkgName, script);
    }
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
      console.log(`\n[${pkgName}] Running pnpm ${script}`);
      const child = spawn('pnpm', [script], {
        cwd,
        stdio: 'inherit',
        shell: true,
        env: {
          // Only add this for unit tests, as it's not relevant to others.
          ...(script === 'test-unit'
            ? {
                NODE_OPTIONS: '--max-old-space-size=4096',
              }
            : null),
          ...process.env,
        },
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code === 0) {
          return resolve();
        }
        reject(
          new Error(
            `[${pkgName}] Exited script "${script}" with code ${
              code || signal
            }.`
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
