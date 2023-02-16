const { execFileSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');

function exec(cmd, args, opts) {
  // eslint-disable-next-line no-console
  console.log({ input: `${cmd} ${args.join(' ')}` });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

module.exports = async ({ github, context }) => {
  const pkgJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const oldVersion = pkgJson.devDependencies.turbo;
  const newVersion = exec('pnpm', ['view', 'turbo', 'dist-tags.latest']);
  const branch = `turbo-${newVersion.replaceAll('.', '-')}`;

  if (oldVersion === newVersion) {
    // eslint-disable-next-line no-console
    console.log(`Turbo version ${newVersion} did not change, skipping update.`);
    return;
  }

  if (exec('git', ['ls-remote', '--heads', 'origin', branch])) {
    // eslint-disable-next-line no-console
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  pkgJson.devDependencies.turbo = newVersion;
  writeFileSync(
    'package.json',
    JSON.stringify(pkgJson, null, 2) + '\n',
    'utf-8'
  );

  exec('git', ['config', '--global', 'user.email', 'infra+release@vercel.com']);
  exec('git', ['config', '--global', 'user.name', 'vercel-release-bot']);
  exec('git', ['checkout', '-b', branch]);
  exec('pnpm', ['install', '--lockfile-only']);
  exec('git', ['add', '-A']);
  exec('git', ['commit', '-m', branch]);
  exec('git', ['push', 'origin', branch]);

  const { repo, owner } = context.repo;

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[tests] Upgrade Turbo to version ${newVersion}`,
    body: `This auto-generated PR updates Turbo to version ${newVersion}`,
  });

  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pr.data.number,
    labels: ['area: tests', 'semver: none', 'pr: automerge'],
  });
};
