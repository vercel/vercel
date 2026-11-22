const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = globalThis.test || require('node:test').test;
const { commentCliTarball } = require('./comment-cli-tarball');

const sha = 'a'.repeat(40);
const origin = 'https://vercel-preview.vercel.sh';
const creator = { id: 35613825, login: 'vercel[bot]', type: 'Bot' };
const pull = {
  number: 17,
  state: 'open',
  title: 'Fix something',
  head: { sha },
  base: { repo: { full_name: 'vercel/vercel-internal' } },
};
const deployment = { id: 123, sha, creator };
const status = { state: 'success', creator, environment_url: origin };
const pkg = {
  packageDir: 'vercel-runtime',
  packageName: 'vercel-runtime',
  title: 'Runtime',
};
const filename = 'vercel_runtime-1.2.3-py3-none-any.whl';

function harness(options = {}) {
  const calls = {
    api: [],
    fetch: [],
    writes: [],
    packages: 0,
    deploymentCalls: 0,
    statusCalls: 0,
  };
  const context = {
    eventName: 'repository_dispatch',
    repo: { owner: 'vercel', repo: 'vercel-internal' },
    payload: {
      client_payload: {
        environment: 'preview',
        git: { sha },
        url: origin,
        ...options.payload,
      },
    },
    ...options.context,
  };
  const github = {
    rest: {
      repos: {
        listPullRequestsAssociatedWithCommit: 'pulls',
        listDeployments: 'deployments',
        listDeploymentStatuses: 'statuses',
      },
      issues: {
        listComments: 'comments',
        createComment: async args =>
          calls.writes.push({ method: 'create', ...args }),
        updateComment: async args =>
          calls.writes.push({ method: 'update', ...args }),
      },
      pulls: {
        get: async args => {
          calls.api.push({ method: 'current', ...args });
          return { data: options.current ?? pull };
        },
      },
    },
    paginate: async (method, args) => {
      calls.api.push({ method, ...args });
      switch (method) {
        case 'pulls':
          return options.pulls ?? [pull];
        case 'deployments':
          calls.deploymentCalls++;
          return typeof options.deployments === 'function'
            ? options.deployments(calls.deploymentCalls)
            : (options.deployments ?? [deployment]);
        case 'statuses':
          calls.statusCalls++;
          return typeof options.statuses === 'function'
            ? options.statuses(calls.statusCalls)
            : (options.statuses ?? [status]);
        case 'comments':
          return options.comments ?? [];
        default:
          return [];
      }
    },
  };
  return {
    calls,
    run: () =>
      commentCliTarball({
        github,
        context,
        core: { info() {} },
        getPackages: () => {
          calls.packages++;
          return options.packages ?? [pkg];
        },
        fetchImpl: async (url, init) => {
          calls.fetch.push({ url, init });
          assert.equal(init.redirect, 'error');
          assert.ok(init.signal instanceof AbortSignal);
          assert.equal(init.headers, undefined);
          if (options.fetchError) throw new Error('network error');
          return options.response ?? new Response(JSON.stringify({ filename }));
        },
        // Keep the deployment-verification loop fast in tests by default: a
        // small deadline still exercises the same bounded-retry code path as
        // production without slowing the suite down. Tests that want to
        // exercise the retry/backoff behavior directly pass their own
        // deploymentTimeoutMs/deploymentPollIntervalMs.
        deploymentTimeoutMs: options.deploymentTimeoutMs ?? 5,
        deploymentPollIntervalMs: options.deploymentPollIntervalMs ?? 1,
      }),
  };
}

test('posts CLI instructions and validated Python wheel links', async () => {
  const { run, calls } = harness();
  await run();
  assert.equal(calls.writes.length, 1);
  const comment = calls.writes[0];
  assert.equal(comment.method, 'create');
  assert.equal(comment.issue_number, 17);
  assert.equal(comment.repo, 'vercel-internal');
  assert.ok(comment.body.includes(`npx ${origin}/tarballs/vercel.tgz --help`));
  assert.ok(
    comment.body.includes(
      `"VERCEL_CLI_VERSION": "vercel@${origin}/tarballs/vercel.tgz"`
    )
  );
  assert.ok(comment.body.includes('### Python Runtime Wheel'));
  assert.ok(
    comment.body.includes(
      `VERCEL_RUNTIME_PYTHON="vercel-runtime @ ${origin}/tarballs/${filename}"`
    )
  );
  assert.deepEqual(
    calls.fetch.map(call => call.url),
    [`${origin}/tarballs/vercel-runtime-wheel.json`]
  );
  assert.equal(calls.api.at(-1).method, 'current');
  assert.ok(
    calls.api
      .filter(call => call.method !== 'current')
      .every(call => call.per_page === 100)
  );
});

