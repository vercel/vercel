const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
// Use Vitest in CI or Node's runner without dependencies. Bash and jq are
// available on the GitHub-hosted runners; gh and curl below never use a network.
const test = globalThis.test || require('node:test').test;

const workflow = readFileSync(
  path.join(__dirname, '../.github/workflows/test.yml'),
  'utf8'
);
const source = workflow.match(
  / {10}artifact_filters='[\s\S]*?(?= {10}api_failures=0)/
);
assert.ok(
  source,
  'artifact resolver functions must remain covered by this test'
);
const resolver = source[0].replace(/^ {10}/gm, '');
const binaryWorkflow = readFileSync(
  path.join(__dirname, '../.github/workflows/pr-binaries.yml'),
  'utf8'
);
const binarySource = binaryWorkflow.match(
  / {10}artifact_filters='[\s\S]*?(?= {10}api_failures=0)/
);
assert.ok(
  binarySource,
  'PR binary resolver must use the verified producer filter'
);
const binaryResolver = binarySource[0].replace(/^ {10}/gm, '');

// PR binaries pin these URLs into the Builder graph they ship, so unlike E2E
// they never accept the branch alias, which moves with each push.
const branchAliasFallback = `  if jq -e "$artifact_filters"'
    any(.[]; .state == "success" and trusted_vercel and .context == "Vercel")
  ' >/dev/null <<< "$statuses"; then
    get_branch_alias
  fi
`;

test('PR binary and E2E resolvers share identical producer and candidate checks', () => {
  assert.equal(
    binaryResolver.split('validate_deployment_url()')[0],
    resolver.split('validate_deployment_url()')[0]
  );
  const e2eCandidates = resolver.split('get_candidate_urls()')[1];
  assert.ok(e2eCandidates.includes(branchAliasFallback));
  assert.equal(
    binaryResolver.split('get_candidate_urls()')[1],
    e2eCandidates.replace(branchAliasFallback, '')
  );
});

test('PR binary resolver never offers the branch alias', () => {
  const result = runResolver({
    resolverSource: binaryResolver,
    statuses: [],
    commits: [commitStatus],
    headRef: 'Feature Branch!',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /vercel-git-/);
});

const creator = { id: 35613825, login: 'vercel[bot]', type: 'Bot' };
const sha = 'a'.repeat(40);
const url = 'https://vercel-k86ob412h.vercel.sh';
const deployment = { id: 6334457823, sha, creator };
const status = { state: 'success', creator, environment_url: url };
const commitStatus = {
  state: 'success',
  creator,
  context: 'Vercel',
  target_url: url,
};
const existing = 'EXISTING=value\n';

function runResolver({
  deployments = [],
  statuses = [status],
  commits = [],
  headSha = sha,
  // Real jobs always export HEAD_REF (see get_branch_alias in test.yml /
  // pr-binaries.yml); default to '' here (not undefined) so `set -u` in the
  // extracted resolver script doesn't abort with "unbound variable" when the
  // commits fallback calls get_branch_alias.
  headRef = '',
  validateUrl,
  curlExit = 0,
  rawDeployments,
  rawStatuses,
  rawCommits,
  resolverSource = resolver,
} = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'artifact-resolver-'));
  try {
    for (const [name, value] of Object.entries({
      deployments: rawDeployments ?? JSON.stringify(deployments),
      statuses: rawStatuses ?? JSON.stringify(statuses),
      commits: rawCommits ?? JSON.stringify(commits),
      output: existing,
      'gh-calls': '',
      'curl-calls': '',
    })) {
      writeFileSync(path.join(dir, name), value);
    }
    const result = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail
         gh() {
           [[ "$1" == api && "$#" == 2 ]] || return 64
           printf '%s\\n' "$2" >> "$FIXTURES/gh-calls"
           case "$2" in
             "repos/$GITHUB_REPOSITORY/deployments?sha=$HEAD_SHA&per_page=20")
               cat "$FIXTURES/deployments" ;;
             "repos/$GITHUB_REPOSITORY/deployments/6334457823/statuses")
               cat "$FIXTURES/statuses" ;;
             "repos/$GITHUB_REPOSITORY/commits/$HEAD_SHA/statuses")
               cat "$FIXTURES/commits" ;;
             *) return 64 ;;
           esac
         }
         curl() {
           printf '%s\\n' "$@" >> "$FIXTURES/curl-calls"
           return "$CURL_EXIT"
         }
         ${resolverSource}
         if [[ "$MODE" == validate ]]; then
           validate_deployment_url "$TEST_URL"
         else
           get_candidate_urls
         fi`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIXTURES: dir.replace(/\\/g, '/'),
          GITHUB_OUTPUT: path.join(dir, 'output').replace(/\\/g, '/'),
          GITHUB_REPOSITORY: 'vercel/vercel-internal',
          HEAD_SHA: headSha,
          HEAD_REF: headRef,
          MODE: validateUrl === undefined ? 'select' : 'validate',
          TEST_URL: validateUrl ?? '',
          CURL_EXIT: String(curlExit),
        },
      }
    );
    assert.ifError(result.error);
    return {
      ...result,
      output: readFileSync(path.join(dir, 'output'), 'utf8'),
      ghCalls: readFileSync(path.join(dir, 'gh-calls'), 'utf8'),
      curlCalls: readFileSync(path.join(dir, 'curl-calls'), 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertCandidates(options, expected) {
  const result = runResolver(options);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, expected);
  assert.equal(result.output, existing);
  assert.equal(result.curlCalls, '');
  return result;
}

test('PR binary resolver writes only its expected output for a valid origin', () => {
  const result = runResolver({
    resolverSource: binaryResolver,
    validateUrl: url,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `${existing}url=${url}\n`);
});

test('original verified deployment and status fixture remains selected', () => {
  const result = assertCandidates({ deployments: [deployment] }, `${url}\n`);
  assert.match(result.ghCalls, /deployments\/6334457823\/statuses\n/);
});

test('commit fallback uses the creator-bearing /statuses list endpoint', () => {
  const result = assertCandidates({ commits: [commitStatus] }, `${url}\n`);
  assert.ok(result.ghCalls.includes(`/commits/${sha}/statuses\n`));
  assert.ok(!result.ghCalls.includes(`/commits/${sha}/status\n`));
});

test('branch alias is appended after a trusted commit status when HEAD_REF is a usable branch name', () => {
  assertCandidates(
    { statuses: [], commits: [commitStatus], headRef: 'Feature Branch!' },
    `${url}\nhttps://vercel-git-feature-branch.vercel.sh\n`
  );
});

