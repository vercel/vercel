/* eslint-disable no-console */

const { dirname, join } = require('path');
const { execFileSync } = require('child_process');
const {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require('fs');

function exec(cmd, args, opts) {
  console.log({ input: `${cmd} ${args.join(' ')}`, cwd: opts?.cwd });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

module.exports = async ({ github, context } = {}) => {
  process.env.COREPACK_ENABLE_STRICT = '0';
  const newVersion = exec('npm', ['view', 'next', 'dist-tags.latest']);
  const branch = `next-${newVersion.replaceAll('.', '-')}`;

  if (
    github &&
    exec('git', ['ls-remote', '--heads', 'origin', branch]).toString().trim()
  ) {
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  let updatedCount = 0;

  // update `examples/nextjs`
  const oldVersion = require('../examples/nextjs/package.json').dependencies
    .next;
  if (github && oldVersion !== newVersion) {
    updatedCount++;
    exec('rm', ['-rf', './examples/nextjs']);
    exec('npx', ['--yes', 'create-next-app@latest', './examples/nextjs']);
    exec('git', [
      'config',
      '--global',
      'user.email',
      'infra+release@vercel.com',
    ]);
    exec('git', ['config', '--global', 'user.name', 'vercel-release-bot']);
    exec('git', ['checkout', 'main']);
    exec('git', ['checkout', '-b', branch]);
    exec('git', ['add', '-A']);
    exec('git', ['commit', '-m', branch]);
    exec('git', ['push', 'origin', branch]);
  }

  // update tests
  const testPaths = [
    'packages/cli/test/dev/fixtures',
    'packages/cli/test/fixtures/unit',
    'packages/fs-detectors/test/fixtures',
    'packages/next/test/fixtures',
    'packages/next/test/integration',
    'packages/static-build/test/fixtures',
  ];

  while (testPaths.length) {
    const dir = testPaths.pop();

    const pkgJsonFile = join(dir, 'package.json');
    if (existsSync(pkgJsonFile)) {
      if (updatePackageJson(pkgJsonFile, newVersion)) {
        updatedCount++;
      }
      continue;
    }

    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory() && name !== 'node_modules') {
        testPaths.push(file);
      }
    }
  }

  if (!updatedCount) {
    console.log(
      `Next.js version ${newVersion} did not change, skipping update.`
    );
    return;
  }

  console.log(
    `Updated ${updatedCount} package${
      updatedCount === 1 ? '' : 's'
    } to Next.js version ${newVersion}`
  );

  const changeset = join(__dirname, '..', '.changeset', `${branch}.md`);
  writeFileSync(changeset, `---\n---\n\n`, 'utf-8');

  if (!github || !context) {
    console.error('Error: missing github or context');
    return;
  }

  const { repo, owner } = context.repo;

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[examples][tests] Upgrade Next.js to version ${newVersion}`,
    body: `This auto-generated PR updates ${updatedCount} package${
      updatedCount === 1 ? '' : 's'
    } to Next.js version ${newVersion}`,
  });

  try {
    await github.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pr.data.number,
      reviewers: ['ijjk', 'styfle', 'huozhi'],
    });
  } catch (err) {
    console.log(
      `Skipping requesting reviews due to permission issues: ${err.message}`
    );
  }

  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pr.data.number,
    labels: ['area: examples', 'area: tests', 'semver: none', 'pr: automerge'],
  });
};

function updatePackageJson(file, newVersion) {
  const pkgJson = JSON.parse(readFileSync(file, 'utf-8'));

  if (pkgJson.ignoreNextjsUpdates) {
    return false;
  }

  const dependencies = [pkgJson.dependencies, pkgJson.devDependencies];

  for (const deps of dependencies) {
    const oldVersion = deps?.next;

    if (oldVersion && oldVersion !== newVersion) {
      deps.next = newVersion;
      writeFileSync(file, `${JSON.stringify(pkgJson, null, 2)}\n`, 'utf-8');

      // update lock file
      const cwd = dirname(file);
      try {
        if (existsSync(join(cwd, 'yarn.lock'))) {
          if (existsSync(join(cwd, '.yarnrc.yml'))) {
            console.warn(
              `Found ${join(
                cwd,
                '.yarnrc.yml'
              )} and this package probably uses Yarn v2/v3 which is not supported`
            );
          } else {
            exec('yarn', ['generate-lock-entry'], { cwd });
          }
        } else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
          exec('pnpm', ['install', '--lockfile-only'], { cwd });
        } else if (existsSync(join(cwd, 'package-lock.json'))) {
          exec('npm', ['install', '--package-lock-only'], { cwd });
        }
      } catch (err) {
        console.error(`Failed to update next: ${cwd}`);
        console.error(err.toString());
      }

      return true;
    }
  }

  return false;
}