for (const body of [
  '## 📦 CLI Tarball Ready\nold instructions',
  '<!-- vercel-cli-tarball -->\nold instructions',
]) {
  test(`updates an existing bot comment: ${body.split('\n')[0]}`, async () => {
    const { run, calls } = harness({
      comments: [
        { id: 42, body, user: { login: 'github-actions[bot]', type: 'Bot' } },
      ],
    });
    await run();
    assert.equal(calls.writes.length, 1);
    assert.equal(calls.writes[0].method, 'update');
    assert.equal(calls.writes[0].comment_id, 42);
  });
}

test('never overwrites a human comment with a copied marker', async () => {
  const { run, calls } = harness({
    comments: [
      {
        id: 42,
        body: '<!-- vercel-cli-tarball -->',
        user: { login: 'person', type: 'User' },
      },
    ],
  });
  await run();
  assert.equal(calls.writes[0].method, 'create');
});

for (const current of [
  { ...pull, state: 'closed' },
  { ...pull, head: { sha: 'b'.repeat(40) } },
  { ...pull, title: 'Version Packages' },
  { ...pull, base: { repo: { full_name: 'vercel/vercel' } } },
  { ...pull, number: -1 },
]) {
  test(`skips non-current associated PR ${JSON.stringify(current)}`, async () => {
    const { run, calls } = harness({ pulls: [current] });
    await run();
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.packages, 0);
  });
}

test('skips previews without any associated PR', async () => {
  const { run, calls } = harness({ pulls: [] });
  await run();
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.fetch.length, 0);
});

test('selects the matching current PR rather than the first associated PR', async () => {
  const { run, calls } = harness({
    pulls: [{ ...pull, number: 3, head: { sha: 'b'.repeat(40) } }, pull],
  });
  await run();
  assert.equal(calls.writes[0].issue_number, 17);
});

for (const current of [
  { ...pull, head: { sha: 'b'.repeat(40) } },
  { ...pull, state: 'closed' },
  { ...pull, number: 99 },
]) {
  test(`rechecks PR before writing: ${JSON.stringify(current)}`, async () => {
    const { run, calls } = harness({ current });
    await run();
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.writes.length, 0);
  });
}

for (const context of [
  { eventName: 'pull_request' },
  { repo: { owner: 'vercel', repo: 'vercel' } },
  { repo: { owner: 'attacker', repo: 'vercel-internal' } },
]) {
  test(`rejects unsupported context ${JSON.stringify(context)}`, async () => {
    const { run, calls } = harness({ context });
    await run();
    assert.equal(calls.api.length, 0);
    assert.equal(calls.writes.length, 0);
  });
}

test('skips production deployments', async () => {
  const { run, calls } = harness({ payload: { environment: 'production' } });
  await run();
  assert.equal(calls.api.length, 0);
});

for (const payload of [
  { git: { sha: `${sha}\n` } },
  { git: { sha: '$(id)' } },
  { git: null },
  { url: `${origin}\nINJECTED=value` },
  { url: 'https://$(id).example.test' },
  { url: 'http://example.test' },
  { url: `${origin}/tarballs` },
]) {
  test(`rejects malformed payload before API or fetch: ${JSON.stringify(payload)}`, async () => {
    const { run, calls } = harness({ payload });
    await assert.rejects(run());
    assert.equal(calls.api.length, 0);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.writes.length, 0);
  });
}

for (const options of [
  { deployments: [] },
  { deployments: [{ ...deployment, sha: 'b'.repeat(40) }] },
  { deployments: [{ ...deployment, creator: { ...creator, id: 999 } }] },
  { deployments: [{ ...deployment, id: '../evil' }] },
  { statuses: [{ ...status, state: 'pending' }] },
  { statuses: [{ ...status, creator: { ...creator, id: 999 } }] },
  {
    statuses: [
      { ...status, environment_url: 'https://unrelated.example.test' },
    ],
  },
  { statuses: [{ ...status, environment_url: `${origin}\n` }] },
]) {
  test(`requires trusted matching deployment and status: ${JSON.stringify(options)}`, async () => {
    const { run, calls } = harness(options);
    await assert.rejects(run(), /not a verified Vercel deployment/);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.packages, 0);
    assert.equal(calls.writes.length, 0);
  });
}