test('branch alias is omitted (not left unset) when HEAD_REF is empty or too long to be a valid subdomain', () => {
  assertCandidates(
    { statuses: [], commits: [commitStatus], headRef: '' },
    `${url}\n`
  );
  assertCandidates(
    { statuses: [], commits: [commitStatus], headRef: 'x'.repeat(53) },
    `${url}\n`
  );
});

for (const untrusted of [
  null,
  {},
  { id: 123, login: 'other[bot]', type: 'Bot' },
  { ...creator, id: 123 },
  { ...creator, id: '35613825' },
  { ...creator, login: 'other[bot]' },
  { ...creator, type: 'User' },
]) {
  test(`rejects unrelated or forged creator ${JSON.stringify(untrusted)} on every source`, () => {
    const result = assertCandidates(
      { deployments: [{ ...deployment, creator: untrusted }] },
      ''
    );
    assert.ok(!result.ghCalls.includes('/deployments/6334457823/statuses'));
    assertCandidates(
      {
        deployments: [deployment],
        statuses: [{ ...status, creator: untrusted }],
        commits: [{ ...commitStatus, creator: untrusted }],
      },
      ''
    );
  });
}

test('rejects deployments for another SHA even from the trusted creator', () => {
  const result = assertCandidates(
    { deployments: [{ ...deployment, sha: 'b'.repeat(40) }] },
    ''
  );
  assert.ok(!result.ghCalls.includes('/deployments/6334457823/statuses'));
});

test('mixed results retain only the original trusted fixtures', () => {
  const unrelated = { id: 123, login: 'other[bot]', type: 'Bot' };
  assertCandidates(
    {
      deployments: [
        { ...deployment, id: 999, creator: unrelated },
        { ...deployment, id: 998, sha: 'b'.repeat(40) },
        deployment,
      ],
      statuses: [{ ...status, creator: unrelated }, status],
      commits: [
        { ...commitStatus, creator: { ...creator, id: 123 } },
        { ...commitStatus, context: 'Vercel Preview' },
        commitStatus,
      ],
    },
    `${url}\n${url}\n`
  );
});

