const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const test = globalThis.test || require('node:test').test;
const { resolveTestContext } = require('./manual-version-packages');

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
function fixture(eventName = 'pull_request') {
  const repository = { full_name: 'vercel/vercel-internal' };
  const pr = {
    state: 'open',
    title: 'Version Packages',
    user: { login: 'release-preparer[bot]' },
    head: { sha, ref: 'manual-version-packages', repo: repository },
    base: { sha: base, ref: 'main', repo: repository },
  };
  const outputs = {};
  const reads = [];
  const github = {
    rest: {
      repos: {
        getContent: async args => {
          reads.push(args);
          throw Object.assign(new Error('Not found'), { status: 404 });
        },
      },
    },
  };
  const context = {
    repo: { owner: 'vercel', repo: 'vercel-internal' },
    eventName,
    sha: 'c'.repeat(40), // Synthetic merge SHA must never become checkout H.
    payload: { pull_request: pr },
  };
  const core = {
    setOutput: (name, value) => {
      outputs[name] = value;
    },
  };
  return { github, context, core, pr, outputs, reads };
}

test('managed PR captures exact payload SHAs without trusting title or author', async () => {
  const f = fixture();
  f.pr.title = 'Renamed';
  f.pr.user.login = 'someone';
  assert.deepEqual(await resolveTestContext(f), {
    baseSha: base,
    headSha: sha,
    headRef: 'manual-version-packages',
    isManual: 'true',
  });
  assert.equal(f.outputs.isManual, 'true');
  assert.deepEqual(f.reads, []); // Authorization belongs to the candidate guard.
});

test('ordinary PRs may inherit release metadata from main', async () => {
  const f = fixture();
  f.pr.head.ref = 'feature';
  f.github.rest.repos.getContent = async () => {
    throw new Error('ordinary PR metadata must not be read');
  };
  await resolveTestContext(f);
  assert.deepEqual(f.outputs, {
    baseSha: base,
    headSha: sha,
    headRef: 'feature',
    isManual: 'false',
  });
});

for (const [part, patch] of [
  ['head', { repo: { full_name: 'someone/fork' } }],
  ['base', { repo: { full_name: 'someone/fork' } }],
  ['base', { ref: 'other' }],
  [null, { state: 'closed' }],
]) {
  test(`rejects invalid managed PR ${part}: ${JSON.stringify(patch)}`, async () => {
    const f = fixture();
    Object.assign(part ? f.pr[part] : f.pr, patch);
    await assert.rejects(resolveTestContext(f), /Invalid managed PR/);
    assert.deepEqual(f.outputs, {});
  });
}

for (const part of ['base', 'head']) {
  test(`rejects missing or malformed ${part} SHA before emitting outputs`, async () => {
    for (const value of [undefined, 'main', `${sha}\n`]) {
      const f = fixture();
      f.pr[part].sha = value;
      await assert.rejects(resolveTestContext(f), /full commit SHA/);
      assert.deepEqual(f.outputs, {});
    }
  });
}

for (const branch of ['feature', 'manual-version-packages']) {
  test(`target event classifies ${branch} using payload H, not target main SHA`, async () => {
    const f = fixture('pull_request_target');
    f.pr.head.ref = branch;
    await resolveTestContext(f);
    assert.equal(f.outputs.headSha, sha);
    assert.equal(
      f.outputs.isManual,
      String(branch === 'manual-version-packages')
    );
  });
}

test('only PR events with a payload are supported', async () => {
  const f = fixture();
  f.context.eventName = 'push';
  await assert.rejects(resolveTestContext(f), /expected pull_request/);
  f.context.eventName = 'pull_request';
  delete f.context.payload.pull_request;
  await assert.rejects(resolveTestContext(f), /full commit SHA/);
  assert.deepEqual(f.outputs, {});
});

const workflow = name =>
  readFileSync(join(__dirname, '..', '.github/workflows', name), 'utf8');
const version = workflow('version-packages.yml');
const ci = workflow('test.yml');

test('preparation is main-only, GITHUB_TOKEN-created, draft, and has no publishing capabilities', () => {
  assert.match(version, /on:\n {2}workflow_dispatch:/);
  assert.doesNotMatch(version, /^ {2}(push|pull_request|schedule):/m);
  assert.match(
    version,
    /if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/
  );
  assert.match(version, /branch: manual-version-packages/);
  assert.match(version, /base: main/);
  assert.match(version, /^name: Manual Version Packages$/m);
  assert.match(version, /title: 'Version Packages'/);
  assert.match(version, /commit-message: 'Version Packages'/);
  assert.doesNotMatch(version, /experiment|DO NOT MERGE/i);
  assert.doesNotMatch(
    version,
    /createCommitStatus|stamp-version-packages-summary/
  );
  assert.match(version, /draft: always-true/);
  assert.match(
    version,
    /body-path: \$\{\{ runner.temp \}\}\/version-candidate-body.md/
  );
  assert.doesNotMatch(version, /create-github-app-token/);
  assert.match(version, /token: \$\{\{ github.token \}\}/);
  assert.match(version, /sign-commits: true/);
  assert.match(version, /commit.commit.verification\?\.verified !== true/);
  assert.match(version, /run: pnpm ci:version/);
  assert.match(
    version,
    /plan.releases.some\(release => release.type !== 'none'\)/
  );
  assert.match(version, /steps.changesets.outputs.has-releases == 'true'/);
  assert.match(version, /uses: actions\/upload-artifact@/);
  // The PR-creating job has no build or publishing capability; the release
  // build jobs after it are read-only and never publish.
  const prepare = version.split('\n  # Release build of H')[0];
  assert.doesNotMatch(
    prepare,
    /environment:|id-token:|NPM_TOKEN|ci:publish|npm publish|changesets\/action|createWorkflowDispatch/
  );
  assert.doesNotMatch(
    version,
    /NPM_TOKEN|NODE_AUTH_TOKEN|ci:publish|npm publish|uv publish|npm-publish\.sh|changesets\/action|createWorkflowDispatch|environment: release/
  );
  assert.doesNotMatch(version, /branch: changeset-release\/main/);
});

