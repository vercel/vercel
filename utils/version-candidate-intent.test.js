const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const workflow = readFileSync(
  join(__dirname, '../.github/workflows/version-candidate-intent.yml'),
  'utf8'
);
const blocks = workflow.split('          script: |\n');
assert.equal(blocks.length, 2, 'Exactly one metadata script');
const source = blocks[1].replace(/^ {12}/gm, '');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const script = new AsyncFunction(
  'require',
  'github',
  'context',
  'core',
  source
);
const H = 'a'.repeat(40);
const S = 'b'.repeat(40);
const B = 'c'.repeat(40);

function fixture() {
  const repository = { id: 1, full_name: 'vercel/vercel-internal' };
  const pr = {
    number: 2,
    state: 'open',
    title: 'Renamed',
    user: { login: 'someone' },
    head: { sha: H, ref: 'manual-version-packages', repo: repository },
    base: { sha: B, ref: 'main', repo: repository },
  };
  const f = {
    marker: true,
    calls: [],
    failures: [],
    outputs: {},
    summary: '',
    context: {
      repo: { owner: 'vercel', repo: 'vercel-internal' },
      serverUrl: 'https://github.com',
      eventName: 'pull_request_target',
      sha: B,
      payload: { repository, pull_request: pr },
    },
    current: structuredClone(pr),
    preparation: {
      id: 3,
      repository,
      head_repository: repository,
      event: 'workflow_dispatch',
      path: '.github/workflows/version-packages.yml',
      head_branch: 'main',
      head_sha: S,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    },
    artifact: { id: 4, name: `version-candidate-${H}`, expired: false },
  };
  f.github = {
    rest: {
      repos: {
        getContent: async args => {
          f.calls.push('content');
          assert.equal(args.ref, H);
          assert.equal(args.path, '.release-candidate.json');
          if (!f.marker)
            throw Object.assign(new Error('Not found'), { status: 404 });
          return {
            data: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(
                JSON.stringify({
                  schemaVersion: 1,
                  sourceSha: S,
                  preparationRunId: 3,
                  preparationRunAttempt: 1,
                })
              ).toString('base64'),
            },
          };
        },
        getCommit: async args => {
          f.calls.push('commit');
          assert.equal(args.ref, H);
          return { data: { sha: H, parents: [{ sha: S }] } };
        },
        compareCommits: async () => ({ data: { status: 'ahead' } }),
      },
      actions: {
        getWorkflowRunAttempt: async () => ({ data: f.preparation }),
        listJobsForWorkflowRunAttempt: async () => ({
          data: {
            jobs: [
              { name: 'version', status: 'completed', conclusion: 'success' },
            ],
          },
        }),
        listWorkflowRunArtifacts: () => assert.fail('Use pagination'),
      },
      pulls: { get: async () => ({ data: f.current }) },
    },
    paginate: async () => [f.artifact],
  };
  f.core = {
    info: () => {},
    setOutput: (key, value) => {
      f.outputs[key] = value;
    },
    setFailed: message => {
      f.failures.push(message);
      f.calls.push('failed');
    },
    summary: {
      addRaw: text => {
        f.summary += text;
        return f.core.summary;
      },
      write: async () => {
        f.calls.push('summary');
      },
    },
  };
  f.run = () =>
    script(
      path => {
        assert.ok(
          [
            './utils/manual-version-packages.js',
            './utils/validate-version-candidate.js',
          ].includes(path)
        );
        return require(path.replace('./utils/', './'));
      },
      f.github,
      f.context,
      f.core
    );
  return f;
}

test('target workflow has only two trusted steps, bounded runtime and read-only permissions', () => {
  assert.match(
    workflow
      .replace(/^#.*\n/gm, '')
      .replace('on: # zizmor: ignore[dangerous-triggers]', 'on:'),
    /^name: Version candidate intent\n\non:\n {2}pull_request_target:\n {4}branches: \[main\]\n {4}types: \[opened, synchronize, reopened, ready_for_review, edited\]\n\npermissions: \{\}/
  );
  assert.deepEqual(
    [...workflow.matchAll(/^ {2}([\w-]+):$/gm)].map(m => m[1]),
    ['pull_request_target', 'intent']
  );
  assert.match(
    workflow,
    /group: version-candidate-intent-\$\{\{ github.event.pull_request.number \}\}\n {2}cancel-in-progress: true/
  );
  assert.match(workflow, /name: Frozen version candidate/);
  assert.match(workflow, /^ {4}timeout-minutes: 10$/m);
  assert.match(workflow, /^ {8}timeout-minutes: 10$/m);
  assert.deepEqual(
    [...workflow.matchAll(/^ {6}([\w-]+): (read|write)$/gm)].map(m => [
      m[1],
      m[2],
    ]),
    [
      ['contents', 'read'],
      ['actions', 'read'],
      ['pull-requests', 'read'],
    ]
  );
  assert.equal((workflow.match(/^ {6}- name:/gm) || []).length, 2);
  assert.deepEqual(
    [...workflow.matchAll(/^ {8}uses: (.+)$/gm)].map(m => m[1]),
    ['actions/checkout@v4', 'actions/github-script@v7']
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github.sha \}\}\n {10}persist-credentials: false/
  );
  assert.equal((workflow.match(/^ +ref:/gm) || []).length, 1);
  assert.doesNotMatch(
    workflow,
    /secrets\.|: write|id-token:|environment:|continue-on-error:|\brun:|\bif:|workflow_dispatch:|workflow_call:/
  );
  assert.doesNotMatch(
    source,
    /\$\{\{|child_process|exec\(|spawn\(|downloadArtifact|createCommitStatus/
  );
});

test('ordinary target PR succeeds without candidate validation', async () => {
  const f = fixture();
  f.context.payload.pull_request.head.ref = 'feature';
  f.github.rest.repos.getContent = async () => {
    throw new Error('ordinary PR metadata must not be read');
  };
  await f.run();
  assert.equal(f.outputs.isManual, 'false');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.failures, []);
});

test('valid frozen candidate succeeds and links authenticated H, S and artifact', async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.outputs.headSha, H);
  assert.deepEqual(f.failures, []);
  const repoUrl = 'https://github.com/vercel/vercel';
  for (const suffix of [
    `/commit/${H}`,
    `/commit/${S}`,
    '/actions/runs/3/artifacts/4',
  ]) {
    assert.ok(f.summary.includes(repoUrl + suffix));
  }
  assert.deepEqual(f.calls, ['content', 'commit', 'summary']);
  assert.doesNotMatch(f.summary, /experiment|DO NOT MERGE/i);
});

for (const failure of [
  'unregistered',
  'bad run',
  'expired',
  'head changed',
  'updated branch',
  'base changed',
]) {
  test(`target workflow propagates ${failure} validation failure`, async () => {
    const f = fixture();
    if (failure === 'unregistered') f.marker = false;
    if (failure === 'bad run') f.preparation.event = 'pull_request';
    if (failure === 'expired') f.artifact.expired = true;
    if (failure === 'head changed') f.current.head.sha = B;
    if (failure === 'updated branch') {
      f.github.rest.repos.getCommit = async () => ({
        data: { sha: H, parents: [{ sha: S }, { sha: B }] },
      });
    }
    if (failure === 'base changed')
      f.context.payload.pull_request.base.ref = 'other';
    await assert.rejects(f.run());
    assert.equal(f.summary, '');
    assert.deepEqual(f.failures, []); // Throw propagates to github-script failure.
  });
}
