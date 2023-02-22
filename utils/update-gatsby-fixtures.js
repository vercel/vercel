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
  exec('git', ['checkout', branch]);

  const fixturePath = path.join(
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
    const packageJSONPath = path.join(fixturePath, fixture);
    const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));

    const oldVersion = packageJSON.dependencies.gatsby;

    const versions = exec('npm', [
      'view',
      `gatsby@'^${oldVersion}'`,
      'version',
    ]); // [ "gatsby@5.1.2 '5.1.2'", "gatsby@5.2.0 '5.2.0'" ]
    const newVersion = versions.split('\n').pop().split(' ')[1]; // takes the version string from the last result of `versions` i.e. '5.2.0'

    if (oldVersion === newVersion) {
      console.log(
        `gatsby version ${newVersion} did not change for fixture ${fixture}, skipping update.`
      );
      continue;
    }

    packageJSON.dependencies.gatsby = newVersion;

    fs.writeFileSync(
      packageJSONPath,
      JSON.stringify(packageJSON, null, 2),
      'utf-8'
    );

    // update lockfiles
    if (fixture.includes('pnpm')) {
      const emptyWorkspaceFilePath = path.join(
        fixturePath,
        'pnpm-workspace.yaml'
      );
      fs.writeFileSync(emptyWorkspaceFilePath, '', 'utf-8'); // required so that its ignored from repo workspace
      exec('pnpm', ['install', '--lockfile-only']);
      fs.rmSync(emptyWorkspaceFilePath);
    } else {
      exec('npm', ['install', '--package-lock-only']);
    }
  }

  exec('git', ['add', '-A']);
  exec('git', ['commit', '-m', branch]);
  exec('git', ['push', 'origin', branch]);

  const { repo, owner } = context.repo;

  const pulls = await github.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: branch,
  });
  if (pulls.length === 0) {
    const pr = await github.rest.pulls.create({
      owner,
      repo,
      head: branch,
      base: 'main',
      title: '[tests] Update Gatsby fixture versions',
      body: 'Automatically generated PR to update Gatsby fixture versions in `@vercel/static-build`',
    });

    await github.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pr.data.number,
      reviewers: [
        'Ethan-Arrowood',
        'styfle',
        'TooTallNate',
        'EndangeredMassa',
        'cb1kenobi',
      ],
    });

    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pr.data.number,
      labels: ['area: tests', 'semver: none', 'pr: automerge'],
    });
  }
};