for (const [label, changeset, expected] of [
  ['a package bump', '---\n"fixture-package": patch\n---\n\nFix.\n', true],
  ['only empty changesets', '---\n---\n\nDocs.\n', false],
  ['no changesets', null, false],
]) {
  test(`real Changesets expansion/status on pinned main with ${label}`, () => {
    const changesetCli = resolve(
      process.env.CHANGESET_CLI || require.resolve('@changesets/cli/bin.js')
    );
    const root = mkdtempSync(join(tmpdir(), 'manual-version-test-'));
    const cwd = join(root, 'repo');
    const temp = join(root, 'runner-temp');
    try {
      for (const dir of [
        'packages/fixture',
        'internals',
        '.changeset',
        'utils',
        'node_modules/@changesets',
      ]) {
        mkdirSync(join(cwd, dir), { recursive: true });
      }
      mkdirSync(temp);
      // The copied real expander uses createRequire to resolve CLI + parse.
      symlinkSync(
        dirname(changesetCli),
        join(cwd, 'node_modules/@changesets/cli'),
        'dir'
      );
      copyFileSync(
        join(__dirname, 'expand-internal-changesets.mjs'),
        join(cwd, 'utils/expand-internal-changesets.mjs')
      );
      writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n');
      writeFileSync(
        join(cwd, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          private: true,
          workspaces: ['packages/*'],
        })
      );
      writeFileSync(
        join(cwd, 'packages/fixture/package.json'),
        JSON.stringify({ name: 'fixture-package', version: '1.0.0' })
      );
      writeFileSync(
        join(cwd, '.changeset/config.json'),
        JSON.stringify({
          baseBranch: 'main',
          changelog: false,
          access: 'public',
        })
      );
      if (changeset)
        writeFileSync(join(cwd, '.changeset/change.md'), changeset);
      const git = args =>
        execFileSync('git', args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      git(['init', '--initial-branch=main']);
      git(['add', '.']);
      git([
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'fixture',
      ]);
      const head = git(['rev-parse', 'HEAD']).trim();
      const output = join(temp, 'output');
      const script = version
        .match(
          /name: Check for package releases[\s\S]*? {8}run: \|\n([\s\S]*?)(?=\n {6}- name:)/
        )[1]
        .replace(/^ {10}/gm, '')
        .replace('pnpm exec changeset', 'node "$CHANGESET_CLI"');
      execFileSync('bash', ['-euo', 'pipefail', '-c', script], {
        cwd,
        env: {
          ...process.env,
          GITHUB_SHA: head,
          RUNNER_TEMP: temp,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(temp, 'summary'),
          CHANGESET_CLI: changesetCli,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // The fixture package is not `vercel`, so no CLI version is planned.
      assert.equal(
        readFileSync(output, 'utf8'),
        `has-releases=${expected}\ncli-version=\n`
      );
      assert.equal(git(['symbolic-ref', '--short', 'HEAD']).trim(), 'main');
      assert.equal(git(['rev-parse', 'HEAD']).trim(), head);
      assert.equal(git(['status', '--porcelain']), '');
      assert.equal(
        JSON.parse(
          readFileSync(join(temp, 'changesets.json'), 'utf8')
        ).releases.some(release => release.type !== 'none'),
        expected
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('managed and ordinary PR CI both keep the existing affected-only selection', () => {
  assert.doesNotMatch(ci, /AFFECTED_FLAG/);
  // E2E shards execute an already selected matrix; task planning and direct
  // unit/lint/Python invocations retain the affected flag.
  const commands = ci
    .split('\n')
    .filter(
      line => line.includes('turbo run') && !line.includes('matrix.testScript')
    );
  assert.equal(commands.length, 8);
  for (const command of commands) {
    assert.match(command, /\s--affected(?:\s|$)/, command);
  }
  assert.match(ci, /needs.setup.outputs.isManual != 'true'/);
  assert.doesNotMatch(ci, /ci:publish|npm publish|environment: release/);
  assert.equal(
    (ci.match(/HEAD_REF: \$\{\{ needs.setup.outputs.headRef \}\}/g) || [])
      .length,
    2
  );
});
