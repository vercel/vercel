const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./prepare-version-candidate.mjs');
const sourceSha = 'a'.repeat(40);
const candidateSha = 'b'.repeat(40);
const context = { sourceSha, runId: '123456', runAttempt: '2' };

async function workspace(run) {
  const root = await mkdtemp(join(tmpdir(), 'version candidate '));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const entry = [
  '## 1.1.0',
  '',
  '### Minor Changes',
  '',
  '- abc1234: Generated note, not the raw changeset summary.',
  '',
  '## Migration guide',
  '',
  '```md',
  '## 0.0.0',
  '```',
  '',
  '  ~~~~md',
  '## 8.0.0',
  '  ~~~',
  '  ~~~~',
  '',
  '````md',
  '```',
  '## 9.0.0',
  '````',
  '',
  '### Patch Changes',
  '',
  '- Updated dependencies',
  '  - @vercel-internals/fixture@0.0.2',
].join('\n');

async function fixture(root) {
  const changelogPaths = [
    'packages/fixture/CHANGELOG.md',
    'internals/fixture/CHANGELOG.md',
  ];
  for (const [dir, name, version, changelog] of [
    [
      'packages/fixture',
      'fixture',
      '1.1.0',
      `# fixture\n\n${entry}\n\n## 1.0.0\n\nOld release.\n`,
    ],
    [
      'internals/fixture',
      '@vercel-internals/fixture',
      '0.0.2',
      '# internal\n\n## 0.0.2\n\n### Patch Changes\n\n- def5678: Internal fix.\n',
    ],
  ]) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(
      join(root, dir, 'package.json'),
      JSON.stringify({ name, version })
    );
    await writeFile(join(root, dir, 'CHANGELOG.md'), changelog);
  }
  const planPath = join(root, 'plan.json');
  await writeFile(
    planPath,
    JSON.stringify({
      changesets: [{ summary: 'RAW SUMMARY MUST NOT APPEAR' }],
      releases: [
        {
          name: 'fixture',
          oldVersion: '1.0.0',
          type: 'minor',
          newVersion: '1.1.0',
          changesets: ['fixture-note'],
        },
        {
          name: '@vercel-internals/fixture',
          oldVersion: '0.0.1',
          type: 'patch',
          newVersion: '0.0.2',
        },
        {
          name: 'unchanged',
          oldVersion: '1.0.0',
          type: 'none',
          newVersion: '1.0.0',
        },
      ],
    })
  );
  return {
    ...context,
    root,
    planPath,
    bodyPath: join(root, 'body.md'),
    changelogPaths,
  };
}

test('extracts generated version entries without cutting headings or fenced notes', async () => {
  const { extractChangelogEntry } = await load;
  await workspace(async root => {
    const options = await fixture(root);
    const text = await readFile(join(root, options.changelogPaths[0]), 'utf8');
    assert.equal(extractChangelogEntry(text, '1.1.0'), entry);
    assert.equal(
      extractChangelogEntry(text.replace(/\n/g, '\r\n'), '1.1.0'),
      entry
    );
    assert.equal(
      extractChangelogEntry(text, '1.0.0'),
      '## 1.0.0\n\nOld release.'
    );
    assert.throws(
      () => extractChangelogEntry(text, '8.0.0'),
      /Missing generated/
    );
    assert.throws(
      () => extractChangelogEntry('## 1.0.0\n\n```\n', '1.0.0'),
      /Unclosed fence/
    );
    assert.equal(
      extractChangelogEntry(
        '## 2.0.0-rc.1+build.2\n\n- Preview.\n',
        '2.0.0-rc.1+build.2'
      ),
      '## 2.0.0-rc.1+build.2\n\n- Preview.'
    );
  });
});

