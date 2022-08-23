const { execFileSync } = require('child_process');

function exec(cmd, args, opts) {
  // eslint-disable-next-line no-console
  console.log(`${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, opts);
}

module.exports = async ({ github, context }) => {
  const oldVersion = require('../examples/nextjs/package.json').dependencies
    .next;
  const newVersion = exec('npm', ['view', 'next', 'dist-tags.latest'])
    .toString()
    .trim();
  const branch = `next-${newVersion.replaceAll('.', '-')}`;

  if (oldVersion === newVersion) {
    // eslint-disable-next-line no-console
    console.log(
      `Next.js version ${newVersion} did not change, skipping update.`
    );
    return;
  }

  if (
    exec('git', ['ls-remote', '--heads', 'origin', branch]).toString().trim()
  ) {
    // eslint-disable-next-line no-console
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  exec('rm', ['-rf', './examples/nextjs']);
  exec('npx', ['--yes', 'create-next-app@latest', './examples/nextjs']);
  exec('git', ['config', '--global', 'user.email', 'team@zeit.co']);
  exec('git', ['config', '--global', 'user.name', 'Vercel Team Bot']);
  exec('git', ['checkout', 'main']);
  exec('git', ['checkout', '-b', branch]);
  exec('git', ['add', '-A']);
  exec('git', ['commit', '-m', branch]);
  exec('git', ['push', 'origin', branch]);

  const { repo, owner } = context.repo;

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[examples] Upgrade Next.js to version ${newVersion}`,
    body: `This auto-generated PR updates Next.js to version ${newVersion}`,
  });

  await github.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: pr.data.number,
    reviewers: ['ijjk', 'styfle'],
  });
};
