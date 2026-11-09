const assert = require('node:assert/strict');
const test = globalThis.test || require('node:test').test;
const { validateVersionCandidate } = require('./validate-version-candidate');

const H = 'a'.repeat(40);
const S = 'b'.repeat(40);
const B = 'c'.repeat(40);
const repo = { owner: 'vercel', repo: 'vercel-internal' };
function fixture(eventName = 'pull_request') {
  const repository = { id: 1, full_name: 'vercel/vercel-internal' };
  const pr = {
    number: 2,
    state: 'open',
    title: 'Renamed by a human',
    user: { login: 'release-preparer[bot]' },
    head: { sha: H, ref: 'manual-version-packages', repo: repository },
    base: { sha: B, ref: 'main', repo: repository },
  };
  const f = {
    pr,
    context: {
      repo,
      eventName,
      sha: 'd'.repeat(40), // Never use the synthetic merge SHA.
      payload: { repository, pull_request: pr },
    },
    registration: {
      schemaVersion: 1,
      sourceSha: S,
      preparationRunId: 3,
      preparationRunAttempt: 2,
    },
    commit: { sha: H, parents: [{ sha: S }] },
    comparison: { status: 'ahead' },
    run: {
      id: 3,
      repository,
      head_repository: repository,
      event: 'workflow_dispatch',
      path: '.github/workflows/version-packages.yml',
      head_branch: 'main',
      head_sha: S,
      run_attempt: 2,
      // The release build jobs keep the run going long after `version`.
      status: 'in_progress',
      conclusion: null,
    },
    job: { name: 'version', status: 'completed', conclusion: 'success' },
    artifacts: [{ id: 4, name: `version-candidate-${H}`, expired: false }],
    current: structuredClone(pr),
    calls: [],
    sleeps: [],
  };
  const api = (method, data) => async args => {
    f.calls.push([method, args]);
    return { data: data() };
  };
  f.github = {
    rest: {
      repos: {
        getContent: api('content', () => ({
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(JSON.stringify(f.registration)).toString(
            'base64'
          ),
        })),
        getCommit: api('commit', () => f.commit),
        compareCommits: api('compare', () => f.comparison),
      },
      actions: {
        getWorkflowRunAttempt: api('run', () => f.run),
        listJobsForWorkflowRunAttempt: api('jobs', () => ({
          jobs: [
            { name: 'build-binaries / darwin-arm64', status: 'queued' },
            f.job,
          ],
        })),
        listWorkflowRunArtifacts: () => assert.fail('Use pagination'),
      },
      pulls: { get: api('pr', () => f.current) },
    },
    paginate: async (method, args) => {
      assert.equal(method, f.github.rest.actions.listWorkflowRunArtifacts);
      f.calls.push(['artifacts', args]);
      return f.artifacts;
    },
  };
  f.sleep = async ms => f.sleeps.push(ms);
  return f;
}

for (const [eventName, status] of [
  'pull_request',
  'pull_request_target',
].flatMap(eventName =>
  ['ahead', 'identical'].map(status => [eventName, status])
)) {
  test(`${eventName} accepts frozen H when main is ${status}, independent of title/author`, async () => {
    const f = fixture(eventName);
    f.comparison.status = status;
    assert.deepEqual(await validateVersionCandidate(f), {
      artifactId: 4,
      runId: 3,
      candidateSha: H,
      sourceSha: S,
    });
    assert.deepEqual(f.calls, [
      ['content', { ...repo, path: '.release-candidate.json', ref: H }],
      ['commit', { ...repo, ref: H }],
      ['compare', { ...repo, base: S, head: B }],
      ['run', { ...repo, run_id: 3, attempt_number: 2 }],
      ['jobs', { ...repo, run_id: 3, attempt_number: 2, per_page: 100 }],
      ['artifacts', { ...repo, run_id: 3, per_page: 100 }],
      ['pr', { ...repo, pull_number: 2 }],
    ]);
    assert.deepEqual(f.sleeps, []);
  });
}