test('writes generated changelog body and exact committed receipt, with no self-registration', async () => {
  const { TITLE, writeCandidatePreparation } = await load;
  await workspace(async root => {
    const options = await fixture(root);
    await writeCandidatePreparation(options);
    const body = await readFile(options.bodyPath, 'utf8');
    assert.equal(TITLE, 'Version Packages');
    assert.ok(body.includes(TITLE));
    assert.doesNotMatch(body, /experiment|DO NOT MERGE|Update branch/i);
    assert.match(body, /Keep this PR in draft until/);
    assert.match(body, /stays frozen unless a maintainer explicitly reruns/);
    assert.match(body, /\*\*Manual Version Packages\*\* on main/);
    assert.match(body, /\*\*Close and reopen this draft\*\*/);
    assert.match(body, /approve the CI run if GitHub requests approval/);
    assert.match(body, /obtain fresh review approval/);
    assert.match(body, /Do not push, merge main, or rebase this branch/);
    assert.ok(body.includes(sourceSha));
    assert.ok(body.includes(entry));
    assert.ok(body.includes('def5678: Internal fix.'));
    assert.ok(body.includes('version-candidate-<head SHA>'));
    assert.ok(!body.includes('RAW SUMMARY'));
    assert.ok(!body.includes('Old release.'));
    assert.ok(!body.includes('## `unchanged`'));
    const receipt = JSON.parse(
      await readFile(join(root, '.release-candidate.json'), 'utf8')
    );
    assert.deepEqual(receipt, {
      schemaVersion: 1,
      sourceSha,
      preparationRunId: 123456,
      preparationRunAttempt: 2,
    });
    const expectedPlan = {
      releases: [
        {
          name: 'fixture',
          oldVersion: '1.0.0',
          newVersion: '1.1.0',
          type: 'minor',
        },
        {
          name: '@vercel-internals/fixture',
          oldVersion: '0.0.1',
          newVersion: '0.0.2',
          type: 'patch',
        },
        {
          name: 'unchanged',
          oldVersion: '1.0.0',
          newVersion: '1.0.0',
          type: 'none',
        },
      ],
    };
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.release-plan.json'), 'utf8')),
      expectedPlan
    );
    // A rerun changes the committed tree even when all versions remain identical.
    await writeCandidatePreparation({ ...options, runAttempt: '3' });
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.release-plan.json'), 'utf8')),
      expectedPlan
    );
    assert.equal(
      JSON.parse(await readFile(join(root, '.release-candidate.json'), 'utf8'))
        .preparationRunAttempt,
      3
    );
  });
});

test('fails closed for missing generated changelogs or version mismatches', async () => {
  const { writeCandidatePreparation } = await load;
  await workspace(async root => {
    const options = await fixture(root);
    await assert.rejects(
      writeCandidatePreparation({ ...options, changelogPaths: [] }),
      /Missing generated CHANGELOG/
    );
    await writeFile(
      join(root, 'packages/fixture/package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' })
    );
    await assert.rejects(
      writeCandidatePreparation(options),
      /version mismatch/
    );
    await assert.rejects(readFile(join(root, '.release-candidate.json')), {
      code: 'ENOENT',
    });
  });
});

test('no releases leaves an existing receipt and body untouched', async () => {
  const { writeCandidatePreparation } = await load;
  await workspace(async root => {
    const options = await fixture(root);
    await writeFile(options.planPath, JSON.stringify({ releases: [] }));
    await writeFile(options.bodyPath, 'Existing PR body');
    await writeFile(join(root, '.release-candidate.json'), 'Existing receipt');
    await writeFile(join(root, '.release-plan.json'), 'Existing plan');
    await assert.rejects(
      writeCandidatePreparation(options),
      /No package releases/
    );
    assert.equal(await readFile(options.bodyPath, 'utf8'), 'Existing PR body');
    assert.equal(
      await readFile(join(root, '.release-plan.json'), 'utf8'),
      'Existing plan'
    );
    assert.equal(
      await readFile(join(root, '.release-candidate.json'), 'utf8'),
      'Existing receipt'
    );
  });
});

