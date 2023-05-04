/* eslint-disable no-console */

const { dirname, join } = require('path');
const { execFileSync } = require('child_process');
const { glob } = require('glob');
const { pathExists, readJson, writeJson } = require('fs-extra');

function exec(cmd, args, opts) {
  console.log({ input: `${cmd} ${args.join(' ')}` });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

module.exports = async ({ github, context }) => {
  const newVersion = exec('npm', ['view', 'next', 'dist-tags.latest']);
  const branch = `next-${newVersion.replaceAll('.', '-')}`;

  if (
    exec('git', ['ls-remote', '--heads', 'origin', branch]).toString().trim()
  ) {
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  let updatedCount = 0;

  // update `examples/nextjs`
  const oldVersion = require('../examples/nextjs/package.json').dependencies
    .next;
  if (oldVersion !== newVersion) {
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
  const testGlobs = [
    'packages/cli/test/dev/fixtures/*/package.json',
    'packages/cli/test/fixtures/unit/**/package.json',
    'packages/fs-detectors/test/fixtures/**/package.json',
    'packages/next/test/fixtures/*/package.json',
    'packages/next/test/integration/*/package.json',
    'packages/static-build/test/fixtures/*/package.json',
  ];
  for (const pattern of testGlobs) {
    const files = await glob(pattern);
    for (const file of files) {
      const pkgJson = await readJson(file);
      if (pkgJson.ignoreNextjsUpdates) {
        continue;
      }

      const dependencies = [pkgJson.dependencies, pkgJson.devDependencies];
      for (const deps of dependencies) {
        const oldVersion = deps?.next;
        if (oldVersion && oldVersion !== newVersion) {
          updatedCount++;
          deps.next = newVersion;
          await writeJson(file, pkgJson);

          // update lock file
          const cwd = dirname(file);
          if (await pathExists(join(cwd, 'yarn.lock'))) {
            exec('yarn', ['generate-lock-entry'], { cwd });
          } else if (await pathExists(join(cwd, 'pnpm-lock.yaml'))) {
            exec('pnpm', ['install', '--lockfile-only'], { cwd });
          } else if (await pathExists(join(cwd, 'package-lock.json'))) {
            exec('npm', ['install', '--package-lock-only'], { cwd });
          }

          break;
        }
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

  await github.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: pr.data.number,
    reviewers: ['ijjk', 'styfle'],
  });

  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pr.data.number,
    labels: ['area: examples', 'area: tests', 'semver: none', 'pr: automerge'],
  });
};
