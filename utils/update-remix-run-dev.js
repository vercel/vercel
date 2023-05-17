const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async ({ github, context }, newVersion) => {
  execSync('git config --global user.email infra+release@vercel.com');
  execSync('git config --global user.name vercel-release-bot');
  execSync('git checkout main');

  const repoRootPath = path.join(__dirname, '..');
  const packagePath = path.join(repoRootPath, 'packages', 'remix');
  const oldVersion = JSON.parse(
    fs.readFileSync(path.join(packagePath, 'package.json'), 'utf-8')
  ).dependencies['@remix-run/dev'];
  if (newVersion === '') {
    newVersion = execSync('npm view @vercel/remix-run-dev dist-tags.latest', {
      encoding: 'utf-8',
    });
  }
  newVersion = newVersion.trim();
  const branch = `vercel-remix-run-dev-${newVersion.replaceAll('.', '-')}`;

  if (oldVersion === newVersion) {
    // eslint-disable-next-line no-console
    console.log(
      `@vercel/remix-run-dev version ${newVersion} did not change, skipping update.`
    );
    return;
  }

  if (
    execSync(`git ls-remote --heads origin ${branch}`, { encoding: 'utf-8' })
      .toString()
      .trim()
  ) {
    // eslint-disable-next-line no-console
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  execSync(
    `pnpm install @remix-run/dev@npm:@vercel/remix-run-dev@${newVersion} --save-exact --lockfile-only`,
    { cwd: packagePath }
  );

  const changesetName = path.join(repoRootPath, `.changeset/${branch}.md`);
  fs.writeFileSync(
    changesetName,
    `---
'@vercel/remix-builder': patch
---

Update \`@remix-run/dev\` fork to v${newVersion}
`
  );

  execSync(`git checkout -b ${branch}`);
  execSync('git add -A');
  execSync(`git commit -m ${branch}`);
  execSync(`git push origin ${branch}`);

  const { repo, owner } = context.repo;

  const pr = await github.rest.pulls.create({
    owner,
    repo,
    head: branch,
    base: 'main',
    title: `[remix] Update \`@remix-run/dev\` to v${newVersion}`,
    body: `This auto-generated PR updates \`@remix-run/dev\` to version ${newVersion}.`,
  });

  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pr.data.number,
    labels: ['area: remix', 'semver: patch', 'pr: automerge'],
  });
};
