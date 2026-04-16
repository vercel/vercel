const { execFileSync } = require('child_process');
const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');

function exec(cmd, args, opts) {
  // eslint-disable-next-line no-console
  console.log({ input: `${cmd} ${args.join(' ')}` });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

function writeChangeset(branch, newVersion) {
  const changesetFile = join('.changeset', `${branch}.md`);
  const contents = `---\n'vercel': patch\n---\n\nUpdate the bundled Sandbox CLI dependency to ${newVersion}.\n`;

  writeFileSync(changesetFile, contents, 'utf-8');
}

module.exports = async ({ github, context }) => {
  const pkgJsonPath = join('packages', 'cli', 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const oldVersion = pkgJson.dependencies.sandbox;
  const requestedVersion = process.env.SANDBOX_VERSION?.trim();
  const newVersion =
    requestedVersion || exec('pnpm', ['view', 'sandbox', 'dist-tags.latest']);
  const branch = `sandbox-${newVersion.replaceAll('.', '-')}`;

  if (oldVersion === newVersion) {
    // eslint-disable-next-line no-console
    console.log(
      `Sandbox version ${newVersion} already matches packages/cli, skipping update.`
    );
    return;
  }

  if (exec('git', ['ls-remote', '--heads', 'origin', branch])) {
    // eslint-disable-next-line no-console
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  pkgJson.dependencies.sandbox = newVersion;
  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  writeChangeset(branch, newVersion);

  exec('git', ['config', '--global', 'user.email', 'infra+release@vercel.com']);
  exec('git', ['config', '--global', 'user.name', 'vercel-cli-release-bot']);
  exec('git', ['checkout', '-b', branch]);
  exec('pnpm', ['install', '--lockfile-only']);
  exec('git', ['add', '-A']);
  exec('git', ['commit', '-m', branch]);
  exec('git', ['push', 'origin', branch]);

  const { repo, owner } = context.repo;
  const sourceRepository = process.env.SOURCE_REPOSITORY?.trim();
  const sourceRunId = process.env.SOURCE_RUN_ID?.trim();
  const sourceRunUrl =
    sourceRepository && sourceRunId
      ? `https://github.com/${sourceRepository}/actions/runs/${sourceRunId}`
      : null;

  const bodyLines = [
    `This auto-generated PR updates the sandbox dependency from ${oldVersion} to ${newVersion}.`,
  ];

  if (sourceRunUrl) {
    bodyLines.push('', `Triggered by: ${sourceRunUrl}`);
  }

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[cli] Upgrade sandbox to version ${newVersion}`,
    body: bodyLines.join('\n'),
  });

  try {
    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pr.data.number,
      labels: ['area: cli', 'semver: patch'],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(
      `Skipping labels due to permission or configuration issues: ${error.message}`
    );
  }
};
