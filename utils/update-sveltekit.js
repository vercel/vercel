const { execFileSync } = require('child_process');
let { create } = require('create-svelte');
const fs = require('fs');

function exec(cmd, args, opts) {
  console.log({ input: `${cmd} ${args.join(' ')}` });
  const output = execFileSync(cmd, args, opts).toString().trim();
  console.log({ output });
  console.log();
  return output;
}

function newVersion(packageName) {
  return exec('npm', ['view', packageName, 'dist-tags.latest']);
}

const PACKAGE_JSON_PATH = '../examples/sveltekit/package.json';
const SVELTEKIT_CONFIG_PATH = '../examples/sveltekit/svelte.config.js';

/**
 * Update the SvelteKit example. We care about three packages: SvelteKit,
 * `adapter-vercel`, and `create-svelte`. If SvelteKit or `adapter-vercel` have changed,
 * we can simply run `create-svelte` to update the example. If `create-svelte` has
 * changed, we need to upgrade it, then run it to update the example.
 */
module.exports = async ({ github, context }) => {
  const { '@sveltejs/kit': oldKit, '@sveltejs/adapter-vercel': oldVercel } =
    require(PACKAGE_JSON_PATH).dependencies;
  const { 'create-svelte': oldCreate } = require('./package.json').dependencies;
  const newKit = newVersion('@sveltejs/kit');
  const newVercel = newVersion('@sveltejs/adapter-vercel');
  const newCreate = newVersion('create-svelte');
  const branch = `sveltekit-${`${newKit}-${newVercel}-${newCreate}`.replaceAll(
    '.',
    '-'
  )}`;

  if (oldKit === newKit && oldVercel === newVercel && oldCreate === newCreate) {
    console.log(`SvelteKit package versions did not change; skipping update.`);
    return;
  }

  if (
    exec('git', ['ls-remote', '--heads', 'origin', branch]).toString().trim()
  ) {
    console.log(`Branch ${branch} already exists, skipping update.`);
    return;
  }

  if (oldCreate !== newCreate) {
    exec('yarn', ['upgrade', 'create-svelte']);
    const module = require('create-svelte');
    create = module.create;
  }

  exec('rm', ['-rf', './examples/sveltekit']);
  await create('./examples/sveltekit', {
    name: 'sveltekit',
    template: 'default',
    types: 'checkjs',
    prettier: true,
    eslint: true,
    playwright: true,
    vitest: true,
  });

  // replace the default adapter-static with adapter-vercel
  // fs paths are root-relative
  const pjResolved = require.resolve(PACKAGE_JSON_PATH);
  const skResolved = require.resolve(SVELTEKIT_CONFIG_PATH);

  const packageJsonContents = JSON.parse(fs.readFileSync(pjResolved, 'utf8'));
  const svelteKitConfigContents = fs.readFileSync(skResolved, 'utf8');

  delete packageJsonContents.devDependencies['@sveltejs/adapter-static'];
  packageJsonContents.devDependencies['@sveltejs/adapter-vercel'] = newVercel;

  fs.writeFileSync(
    pjResolved,
    JSON.stringify(packageJsonContents, null, '\t') + '\n'
  );
  fs.writeFileSync(
    skResolved,
    svelteKitConfigContents.replace('adapter-auto', 'adapter-vercel')
  );

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
    title: `[examples] Upgrade SvelteKit to version ${newKit}`,
    body: `This auto-generated PR updates SvelteKit to version ${newKit}, adapter-vercel to version ${newVercel}, and create-svelte to version ${newCreate}.`,
  });

  await github.rest.pulls.requestReviewers({
    owner,
    repo,
    pull_number: pr.data.number,
    reviewers: ['ijjk', 'styfle'], // who?
  });
};
