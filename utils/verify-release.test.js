const { deepStrictEqual: equal, rejects, ok } = require('node:assert/strict');
const test = globalThis.test || require('node:test').test;
const load = import('./verify-release.mjs');
const repository = 'fixture/release';
const M = 'a'.repeat(40);
const H = 'b'.repeat(40);
const P = 'c'.repeat(40);
const S = 'd'.repeat(40);
const receiptPath = `contents/.release-candidate.json?ref=${H}`;
const pullsPath = `commits/${M}/pulls?per_page=100&page=1`;
const planAt = ref => `contents/.release-plan.json?ref=${ref}`;
const missing = () => {
  throw Object.assign(new Error('gh failed'), {
    stderr: 'HTTP 404: Not Found',
  });
};

function fixture() {
  const pr = {
    number: 12,
    merged: true,
    merge_commit_sha: M,
    base: { ref: 'main' },
    head: {
      ref: 'manual-version-packages',
      sha: H,
      repo: { full_name: repository },
    },
  };
  const plan = {
    releases: [{ name: 'vercel', type: 'minor', newVersion: '1.1.0' }],
  };
  const receipt = {
    schemaVersion: 1,
    sourceSha: S,
    preparationRunId: 77,
    preparationRunAttempt: 1,
  };
  const run = {
    id: 77,
    path: '.github/workflows/version-packages.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: S,
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: repository },
  };
  const payloads = [
    { id: 501, name: `release-payloads-${H}-attempt-1`, expired: false },
    { id: 502, name: `release-payloads-${H}-attempt-2`, expired: false },
    { id: 503, name: `candidate-binary-${H}-vercel-linux-x64-attempt-1` },
  ];
  const data = {
    [receiptPath]: () => ({
      content: Buffer.from(JSON.stringify(receipt)).toString('base64'),
    }),
    'actions/runs/77': run,
    [`commits/${H}`]: { parents: [{ sha: S }] },
    'actions/runs/77/artifacts?per_page=100': { artifacts: payloads },
    [pullsPath]: [pr],
    [`commits/${M}`]: { parents: [{ sha: P }] },
    [planAt(M)]: { sha: 'same-plan' },
    [planAt(P)]: { sha: 'same-plan' },
    'pulls/12': pr,
    [`contents/.release-plan.json?ref=${H}`]: () => ({
      content: Buffer.from(JSON.stringify(plan)).toString('base64'),
    }),
  };
  const calls = [];
  const get = async path => {
    ok(path.startsWith(`repos/${repository}/`));
    const key = path.slice(`repos/${repository}/`.length);
    calls.push(key);
    ok(Object.hasOwn(data, key), `Unexpected API request: ${path}`);
    return typeof data[key] === 'function' ? data[key]() : data[key];
  };
  const resolve = async () =>
    (await load).resolveRelease({ get, repository, mergeSha: M });
  return { pr, plan, receipt, run, payloads, data, calls, resolve };
}

test('selects the merged version PR head and CLI version', async () => {
  equal(await fixture().resolve(), {
    candidateSha: H,
    prNumber: 12,
    cliVersion: '1.1.0',
    preparationRunId: 77,
    payloadArtifactId: 502,
  });
});

test('rejects a preparation build that is missing, untrusted, unfinished, or expired', async () => {
  for (const [label, mutate, message] of [
    [
      'no run ID in the receipt',
      f => {
        delete f.receipt.preparationRunId;
      },
      /has no preparation run ID/,
    ],
    [
      'a string run ID',
      f => {
        f.receipt.preparationRunId = '77';
      },
      /has no preparation run ID/,
    ],
    [
      'another workflow',
      f => {
        f.run.path = '.github/workflows/test.yml';
      },
      /is not Manual Version Packages on main/,
    ],
    [
      'another branch',
      f => {
        f.run.head_branch = 'feature';
      },
      /is not Manual Version Packages on main/,
    ],
    [
      'a run for another source commit',
      f => {
        f.run.head_sha = P;
      },
      /is not Manual Version Packages on main/,
    ],
    [
      'a build still running',
      f => {
        f.run.status = 'in_progress';
        f.run.conclusion = null;
      },
      /release build for b+ is not ready \(in_progress\/null\)/,
    ],
    [
      'a failed build',
      f => {
        f.run.conclusion = 'failure';
      },
      /is not ready/,
    ],
    [
      'expired payloads',
      f => {
        for (const artifact of f.payloads) artifact.expired = true;
      },
      /no unexpired release payloads/,
    ],
  ]) {
    const f = fixture();
    mutate(f);
    await rejects(f.resolve(), message, label);
  }
});

test('ordinary main pushes do nothing', async () => {
  for (const mutate of [
    f => {
      f.data[pullsPath] = [];
    },
    f => {
      f.pr.head.ref = 'feature';
    },
  ]) {
    const f = fixture();
    mutate(f);
    equal(await f.resolve(), null);
    equal(f.calls, [pullsPath, `commits/${M}`, planAt(P), planAt(M)]);
  }
});

test('a plan change without a linked version PR fails instead of skipping', async () => {
  for (const [after, before] of [
    [{ sha: 'new-plan' }, { sha: 'old-plan' }],
    [{ sha: 'new-plan' }, missing],
    [missing, { sha: 'old-plan' }],
  ]) {
    const f = fixture();
    f.data[pullsPath] = [];
    f.data[planAt(M)] = after;
    f.data[planAt(P)] = before;
    await rejects(f.resolve(), /no merged version PR was found/);
  }
});

test('repositories without a plan on either side are ordinary pushes', async () => {
  const f = fixture();
  f.data[pullsPath] = [];
  f.data[planAt(M)] = missing;
  f.data[planAt(P)] = missing;
  equal(await f.resolve(), null);
});

test('non-404 plan lookup errors propagate', async () => {
  const f = fixture();
  f.data[pullsPath] = [];
  f.data[planAt(P)] = () => {
    throw Object.assign(new Error('gh failed'), { stderr: 'HTTP 502' });
  };
  await rejects(f.resolve(), /gh failed/);
});

test('non-CLI releases build no binaries', async () => {
  for (const releases of [[], [{ name: 'vercel', type: 'none' }]]) {
    const f = fixture();
    f.plan.releases = releases;
    equal((await f.resolve()).cliVersion, '');
  }
});

for (const [field, value] of [
  ['merged', false],
  ['merge_commit_sha', H],
  ['base', { ref: 'other' }],
  [
    'head',
    { ref: 'manual-version-packages', sha: H, repo: { full_name: 'x/y' } },
  ],
]) {
  test(`rejects version PR with unexpected ${field}`, async () => {
    const f = fixture();
    f.data['pulls/12'] = { ...f.pr, [field]: value };
    await rejects(f.resolve(), /merged same-repository version PR/);
  });
}