for (const [name, patch] of Object.entries({
  event: { event: 'pull_request' },
  ref: { head_branch: 'manual-version-packages' },
  repository: { repository: { id: 9 } },
  'head repository': { head_repository: { id: 9 } },
  path: { path: '.github/workflows/test.yml' },
  'path ref suffix': { path: '.github/workflows/version-packages.yml@main' },
  head: { head_sha: H },
  attempt: { run_attempt: 3 },
  'string attempt': { run_attempt: '2' },
  id: { id: 7 },
})) {
  test(`rejects unauthenticated preparation run ${name}`, async () => {
    const f = fixture();
    Object.assign(f.run, patch);
    await assert.rejects(validateVersionCandidate(f), /trusted main workflow/);
    assert.ok(!f.calls.some(([method]) => method === 'artifacts'));
    assert.deepEqual(f.sleeps, []);
  });
}

for (const [path, value, error] of [
  ['context.eventName', 'workflow_dispatch', /Expected pull_request/],
  ['context.eventName', 'toString', /Expected pull_request/],
  ['context.payload.repository.id', '1', /repository ID/],
  ['pr.number', 0, /PR number/],
  ['pr.head.ref', 'feature', /managed PR/],
  ['pr.head.repo', { id: 9 }, /managed PR/],
  ['pr.base.ref', 'other', /managed PR/],
  ['pr.state', 'closed', /managed PR/],
  ['pr.head.sha', 'abc', /full candidate/],
  ['pr.head.sha', `${H}\n`, /full candidate/],
  ['registration', null, /schema/],
  ['registration', [], /schema/],
  ['registration', { __proto__: { schemaVersion: 1 } }, /schema/],
  ['registration.schemaVersion', 2, /schema/],
  ['registration.sourceSha', 'main', /schema/],
  ['registration.preparationRunId', '3', /schema/],
  ['registration.preparationRunId', 2 ** 53, /schema/],
  ['registration.preparationRunAttempt', 0, /schema/],
  ['commit.parents', [{ sha: S }, { sha: B }], /one parent/],
  ['commit.parents', [{ sha: B }], /one parent/],
  ['commit.sha', S, /one parent/],
  ['comparison.status', 'behind', /ancestor/],
  ['comparison.status', 'diverged', /ancestor/],
  ['artifacts.0.expired', true, /expired/],
  ['artifacts.0.id', '4', /artifact/],
  ['artifacts.0.workflow_run', { id: 3, head_sha: H }, /metadata/],
  ['artifacts.0.workflow_run', { id: 5, head_sha: S }, /metadata/],
]) {
  test(`rejects ${path}=${JSON.stringify(value)} with regeneration guidance`, async () => {
    const f = fixture();
    const keys = path.split('.');
    const key = keys.pop();
    keys.reduce((target, part) => target[part], f)[key] = value;
    await assert.rejects(validateVersionCandidate(f), err => {
      assert.match(err.message, error);
      assert.match(
        err.message,
        /Rerun version-packages.yml on main; do not update or rebase/
      );
      return true;
    });
  });
}

for (const conclusion of [
  'failure',
  'cancelled',
  'timed_out',
  'skipped',
  null,
]) {
  test(`completed ${conclusion} version job fails immediately`, async () => {
    const f = fixture();
    f.job.conclusion = conclusion;
    await assert.rejects(validateVersionCandidate(f), /did not succeed/);
    assert.deepEqual(f.sleeps, []);
  });
}

for (const name of [
  'missing artifact',
  'updated H has no exact artifact',
  'pending version job',
  'version job not listed yet',
]) {
  test(`${name} times out after bounded, injected sleeps`, async () => {
    const f = fixture();
    if (name === 'missing artifact') f.artifacts = [];
    if (name === 'updated H has no exact artifact')
      f.artifacts[0].name = `version-candidate-${B}`;
    if (name === 'pending version job') f.job.status = 'in_progress';
    if (name === 'version job not listed yet') f.job.name = 'other';
    await assert.rejects(validateVersionCandidate(f), /Timed out/);
    assert.deepEqual(f.sleeps, Array(18).fill(10_000));
    assert.equal(f.calls.filter(([method]) => method === 'run').length, 19);
    assert.ok(!f.calls.some(([method]) => method === 'pr'));
  });
}