test('writes the exact post-PR artifact schema and name without overwriting receipts', async () => {
  const { writePreparationReceipt } = await load;
  await workspace(async root => {
    const input = { ...context, candidateSha, prNumber: '42' };
    const result = await writePreparationReceipt(join(root, 'artifact'), input);
    assert.equal(result.artifactName, `version-candidate-${candidateSha}`);
    assert.equal(result.path, join(root, 'artifact/receipt.json'));
    assert.deepEqual(JSON.parse(await readFile(result.path, 'utf8')), {
      schemaVersion: 1,
      candidateSha,
      sourceSha,
      prNumber: 42,
      runId: 123456,
      runAttempt: 2,
    });
    await assert.rejects(
      writePreparationReceipt(join(root, 'artifact'), input),
      { code: 'EEXIST' }
    );
  });
});

test('receipt schemas reject missing PRs, invalid SHAs and non-positive or unsafe IDs', async () => {
  const { candidateReceipt, preparationReceipt } = await load;
  for (const value of ['', 'main', 'A'.repeat(40), `${sourceSha}\n`, null]) {
    assert.throws(
      () => candidateReceipt({ ...context, sourceSha: value }),
      /SHA/
    );
    assert.throws(
      () =>
        preparationReceipt({ ...context, candidateSha: value, prNumber: 42 }),
      /SHA/
    );
  }
  for (const value of [
    undefined,
    null,
    true,
    '',
    '01',
    '1e2',
    '2\n',
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    for (const key of ['runId', 'runAttempt', 'prNumber']) {
      assert.throws(
        () =>
          preparationReceipt({
            ...context,
            candidateSha,
            prNumber: 42,
            [key]: value,
          }),
        /positive safe integer/
      );
    }
  }
  assert.throws(
    () =>
      preparationReceipt({ ...context, candidateSha: sourceSha, prNumber: 42 }),
    /differ from source/
  );
});

const workflowPath = join(
  __dirname,
  '..',
  '.github/workflows/version-packages.yml'
);

test('workflow uses GITHUB_TOKEN only for signed PR creation and registers only afterward', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(
    workflow,
    /if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/
  );
  assert.match(workflow, /permissions:\n {2}contents: read\n/);
  assert.match(workflow, /persist-credentials: false/);
  // The PR-creating job checks out dispatch S; only the read-only release build
  // jobs after it pass the candidate ref to the build workflows.
  assert.doesNotMatch(
    workflow.split('\n  # Release build of H')[0],
    /^\s+ref:/m
  );
  assert.match(workflow, /draft: always-true/);
  assert.match(workflow, /title: 'Version Packages'/);
  assert.match(workflow, /commit-message: 'Version Packages'/);
  assert.doesNotMatch(workflow, /experiment|DO NOT MERGE/i);
  assert.match(workflow, /branch: manual-version-packages/);
  assert.match(workflow, /sign-commits: true/);
  assert.match(
    workflow,
    /GIT_CONFIG_KEY_0: core.hooksPath\n\s+GIT_CONFIG_VALUE_0: \/dev\/null/
  );
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(
    workflow,
    /permissions:\n {6}contents: write\n {6}pull-requests: write\n/
  );
  assert.match(workflow, /token: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(workflow, /create-github-app-token|RELEASE_PREPARER/);
  // Secrets appear only in the read-only release build jobs after the PR job.
  assert.doesNotMatch(
    workflow.split('\n  # Release build of H')[0],
    /secrets\.|vars\./
  );
  assert.ok(
    workflow.indexOf('run: pnpm ci:version') <
      workflow.indexOf('uses: peter-evans/create-pull-request')
  );
  assert.ok(
    workflow.indexOf('run: node utils/prepare-version-candidate.mjs') <
      workflow.indexOf('uses: peter-evans/create-pull-request')
  );
  assert.ok(
    workflow.indexOf('node utils/expand-internal-changesets.mjs') <
      workflow.indexOf('pnpm exec changeset status')
  );
  assert.ok(workflow.indexOf('id: pr') < workflow.indexOf('id: receipt'));
  assert.ok(
    workflow.indexOf('id: receipt') <
      workflow.indexOf('uses: actions/upload-artifact')
  );
  assert.match(
    workflow,
    /commit.parents.length !== 1 \|\| commit.parents\[0\].sha !== context.sha/
  );
  assert.match(workflow, /commit.commit.verification\?\.verified !== true/);
  assert.match(
    workflow,
    /if: steps.pr.outputs.pull-request-number != '' && steps.receipt.outputs.candidateSha != ''/
  );
  for (const key of ['candidateSha', 'sourceSha', 'prNumber']) {
    assert.ok(
      workflow.includes(`${key}: \${{ steps.receipt.outputs.${key} }}`)
    );
  }
  const prepare = workflow.split('\n  # Release build of H')[0];
  assert.doesNotMatch(
    prepare,
    /changesets\/action|dispatchManualTests|test\.yml|actions: write|id-token:|ci:publish|npm publish|run:.*build|environment:/
  );
  // The release build after the PR job never publishes or writes code.
  assert.doesNotMatch(
    workflow,
    /changesets\/action|dispatchManualTests|test\.yml|actions: write|contents: write\n(?![ ]{6}pull-requests: write)|ci:publish|npm publish|uv publish|environment: release/
  );
});

test('post-PR workflow writes a receipt only for a verified single child of S', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const script = workflow
    .match(/ {10}script: \|\n([\s\S]*?)(?=\n {6}- name: Upload)/)[1]
    .replace(/^ {12}/gm, '');
  for (const [verified, parents, actionVerified, succeeds] of [
    [true, [{ sha: sourceSha }], 'true', true],
    [false, [{ sha: sourceSha }], 'true', false],
    [true, [{ sha: sourceSha }], 'false', false],
    [true, [{ sha: candidateSha }], 'true', false],
    [true, [{ sha: sourceSha }, { sha: candidateSha }], 'true', false],
  ]) {
    await workspace(async root => {
      const harness = `
        const outputs = {};
        const github = { rest: { repos: { getCommit: async args => {
          require('node:assert/strict').equal(args.ref, process.env.CANDIDATE_SHA);
          return { data: ${JSON.stringify({ commit: { verification: { verified } }, parents })} };
        } } } };
        const context = { repo: { owner: 'fixture', repo: 'fixture' }, sha: ${JSON.stringify(sourceSha)} };
        const core = {
          setOutput: (key, value) => { outputs[key] = value; },
          summary: { addRaw() { return this; }, async write() {} },
        };
        const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
        new AsyncFunction('github', 'context', 'core', 'require', ${JSON.stringify(script)})(github, context, core, require)
          .then(() => process.stdout.write(JSON.stringify(outputs)))
          .catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
      `;
      const run = () =>
        execFileSync(process.execPath, ['-e', harness], {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            RUNNER_TEMP: root,
            CANDIDATE_SHA: candidateSha,
            PR_NUMBER: '42',
            GITHUB_RUN_ID: context.runId,
            GITHUB_RUN_ATTEMPT: context.runAttempt,
            COMMITS_VERIFIED: actionVerified,
          },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      const receiptPath = join(root, 'version-candidate-receipt/receipt.json');
      if (succeeds) {
        assert.deepEqual(JSON.parse(run()), {
          candidateSha,
          sourceSha,
          prNumber: 42,
          artifactName: `version-candidate-${candidateSha}`,
        });
        assert.equal(
          JSON.parse(await readFile(receiptPath, 'utf8')).candidateSha,
          candidateSha
        );
      } else {
        assert.throws(run, /Expected a verified single candidate commit/);
        await assert.rejects(readFile(receiptPath), { code: 'ENOENT' });
      }
    });
  }
});

test('real Changesets status and minimal ci:version freeze the expanded plan and generated notes', async () => {
  // Normal CI uses installed workspace deps; local checks may supply an isolated
  // pnpm installation without installing or versioning this monorepo.
  const cli =
    process.env.CHANGESET_CLI || require.resolve('@changesets/cli/bin.js');
  const workflow = await readFile(workflowPath, 'utf8');
  const statusScript = workflow
    .match(
      /name: Check for package releases[\s\S]*? {8}run: \|\n([\s\S]*?)(?=\n {6}- name:)/
    )[1]
    .replace(/^ {10}/gm, '');
  const { extractChangelogEntry } = await load;
  await workspace(async dir => {
    const root = join(dir, 'repo');
    const temp = join(dir, 'runner-temp');
    for (const path of [
      'packages/public',
      'internals/shared',
      '.changeset',
      'utils',
      'node_modules/@changesets',
      'node_modules/.bin',
    ]) {
      await mkdir(join(root, path), { recursive: true });
    }
    await mkdir(temp);
    await symlink(
      dirname(cli),
      join(root, 'node_modules/@changesets/cli'),
      'dir'
    );
    await symlink(cli, join(root, 'node_modules/.bin/changeset'));
    for (const script of [
      'expand-internal-changesets.mjs',
      'prepare-version-candidate.mjs',
    ]) {
      await copyFile(join(__dirname, script), join(root, 'utils', script));
    }
    await writeFile(join(root, '.gitignore'), 'node_modules/\n');
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - 'internals/*'\n"
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'preparation-fixture',
        private: true,
        packageManager: 'pnpm@10.29.3',
        scripts: {
          // Real Changesets and expansion; deliberately no Python/lock install,
          // build, GitHub credential, signing, or publishing in this fixture.
          'ci:version':
            'node utils/expand-internal-changesets.mjs && node node_modules/@changesets/cli/bin.js version',
        },
      })
    );
    await writeFile(
      join(root, 'packages/public/package.json'),
      JSON.stringify({
        name: 'fixture-public',
        version: '1.0.0',
        devDependencies: { '@vercel-internals/shared': 'workspace:*' },
      })
    );
    await writeFile(
      join(root, 'packages/public/CHANGELOG.md'),
      '# fixture-public\n\n## 1.0.0\n\nHistorical note.\n'
    );
    await writeFile(
      join(root, 'internals/shared/package.json'),
      JSON.stringify({
        name: '@vercel-internals/shared',
        version: '0.1.0',
        private: true,
      })
    );
    await writeFile(
      join(root, '.changeset/config.json'),
      JSON.stringify({
        baseBranch: 'main',
        changelog: '@changesets/cli/changelog',
        commit: false,
        access: 'public',
        privatePackages: { version: true, tag: true },
      })
    );
    await writeFile(
      join(root, '.changeset/shared.md'),
      '---\n"@vercel-internals/shared": patch\n---\n\nFix shared helper.\n\n## Migration notes\n\n```md\n## 99.0.0\n```\n'
    );
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null',
      GIT_CONFIG_KEY_1: 'commit.gpgsign',
      GIT_CONFIG_VALUE_1: 'false',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_EMAIL: 'fixture@example.test',
      RUNNER_TEMP: temp,
      GITHUB_OUTPUT: join(temp, 'output'),
      GITHUB_STEP_SUMMARY: join(temp, 'summary'),
      PLAN_PATH: join(temp, 'changesets.json'),
      BODY_PATH: join(temp, 'body.md'),
      GITHUB_RUN_ID: context.runId,
      GITHUB_RUN_ATTEMPT: context.runAttempt,
    };
    const run = (command, args) =>
      execFileSync(command, args, {
        cwd: root,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    // Commits exist only inside this disposable fixture, never either worktree.
    run('git', ['init', '--initial-branch=main']);
    run('git', ['add', '.']);
    run('git', ['commit', '-m', 'fixture']);
    env.GITHUB_SHA = run('git', ['rev-parse', 'HEAD']).trim();
    run(process.execPath, [
      cli,
      'status',
      '--output',
      '../runner-temp/before.json',
    ]);
    const before = JSON.parse(
      await readFile(join(temp, 'before.json'), 'utf8')
    );
    assert.deepEqual(
      before.releases
        .filter(release => release.type !== 'none')
        .map(release => release.name),
      ['@vercel-internals/shared']
    );
    run('bash', ['-euo', 'pipefail', '-c', statusScript]);
    assert.equal(
      await readFile(env.GITHUB_OUTPUT, 'utf8'),
      'has-releases=true\ncli-version=\n'
    );
    const statusPlan = JSON.parse(await readFile(env.PLAN_PATH, 'utf8'));
    assert.deepEqual(statusPlan.releases.map(release => release.name).sort(), [
      '@vercel-internals/shared',
      'fixture-public',
    ]);
    const expanded = await readFile(join(root, '.changeset/shared.md'), 'utf8');
    run(process.execPath, ['utils/expand-internal-changesets.mjs']);
    assert.equal(
      await readFile(join(root, '.changeset/shared.md'), 'utf8'),
      expanded
    );
    run('pnpm', ['ci:version']);
    run(process.execPath, ['utils/prepare-version-candidate.mjs']);
    const frozen = JSON.parse(
      await readFile(join(root, '.release-plan.json'), 'utf8')
    );
    assert.deepEqual(frozen, {
      releases: statusPlan.releases.map(
        ({ name, oldVersion, newVersion, type }) => ({
          name,
          oldVersion,
          newVersion,
          type,
        })
      ),
    });
    const body = await readFile(env.BODY_PATH, 'utf8');
    for (const [path, version] of [
      ['packages/public', '1.0.1'],
      ['internals/shared', '0.1.1'],
    ]) {
      const pkg = JSON.parse(
        await readFile(join(root, path, 'package.json'), 'utf8')
      );
      assert.equal(pkg.version, version);
      const changelog = await readFile(
        join(root, path, 'CHANGELOG.md'),
        'utf8'
      );
      assert.ok(body.includes(extractChangelogEntry(changelog, version)));
    }
    assert.match(body, /[a-f0-9]{7}: Fix shared helper/);
    assert.ok(body.includes('## Migration notes'));
    assert.ok(body.includes('## 99.0.0'));
    assert.ok(!body.includes('Historical note.'));
    assert.deepEqual(
      JSON.parse(await readFile(join(root, '.release-candidate.json'), 'utf8')),
      {
        schemaVersion: 1,
        sourceSha: env.GITHUB_SHA,
        preparationRunId: 123456,
        preparationRunAttempt: 2,
      }
    );
    await assert.rejects(readFile(join(root, '.changeset/shared.md')), {
      code: 'ENOENT',
    });
    assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), env.GITHUB_SHA);
    const changes = run('git', ['status', '--porcelain']);
    assert.ok(changes.includes('?? .release-plan.json'));
    assert.ok(changes.includes('?? .release-candidate.json'));
  });
});

