const path = require('path');
const fs = require('fs');
const { exec } = require('./exec');

const branch = `update/gatsby-fixtures`;

/**
 * invoked by ../.github/workflows/cron-test-and-update-gatsby.yml
 * @param {{ github: ReturnType<import('@actions/github').getOctokit>, context: import('@actions/github').context }} param0 Defined by https://github.com/actions/github-script
 * @returns
 */
module.exports = async ({ github, context }) => {
  exec('git', ['config', '--global', 'user.email', 'infra+release@vercel.com']);
  exec('git', ['config', '--global', 'user.name', 'vercel-release-bot']);
  try {
    // Branch may exist if there's already an existing PR
    exec('git', ['checkout', branch]);
  } catch {
    exec('git', ['checkout', '-b', branch]);
  }

  const fixturesPath = path.join(
    __dirname,
    '..',
    'packages',
    'static-build',
    'test',
    'fixtures'
  );
  const gatsbyFixtures = [
    'gatsby-v2',
    'gatsby-v3',
    'gatsby-v4-pnpm',
    'gatsby-v4',
    'gatsby-v5-pathPrefix',
    'gatsby-v5',
  ];

  for (const fixture of gatsbyFixtures) {
    const fixturePath = path.join(fixturesPath, fixture);
    const packageJSONPath = path.join(fixturePath, 'package.json');
    const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));

    const oldVersion = packageJSON.dependencies.gatsby;

    const major = oldVersion.split('.')[0];

    if (fixture.includes('pnpm')) {
      exec(
        'pnpm',
        [
          '-w',
          'install',
          `gatsby@^${major}`,
          '--save-exact',
          '--lockfile-only',
        ],
        { cwd: fixturePath }
      );
    } else {
      exec(
        'npm',
        ['install', `gatsby@^${major}`, '--save-exact', '--package-lock-only'],
        { cwd: fixturePath }
      );
    }
  }

  // exec throws error on non-zero exit code
  // git diff --quiet returns exit code 1 if changes detected
  try {
    exec('git', ['diff', '--quiet']);
  } catch {
    exec('git', ['add', '-A']);
    exec('git', ['commit', '-m', branch]);
    exec('git', ['push', 'origin', branch]);

    const { repo, owner } = context.repo;

    const pulls = await github.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      head: `vercel:${branch}`,
    });

    if (pulls.data.length === 0) {
      const pr = await github.rest.pulls.create({
        owner,
        repo,
        head: branch,
        base: 'main',
        title: '[tests] Update Gatsby fixture versions',
        body: 'Automatically generated PR to update Gatsby fixture versions in `@vercel/static-build`',
      });

      await github.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.data.number,
        labels: ['area: tests', 'semver: none', 'pr: automerge'],
      });
    }
  }
};