test('retries verifyDeployment while GitHub catches up, then succeeds once the status appears', async () => {
  // Simulate the observed race: the deployment status isn't recorded as
  // "success" on the first couple of reads, then shows up shortly after -
  // this is what happened for the real commit where 1 of 5 dispatch runs
  // failed while the other 4 succeeded within the same ~6 minute window.
  const { run, calls } = harness({
    statuses: callCount =>
      callCount < 3 ? [{ ...status, state: 'pending' }] : [status],
    deploymentTimeoutMs: 500,
    deploymentPollIntervalMs: 1,
  });
  await run();
  assert.equal(calls.writes.length, 1);
  assert.ok(
    calls.statusCalls >= 3,
    `expected verifyDeployment to poll until the status appeared, saw ${calls.statusCalls} calls`
  );
});

test('still fails within the bounded deadline when the deployment status never appears', async () => {
  // A permanently missing/failed deployment must not retry forever: it
  // should still throw the original assertion error, but only after the
  // configured deadline has actually elapsed (proving the wait is bounded,
  // not skipped and not infinite).
  const deploymentTimeoutMs = 30;
  const { run, calls } = harness({
    statuses: () => [{ ...status, state: 'pending' }],
    deploymentTimeoutMs,
    deploymentPollIntervalMs: 5,
  });
  const start = Date.now();
  await assert.rejects(run(), /not a verified Vercel deployment/);
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed >= deploymentTimeoutMs,
    `expected verifyDeployment to wait out the deadline (${deploymentTimeoutMs}ms), took ${elapsed}ms`
  );
  assert.ok(
    elapsed < deploymentTimeoutMs + 2000,
    `expected verifyDeployment to give up promptly after the deadline, took ${elapsed}ms`
  );
  assert.ok(calls.statusCalls > 1, 'expected more than one poll attempt');
  assert.equal(calls.writes.length, 0);
});

for (const filename of [
  'bad\n```\nid\n```',
  '../evil.whl',
  '$(id).whl',
  'valid.whl\n',
  null,
]) {
  test(`rejects unsafe wheel filename ${JSON.stringify(filename)}`, async () => {
    const { run, calls } = harness({
      response: new Response(JSON.stringify({ filename })),
    });
    await assert.rejects(run());
    assert.equal(calls.writes.length, 0);
  });
}

for (const options of [
  { response: new Response('not json') },
  { response: new Response('{}', { status: 500 }) },
  { response: new Response('', { status: 302 }) },
  { fetchError: true },
  { packages: [{ ...pkg, title: '`shell injection`' }] },
  { packages: [{ ...pkg, packageDir: '../other' }] },
]) {
  test(`fails without posting on bad metadata: ${JSON.stringify(options)}`, async () => {
    const { run, calls } = harness(options);
    await assert.rejects(run());
    assert.equal(calls.writes.length, 0);
  });
}

test('still posts CLI instructions when no wheel is available', async () => {
  const { run, calls } = harness({
    response: new Response('', { status: 404 }),
  });
  await run();
  assert.equal(calls.writes.length, 1);
  assert.ok(!calls.writes[0].body.includes('### Python'));
});

function readWorkflow() {
  return readFileSync(
    path.join(__dirname, '../.github/workflows/comment-cli-tarball.yml'),
    'utf8'
  ).replace(/\r\n/g, '\n');
}

test('workflow checks out only the trusted dispatch commit without persisted credentials', () => {
  const workflow = readWorkflow();
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(!workflow.includes('ref: ${{ github.event.client_payload'));
  assert.ok(!workflow.includes('pull_request_target:'));
  assert.ok(!workflow.includes('pnpm install'));
  assert.ok(workflow.includes("require('./utils/comment-cli-tarball')"));
});

test('workflow grants only the permissions needed to comment on PRs', () => {
  const workflow = readWorkflow();
  // One workflow-level block, with no job-level overrides.
  assert.equal(workflow.match(/^ *permissions:/gm).length, 1);
  const block = workflow.match(/^permissions:\n((?: {2}.*\n)+)/m)?.[1];
  assert.ok(block, 'workflow must declare its permissions');
  const granted = Object.fromEntries(
    block
      .split('\n')
      .map(line => line.replace(/#.*/, '').trim())
      .filter(Boolean)
      .map(line => line.split(/:\s*/))
  );
  // Comments on PRs need pull-requests: write; issues: write only covers
  // comments on issues.
  assert.deepEqual(granted, {
    contents: 'read',
    deployments: 'read',
    'pull-requests': 'write',
  });
});
