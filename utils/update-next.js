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

/** directory paths to search when updating to canary tag */
const PATHS_CANARY = [
  'packages/next/test/fixtures',
  'packages/next/test/integration',
];

/** directory paths to search when updating to latest tag */
const PATHS_LATEST = [
  'packages/cli/test/dev/fixtures',
  'packages/cli/test/fixtures/unit',
  'packages/fs-detectors/test/fixtures',
  'packages/static-build/test/fixtures',
];

function exec(cmd, args, opts) {
  console.log({ input: `${cmd} ${args.join(' ')}`, cwd: opts?.cwd });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

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

async function createPullRequest(
  github,
  branch,
  contextRepo,
  newVersion,
  updatedCount
) {
  if (!github || !contextRepo) {
    throw new Error(
      'Cannot create pull request because github or context is not provided.'
    );
  }

  const { owner, repo } = contextRepo;

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[examples][tests] Upgrade Next.js to version ${newVersion}`,
    body: `This auto-generated PR updates ${updatedCount} package${updatedCount === 1 ? '' : 's'} to Next.js version ${newVersion}`,
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
    labels: ['area: examples', 'area: tests', 'semver: none'],
  });
}

function updateExamples(github, newVersion, branch) {
  let updatedCount = 0;

  const oldVersion = require('../examples/nextjs/package.json').dependencies
    .next;
  if (github && oldVersion !== newVersion) {
    updatedCount++;
    const changeset = join(__dirname, '..', '.changeset', `${branch}.md`);
    writeFileSync(changeset, `---\n---\n\n`, 'utf-8');
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

  return updatedCount;
}

function getTestPaths(tag) {
  if (tag === 'canary') {
    return PATHS_CANARY;
  }

  return PATHS_LATEST;
}

module.exports = async ({ github, context, tag } = {}) => {
  process.env.COREPACK_ENABLE_STRICT = '0';

  const newVersion = exec('npm', ['view', 'next', `dist-tags.${tag}`]);
  const branch = `next-${newVersion.replaceAll('.', '-')}`;

  if (
    github &&
    exec('git', ['ls-remote', '--heads', 'origin', branch]).toString().trim()
  ) {
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  let updatedCount = 0;

  if (tag === 'latest') {
    updatedCount += updateExamples(github, newVersion, branch);
  }

  // update tests
  const testPaths = getTestPaths(tag);

  while (testPaths.length) {
    const dir = testPaths.pop();

    const pkgJsonFile = join(dir, 'package.json');
    if (existsSync(pkgJsonFile)) {
      if (updatePackageJson(pkgJsonFile, newVersion)) {
        updatedCount++;
      }
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

  await createPullRequest(
    github,
    context?.repo,
    branch,
    newVersion,
    updatedCount
  );
};