test('workflow status handles empty and nonempty plans, writing a no-release notice and summary', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const script = workflow
    .match(/node <<'NODE'\n([\s\S]*?)\n {10}NODE/)[1]
    .replace(/^ {10}/gm, '');
  await workspace(async root => {
    for (const releases of [[], [{ type: 'none' }], [{ type: 'patch' }]]) {
      const hasReleases = releases.some(release => release.type !== 'none');
      const output = join(root, 'output');
      const summary = join(root, 'summary');
      await writeFile(
        join(root, 'changesets.json'),
        JSON.stringify({ releases })
      );
      await writeFile(output, '');
      await writeFile(summary, '');
      const stdout = execFileSync(process.execPath, ['-e', script], {
        env: {
          ...process.env,
          RUNNER_TEMP: root,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        encoding: 'utf8',
      });
      const cli = releases.find(
        release => release.name === 'vercel' && release.type !== 'none'
      );
      assert.equal(
        await readFile(output, 'utf8'),
        `has-releases=${hasReleases}\ncli-version=${cli ? cli.newVersion : ''}\n`
      );
      if (hasReleases) {
        assert.equal(await readFile(summary, 'utf8'), '');
        assert.equal(stdout, '');
      } else {
        assert.match(
          await readFile(summary, 'utf8'),
          /No package releases pending; leaving any existing managed PR unchanged/
        );
        assert.match(stdout, /::notice::No package releases pending/);
      }
    }
  });
});
