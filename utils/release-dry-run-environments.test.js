const assert = require('node:assert/strict');
const test = globalThis.test || require('node:test').test;
const {
  ENVIRONMENTS,
  assertDryRunEnvironments,
} = require('./release-dry-run-environments');

function fixture() {
  const environments = Object.fromEntries(
    ENVIRONMENTS.map(name => [
      name,
      {
        can_admins_bypass: false,
        protection_rules: [
          {
            type: 'required_reviewers',
            prevent_self_review: false,
            reviewers: [{ type: 'Team', reviewer: { id: 8417754 } }],
          },
        ],
        deployment_branch_policy: {
          custom_branch_policies: true,
          protected_branches: false,
        },
      },
    ])
  );
  const policies = Object.fromEntries(
    ENVIRONMENTS.map(name => [name, [{ name: 'main', type: 'branch' }]])
  );
  const calls = [];
  const messages = [];
  const failures = {};
  const github = {
    rest: {
      repos: {
        getEnvironment: async args => {
          calls.push(['environment', args]);
          if (failures.environment) throw failures.environment;
          return { data: environments[args.environment_name] };
        },
        listDeploymentBranchPolicies: () => {
          assert.fail('Branch policies must be fetched via paginate');
        },
      },
    },
    paginate: async (method, args) => {
      assert.equal(method, github.rest.repos.listDeploymentBranchPolicies);
      calls.push(['policies', args]);
      if (failures.policies) throw failures.policies;
      return policies[args.environment_name];
    },
  };
  const context = {
    repo: { owner: 'vercel', repo: 'vercel-internal' },
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
  };
  const core = { info: message => messages.push(message) };
  return {
    environments,
    policies,
    calls,
    messages,
    failures,
    context,
    run: () => assertDryRunEnvironments({ github, context, core }),
  };
}

function assertGuidance(error, name) {
  assert.match(error.message, /DRY RUN/);
  assert.ok(error.message.includes(name));
  assert.match(error.message, /Settings > Environments/);
  assert.match(error.message, /required reviewers/);
  assert.match(error.message, /only the branch main/);
  return true;
}

test('verifies both preconfigured approval gates using only read APIs', async () => {
  assert.deepEqual(ENVIRONMENTS, ['release-canary', 'release-latest']);
  const f = fixture();
  await f.run();
  assert.deepEqual(
    f.calls,
    ENVIRONMENTS.flatMap(environment_name => {
      const args = { ...f.context.repo, environment_name };
      return [
        ['environment', args],
        ['policies', { ...args, per_page: 100 }],
      ];
    })
  );
  assert.equal(f.messages.length, 1);
  for (const name of ENVIRONMENTS) {
    assert.ok(f.messages[0].includes(name));
  }
});

const invalidGates = [
  ['missing reviewer rules', { protection_rules: undefined }],
  ['no reviewer rules', { protection_rules: [] }],
  ['missing reviewers', { protection_rules: [{ type: 'required_reviewers' }] }],
  [
    'empty reviewers',
    { protection_rules: [{ type: 'required_reviewers', reviewers: [] }] },
  ],
  [
    'wrong reviewer rule type',
    { protection_rules: [{ type: 'wait_timer', reviewers: [{}] }] },
  ],
  ['administrator bypass enabled', { can_admins_bypass: true }],
  ['missing administrator bypass setting', { can_admins_bypass: undefined }],
  ['missing restrictions', { deployment_branch_policy: null }],
  [
    'all branches allowed',
    {
      deployment_branch_policy: {
        custom_branch_policies: false,
        protected_branches: false,
      },
    },
  ],
  [
    'all protected branches allowed',
    {
      deployment_branch_policy: {
        custom_branch_policies: false,
        protected_branches: true,
      },
    },
  ],
  [
    'protected branches even with custom policies',
    {
      deployment_branch_policy: {
        custom_branch_policies: true,
        protected_branches: true,
      },
    },
  ],
  ['no branch policies', {}, []],
  ['wildcard branch', {}, [{ name: '*', type: 'branch' }]],
  ['wrong branch', {}, [{ name: 'develop', type: 'branch' }]],
  ['tag main only', {}, [{ name: 'main', type: 'tag' }]],
  ['missing policy type', {}, [{ name: 'main' }]],
  [
    'extra tag main',
    {},
    [
      { name: 'main', type: 'branch' },
      { name: 'main', type: 'tag' },
    ],
  ],
];

for (const name of ENVIRONMENTS) {
  for (const preventSelfReview of [false, true]) {
    test(`accepts prevent_self_review=${preventSelfReview} for ${name}`, async () => {
      const f = fixture();
      const review = f.environments[name].protection_rules.find(
        rule => rule.type === 'required_reviewers'
      );
      review.prevent_self_review = preventSelfReview;
      await f.run();
      assert.equal(f.messages.length, 1);
    });
  }
  for (const [label, overrides, policies] of invalidGates) {
    test(`rejects ${label} for ${name}`, async () => {
      const f = fixture();
      Object.assign(f.environments[name], overrides);
      if (policies) f.policies[name] = policies;
      await assert.rejects(f.run(), error => assertGuidance(error, name));
      assert.deepEqual(f.messages, []);
    });
  }
}

for (const overrides of [
  { ref: 'refs/heads/feature' },
  { ref: 'refs/tags/main' },
  { eventName: 'push' },
  { eventName: 'workflow_call' },
]) {
  test(`rejects ${JSON.stringify(overrides)} before API reads`, async () => {
    const f = fixture();
    Object.assign(f.context, overrides);
    await assert.rejects(
      f.run(),
      /DRY RUN.*workflow_dispatch.*refs\/heads\/main/
    );
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.messages, []);
  });
}

for (const operation of ['environment', 'policies']) {
  for (const status of [404, 403, 500]) {
    test(`fails closed on ${operation} HTTP ${status}`, async () => {
      const f = fixture();
      const cause = Object.assign(new Error('API unavailable'), { status });
      f.failures[operation] = cause;
      await assert.rejects(f.run(), error => {
        assertGuidance(error, ENVIRONMENTS[0]);
        assert.ok(error.message.includes(`HTTP ${status}`));
        assert.equal(error.cause, cause);
        if (status === 404)
          assert.match(error.message, /set it up before running/);
        else assert.match(error.message, /check API read access/);
        return true;
      });
      assert.deepEqual(f.messages, []);
    });
  }
}