test('waits through run completion and upload visibility races, then rechecks PR', async () => {
  const f = fixture();
  const artifacts = f.artifacts;
  f.job.status = 'in_progress';
  f.artifacts = [];
  f.sleep = async ms => {
    f.sleeps.push(ms);
    f.job.status = 'completed';
    if (f.sleeps.length === 2) f.artifacts = artifacts;
  };
  artifacts[0].workflow_run = { id: 3, head_sha: S };
  assert.equal((await validateVersionCandidate(f)).artifactId, 4);
  assert.deepEqual(f.sleeps, [10_000, 10_000]);
  assert.equal(f.calls.at(-1)[0], 'pr');
});

test('reauthenticates run attempt after waiting', async () => {
  const f = fixture();
  f.job.status = 'queued';
  f.sleep = async () => {
    f.run.run_attempt++;
  };
  await assert.rejects(validateVersionCandidate(f), /trusted main workflow/);
});

for (const [field, value] of [
  ['head', { sha: B }],
  ['base', { ref: 'other' }],
  ['state', 'closed'],
  ['number', 99],
]) {
  test(`rejects PR ${field} changed during the wait`, async () => {
    const f = fixture();
    f.job.status = 'in_progress';
    f.sleep = async () => {
      f.job.status = 'completed';
      if (typeof value === 'object') Object.assign(f.current[field], value);
      else f.current[field] = value;
    };
    await assert.rejects(validateVersionCandidate(f), /changed while waiting/);
  });
}

test('a failed release build or a rerun of it does not affect the candidate', async () => {
  const f = fixture();
  // Re-run failed jobs starts attempt 3; attempt 2's `version` job still counts.
  Object.assign(f.run, { status: 'completed', conclusion: 'failure' });
  assert.equal((await validateVersionCandidate(f)).artifactId, 4);
  assert.deepEqual(f.sleeps, []);
});

test('rejects ambiguous version jobs', async () => {
  const f = fixture();
  const job = f.job;
  f.github.rest.actions.listJobsForWorkflowRunAttempt = async () => ({
    data: { jobs: [job, { ...job }] },
  });
  await assert.rejects(validateVersionCandidate(f), /Ambiguous preparation/);
});

test('rejects duplicate exact artifacts across the paginated result', async () => {
  const f = fixture();
  f.artifacts.push({ ...f.artifacts[0], id: 5 });
  await assert.rejects(validateVersionCandidate(f), /Ambiguous/);
});

test('JSON prototype keys cannot supply registration fields', async () => {
  const f = fixture('pull_request_target');
  f.registration = JSON.parse(
    `{"__proto__":${JSON.stringify(f.registration)}}`
  );
  await assert.rejects(validateVersionCandidate(f), /schema/);
  assert.equal(Object.prototype.schemaVersion, undefined);
});

test('rejects malformed registration JSON', async () => {
  const f = fixture();
  f.github.rest.repos.getContent = async () => ({
    data: {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from('{').toString('base64'),
    },
  });
  await assert.rejects(
    validateVersionCandidate(f),
    /Invalid candidate registration JSON/
  );
});

for (const [group, method] of [
  ['repos', 'getContent'],
  ['repos', 'getCommit'],
  ['repos', 'compareCommits'],
  ['actions', 'getWorkflowRunAttempt'],
  ['actions', 'listJobsForWorkflowRunAttempt'],
  ['pulls', 'get'],
  [null, 'paginate'],
]) {
  test(`propagates ${method} API failures without retrying or authorizing`, async () => {
    const f = fixture();
    const error = new Error('API unavailable or not found');
    (group ? f.github.rest[group] : f.github)[method] = async () => {
      throw error;
    };
    await assert.rejects(validateVersionCandidate(f), err => err === error);
    assert.deepEqual(f.sleeps, []);
  });
}