test('passes SHA as literal --arg data rather than jq source interpolation', () => {
  const headSha = '" or true #';
  assertCandidates(
    { headSha, deployments: [{ ...deployment, sha: headSha }, deployment] },
    `${url}\n`
  );
});

for (const id of ['../evil', '6334457823', -1, 0, 1.5, null]) {
  test(`does not turn invalid deployment ID ${JSON.stringify(id)} into a path`, () => {
    assertCandidates({ deployments: [{ ...deployment, id }] }, '');
  });
}

for (const state of ['pending', 'failure', 'error', null]) {
  test(`rejects ${state} statuses on both sources`, () => {
    assertCandidates(
      {
        deployments: [deployment],
        statuses: [{ ...status, state }],
        commits: [{ ...commitStatus, state }],
      },
      ''
    );
  });
}

for (const context of [
  'Vercel Preview',
  'Vercel - project',
  'vercel',
  'CI',
  null,
]) {
  test(`rejects non-exact commit context ${JSON.stringify(context)}`, () => {
    assertCandidates({ commits: [{ ...commitStatus, context }] }, '');
  });
}

const invalidUrls = [
  '',
  'http://vercel-k86ob412h.vercel.sh',
  '//vercel-k86ob412h.vercel.sh',
  `${url}/tarballs`,
  `${url}/../`,
  `${url}//`,
  `${url}?query=value`,
  `${url}#fragment`,
  'https://user:password@vercel-k86ob412h.vercel.sh',
  `${url}:443`,
  'https://bad..example.test',
  'https://-bad.example.test',
  `${url}\n`,
  `${url}\r`,
  `${url}\r\nINJECTED=value`,
  `https://unrelated.example.test\n${url}`,
  `${url}\nhttps://unrelated.example.test`,
  `${url}\u2028`,
  `${url}\t`,
  `${url} `,
  `${url}/%0aINJECTED=value`,
  `${url}\\evil`,
  `${url};id`,
  'https://$(id).example.test',
];

for (const value of invalidUrls) {
  test(`rejects URL injection before line extraction, curl and output: ${JSON.stringify(value)}`, () => {
    assertCandidates(
      {
        deployments: [deployment],
        statuses: [{ ...status, environment_url: value }],
        commits: [{ ...commitStatus, target_url: value }],
      },
      ''
    );
    const result = runResolver({ validateUrl: value });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.curlCalls, '');
    assert.equal(result.output, existing);
    const binaryResult = runResolver({
      resolverSource: binaryResolver,
      validateUrl: value,
    });
    assert.equal(binaryResult.status, 1, binaryResult.stderr);
    assert.equal(binaryResult.curlCalls, '');
    assert.equal(binaryResult.output, existing);
  });
}

for (const value of [null, 123, true, [], {}]) {
  test(`rejects non-string URL ${JSON.stringify(value)}`, () => {
    assertCandidates(
      {
        deployments: [deployment],
        statuses: [{ ...status, environment_url: value }],
        commits: [{ ...commitStatus, target_url: value }],
      },
      ''
    );
  });
}

for (const value of [url, `${url}/`, 'https://custom-preview.example.test']) {
  test(`valid origin ${value} reaches curl and generates exact outputs`, () => {
    const origin = value.replace(/\/$/, '');
    assertCandidates(
      {
        deployments: [deployment],
        statuses: [{ ...status, environment_url: value }],
        commits: [{ ...commitStatus, target_url: value }],
      },
      `${value}\n${value}\n`
    );
    const result = runResolver({ validateUrl: value });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.curlCalls,
      `--proto\n=https\n--connect-timeout\n5\n--max-time\n15\n-fsI\n${origin}/tarballs/vercel.tgz\n`
    );
    assert.equal(
      result.output,
      existing +
        `deploymentUrl=${origin}\ncliVersion=${origin}/tarballs/vercel.tgz\n`
    );
  });
}

test('failed tarball probe never writes outputs', () => {
  const result = runResolver({ validateUrl: url, curlExit: 22 });
  assert.equal(result.status, 1);
  assert.equal(result.output, existing);
});

for (const key of ['rawDeployments', 'rawStatuses', 'rawCommits']) {
  test(`malformed JSON from ${key} fails closed`, () => {
    const result = runResolver({ deployments: [deployment], [key]: '{' });
    assert.notEqual(result.status, 0);
    assert.equal(result.curlCalls, '');
    assert.equal(result.output, existing);
  });
}
