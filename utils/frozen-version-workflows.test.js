// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal workflow contracts, not JS interpolation.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;

// Read the live workflows, not copies of the old/new workflow or shell logic.
// These bounded indentation helpers cover only the contract's mappings, steps,
// and literal blocks. They deliberately fail on missing/duplicate selectors;
// they are not a YAML parser and need no installed packages.
const workflow = name =>
  readFileSync(join(__dirname, '..', '.github/workflows', name), 'utf8');
const version = workflow('version-packages.yml');
const ci = workflow('test.yml');
const packages = workflow('candidate-packages.yml');
const binaries = workflow('candidate-binaries.yml');
const H = 'a'.repeat(40);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

function section(source, key, indent) {
  const lines = source.split('\n');
  const header = `${' '.repeat(indent)}${key}:`;
  const indices = lines.flatMap((line, index) =>
    line === header ? [index] : []
  );
  assert.equal(indices.length, 1, `Exactly one ${header}`);
  const start = indices[0] + 1;
  let end = start;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && !line.trimStart().startsWith('#')) {
      if (line.length - line.trimStart().length <= indent) break;
    }
    end++;
  }
  return lines.slice(start, end).join('\n');
}

function field(source, key, indent) {
  const prefix = `${' '.repeat(indent)}${key}: `;
  const matches = source.split('\n').filter(line => line.startsWith(prefix));
  assert.equal(matches.length, 1, `Exactly one ${prefix}`);
  return matches[0].slice(prefix.length).replace(/\s+#.*$/, '');
}

function steps(job) {
  const body = section(job, 'steps', 4);
  const starts = [...body.matchAll(/^ {6}- /gm)].map(match => match.index);
  assert.ok(starts.length, 'Expected workflow steps');
  return starts.map((start, index) =>
    body.slice(start, starts[index + 1] ?? body.length)
  );
}

function step(job, name) {
  const found = steps(job).filter(text =>
    text.startsWith(`      - name: ${name}\n`)
  );
  assert.equal(found.length, 1, `Exactly one step named ${name}`);
  return found[0];
}

function script(source, key) {
  const matches = [
    ...source.matchAll(new RegExp(`^( +)${key}: \\|[-+]?\\n`, 'gm')),
  ];
  assert.equal(matches.length, 1, `Exactly one literal ${key} block`);
  const match = matches[0];
  const indent = match[1].length + 2;
  const lines = source.slice(match.index + match[0].length).split('\n');
  const end = lines.findIndex(
    line => line.trim() && !line.startsWith(' '.repeat(indent))
  );
  return lines
    .slice(0, end === -1 ? undefined : end)
    .map(line => line.slice(indent))
    .join('\n')
    .trimEnd();
}

function replaceGitHubExpressions(source, replacement) {
  return source.replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, expression) => {
    if (typeof replacement === 'function')
      return replacement(expression.trim());
    assert.ok(
      Object.hasOwn(replacement, expression.trim()),
      `Unmocked expression: ${expression}`
    );
    return replacement[expression.trim()];
  });
}

function compile(source, replacements = () => '0') {
  // An arbitrary safe literal works in bare, quoted, and template positions.
  // Do not replace with '' (which can hide/create JS syntax errors).
  return new AsyncFunction(
    'github',
    'context',
    'core',
    'require',
    'process',
    replaceGitHubExpressions(source, replacements)
  );
}

const setup = section(ci, 'setup', 2);
const summary = section(ci, 'summary', 2);
const preparation = section(version, 'version', 2);
const guard = step(
  setup,
  'Validate frozen version candidate (never Update branch)'
);
const checkAll = step(summary, 'Check All');
const report = step(summary, 'Report status to PR commit');
const pending = step(setup, 'Post pending Summary status to PR commit');

// Leave unrelated, pre-existing github-script blocks in Tests out of this suite.
for (const [label, scope] of [
  ['preparation receipt', preparation],
  ['trusted setup and pending status', setup],
  ['final Summary status', summary],
]) {
  test(`changed ${label} github-script bodies compile`, () => {
    const scripts = steps(scope).filter(text =>
      /uses: actions\/github-script@/.test(text)
    );
    assert.equal(scripts.length, scope === setup ? 3 : 1);
    for (const source of scripts)
      assert.doesNotThrow(() => compile(script(source, 'script')));
  });
}

test('managed-branch authorization uses pinned main-base code before candidate checkout', async () => {
  const all = steps(setup);
  const checkouts = all.filter(text => /uses: actions\/checkout@/.test(text));
  assert.equal(checkouts.length, 2);
  assert.equal(all[0], checkouts[0]);
  assert.equal(
    field(checkouts[0], 'ref', 10),
    "${{ github.event.pull_request.head.ref == 'manual-version-packages' && github.event.pull_request.base.sha || github.sha }}"
  );
  assert.equal(field(checkouts[0], 'persist-credentials', 10), 'false');
  assert.equal(
    field(checkouts[1], 'ref', 10),
    '${{ steps.pr-context.outputs.headSha }}'
  );
  assert.ok(
    all.indexOf(step(setup, 'Resolve PR context')) < all.indexOf(guard)
  );
  assert.ok(all.indexOf(guard) < all.indexOf(checkouts[1]));
  assert.equal(
    field(guard, 'if', 8),
    "steps.pr-context.outputs.isManual == 'true'"
  );
  assert.doesNotMatch(
    guard,
    /continue-on-error:|always\(\)|updateBranch|ensure.*Fresh/i
  );
  assert.equal(field(section(setup, 'permissions', 4), 'actions', 6), 'read');
  assert.equal(
    field(section(setup, 'outputs', 4), 'headSha', 6),
    '${{ steps.pr-context.outputs.headSha }}'
  );
  assert.equal(
    field(section(setup, 'outputs', 4), 'isManual', 6),
    '${{ steps.pr-context.outputs.isManual }}'
  );

  const S = 'b'.repeat(40);
  const repository = { id: 1, full_name: 'owner/repo' };
  const pr = {
    number: 2,
    state: 'open',
    head: { sha: H, ref: 'manual-version-packages', repo: repository },
    base: { sha: S, ref: 'main', repo: repository },
  };
  const context = {
    repo: { owner: 'owner', repo: 'repo' },
    eventName: 'pull_request',
    payload: { repository, pull_request: pr },
  };
  for (const currentHead of [H, 'c'.repeat(40)]) {
    const calls = [];
    const github = {
      rest: {
        repos: {
          getContent: async args => {
            assert.equal(args.ref, H);
            assert.equal(args.path, '.release-candidate.json');
            calls.push('registration');
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
            assert.equal(args.ref, H);
            calls.push('commit');
            return { data: { sha: H, parents: [{ sha: S }] } };
          },
          compareCommits: async args => {
            assert.equal(args.base, S);
            assert.equal(args.head, S);
            return { data: { status: 'identical' } };
          },
        },
        actions: {
          listJobsForWorkflowRunAttempt: async args => {
            assert.equal(args.run_id, 3);
            assert.equal(args.attempt_number, 1);
            return {
              data: {
                jobs: [
                  {
                    name: 'version',
                    status: 'completed',
                    conclusion: 'success',
                  },
                ],
              },
            };
          },
          getWorkflowRunAttempt: async args => {
            assert.equal(args.run_id, 3);
            assert.equal(args.attempt_number, 1);
            calls.push('preparation');
            return {
              data: {
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
            };
          },
          listWorkflowRunArtifacts: () => assert.fail('Use pagination'),
        },
        pulls: {
          get: async args => {
            assert.equal(args.pull_number, pr.number);
            calls.push('current head');
            return { data: { ...pr, head: { ...pr.head, sha: currentHead } } };
          },
        },
      },
      paginate: async (method, args) => {
        assert.equal(method, github.rest.actions.listWorkflowRunArtifacts);
        assert.equal(args.run_id, 3);
        calls.push('artifact');
        return [{ id: 4, name: `version-candidate-${H}`, expired: false }];
      },
    };
    let summaryText = '';
    const run = compile(script(guard, 'script'))(
      github,
      context,
      {
        summary: {
          addRaw: text => {
            summaryText += text;
            calls.push('summary');
            return { write: async () => calls.push('write') };
          },
        },
      },
      path => {
        assert.equal(path, './utils/validate-version-candidate.js');
        return require('./validate-version-candidate.js');
      }
    );
    const validationCalls = [
      'registration',
      'commit',
      'preparation',
      'artifact',
      'current head',
    ];
    if (currentHead !== H) {
      await assert.rejects(run, /Managed PR changed/);
      assert.deepEqual(calls, validationCalls);
      assert.equal(summaryText, '');
    } else {
      await run;
      assert.deepEqual(calls, [...validationCalls, 'summary', 'write']);
      assert.ok(summaryText.includes(H));
      assert.ok(summaryText.includes(S));
    }
  }
});

test('PR CI does not rebuild the candidate; only Manual Version Packages calls the build workflows', () => {
  assert.doesNotMatch(ci, /uses: \.\/\.github\/workflows\/candidate-/);
  for (const name of ['candidate-packages', 'candidate-binaries']) {
    assert.match(
      version,
      new RegExp(`uses: \\./\\.github/workflows/${name}\\.yml`)
    );
  }
  // Summary must cover every current job, including setup itself; no stale list.
  const jobs = [...section(ci, 'jobs', 0).matchAll(/^ {2}([\w-]+):$/gm)].map(
    match => match[1]
  );
  const dependencies = [
    ...section(summary, 'needs', 4).matchAll(/^ {6}- ([\w-]+)$/gm),
  ].map(match => match[1]);
  assert.deepEqual(
    dependencies.sort(),
    jobs.filter(name => name !== 'summary').sort()
  );
});

test('preparation checkout remains dispatch-pinned main, never candidate code', () => {
  assert.equal(
    field(preparation, 'if', 4),
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"
  );
  const all = steps(preparation);
  const checkouts = all.filter(text => /uses: actions\/checkout@/.test(text));
  assert.equal(checkouts.length, 1);
  assert.equal(field(checkouts[0], 'fetch-depth', 10), '0');
  assert.equal(field(checkouts[0], 'persist-credentials', 10), 'false');
  assert.doesNotMatch(checkouts[0], /^\s+(ref|token):/m);
  const verify = step(preparation, 'Verify pinned preparation base');
  assert.match(
    script(verify, 'run'),
    /git symbolic-ref --short HEAD\)" = main/
  );
  assert.match(script(verify, 'run'), /git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(
    script(verify, 'run'),
    /git rev-parse origin\/main\)" = "\$GITHUB_SHA"/
  );
  assert.ok(all.indexOf(checkouts[0]) < all.indexOf(verify));
  assert.ok(
    all.indexOf(verify) < all.findIndex(text => /run: pnpm install/.test(text))
  );
});

test('preparation run steps reference no secrets or variables', () => {
  assert.doesNotMatch(preparation, /\$\{\{\s*(?:secrets|vars)\./);
  assert.doesNotMatch(version, /create-github-app-token|RELEASE_PREPARER/);
});

test('release build jobs are read-only, build exact H, and only report its status', () => {
  const jobs = section(version, 'jobs', 0);
  const job = name => section(jobs, name, 2);
  for (const name of ['build-packages', 'build-binaries']) {
    const body = job(name);
    assert.equal(field(body, 'needs', 4), 'version');
    assert.equal(section(body, 'permissions', 4).trim(), 'contents: read');
    assert.match(
      body,
      /ref: \$\{\{ needs\.version\.outputs\.candidateSha \}\}/
    );
    assert.doesNotMatch(body, /id-token|remote-cache|sign:/);
  }
  assert.doesNotMatch(job('assemble'), /permissions:|secrets\.|environment:/);
  assert.match(job('assemble'), /node utils\/release-payloads\.mjs/);
  assert.match(
    job('assemble'),
    /name: release-payloads-\$\{\{ needs\.version\.outputs\.candidateSha \}\}-attempt-\$\{\{ github\.run_attempt \}\}/
  );
  assert.match(
    job('native-builder-check'),
    /uses: \.\/\.github\/workflows\/native-binaries\.yml/
  );
  // native-binaries.yml declares actions: read; a caller must grant it.
  assert.equal(
    section(job('native-builder-check'), 'permissions', 4).trim(),
    'contents: read\n      actions: read'
  );
  for (const name of ['release-build-pending', 'release-build-ready']) {
    const body = job(name);
    assert.equal(section(body, 'permissions', 4).trim(), 'statuses: write');
    assert.match(body, /context='Release build ready'/);
    assert.match(body, /statuses\/\$CANDIDATE_SHA/);
  }
  assert.match(field(job('release-build-ready'), 'if', 4), /always\(\)/);
});

test('GITHUB_TOKEN is job-scoped and consumed only by create-PR and the receipt step', () => {
  const all = steps(preparation);
  const create = step(preparation, 'Create or update draft version PR');
  assert.equal(
    section(preparation, 'permissions', 4).trim(),
    'contents: write\n      pull-requests: write'
  );
  assert.equal(
    field(create, 'if', 8),
    "steps.changesets.outputs.has-releases == 'true'"
  );
  const index = all.indexOf(create);
  assert.ok(
    all.indexOf(
      step(
        preparation,
        'Prepare generated changelog body and committed receipt'
      )
    ) < index
  );
  assert.ok(
    all
      .filter(text => /^ {8}run:/m.test(text))
      .every(text => all.indexOf(text) < index)
  );
  assert.equal((preparation.match(/github\.token/g) || []).length, 2);
  assert.match(create, /uses: peter-evans\/create-pull-request@[a-f0-9]{40}\b/);
  assert.equal(field(create, 'token', 10), '${{ github.token }}');
  assert.equal(field(create, 'base', 10), 'main');
  assert.equal(field(create, 'branch', 10), 'manual-version-packages');
  assert.equal(field(create, 'sign-commits', 10), 'true');
  assert.equal(field(create, 'draft', 10), 'always-true');
  assert.equal(field(create, 'GIT_CONFIG_COUNT', 10), "'1'");
  assert.equal(field(create, 'GIT_CONFIG_KEY_0', 10), 'core.hooksPath');
  assert.equal(field(create, 'GIT_CONFIG_VALUE_0', 10), '/dev/null');
  assert.equal(
    field(
      step(
        preparation,
        'Verify signed candidate and write preparation receipt'
      ),
      'github-token',
      10
    ),
    '${{ github.token }}'
  );
});

test('preparation and candidate workflows have no publishing environment or registry credentials', () => {
  assert.equal(section(version, 'permissions', 0).trim(), 'contents: read');
  for (const source of [version, packages, binaries]) {
    const active = source
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n');
    assert.doesNotMatch(
      active,
      /\b(?:NPM_TOKEN|NODE_AUTH_TOKEN|VERCEL_TOKEN|TWINE_PASSWORD)\b/
    );
    const environments = active.match(/^\s*environment:.*$/gm) || [];
    if (source === binaries) {
      assert.deepEqual(environments, [
        "    environment: ${{ matrix.sign && 'code-signing' || fromJSON('null') }}",
      ]);
    } else {
      assert.deepEqual(environments, []);
    }
    assert.doesNotMatch(
      active,
      /ci:publish|\b(?:npm|pnpm|cargo|uv|twine) publish\b|changeset(?:s)? (?:publish|tag)\b|realease-binary\.yml|release\.yml/
    );
    assert.doesNotMatch(active, /secrets: inherit/);
  }
  for (const source of [packages, binaries]) {
    assert.equal(
      section(source, 'permissions', 0)
        .split('\n')
        .filter(line => line.trim() && !line.trimStart().startsWith('#'))
        .map(line => line.trim())
        .join('\n'),
      'contents: read'
    );
    assert.deepEqual(
      [...source.matchAll(/secrets\.([\w]+)/g)].map(match => match[1]),
      source === packages
        ? ['SENTRY_DSN']
        : [
            'SENTRY_DSN',
            'SENTRY_DSN',
            'APPLE_CERT_DATA',
            'APPLE_API_KEY',
            'APPLE_CERT_PASSWORD',
          ]
    );
    assert.equal(
      field(
        section(
          section(section(source, 'workflow_call', 2), 'inputs', 4),
          'ref',
          6
        ),
        'required',
        8
      ),
      'true'
    );
    assert.match(source, /ref: \$\{\{ inputs.ref \}\}/);
    assert.match(source, /persist-credentials: false/);
  }
});

test('Tests is PR-only: no manual dispatch, duplicate entry point, or old freshness path', () => {
  assert.equal(
    section(ci, 'on', 0).trim(),
    'pull_request:\n    branches:\n      - main'
  );
  assert.doesNotMatch(
    version + ci,
    /createWorkflowDispatch|dispatchManualTests|ensureManualBranchFresh|gh workflow run|workflow_dispatch.*test\.yml/
  );
  assert.doesNotMatch(
    script(guard, 'script'),
    /updateBranch|merge\(|rebase|dispatch/i
  );
});

test('npm payload verifies committed plan at H before install/build/pack and uploads immutable inventory', () => {
  const pack = section(packages, 'pack', 2);
  const all = steps(pack);
  const verify = step(pack, 'Verify exact candidate and committed plan');
  assert.equal(field(verify, 'SOURCE_SHA', 10), '${{ inputs.ref }}');
  assert.match(
    script(verify, 'run'),
    /git cat-file -e "\$SOURCE_SHA:\.release-plan.json"/
  );
  assert.ok(
    all.indexOf(verify) < all.findIndex(text => /run: pnpm install/.test(text))
  );
  const build = step(pack, 'Build full workspace (including CLI JavaScript)');
  const payload = step(
    pack,
    'Pack planned public npm packages without publishing'
  );
  const upload = step(pack, 'Upload complete npm payload inventory');
  assert.ok(all.indexOf(build) < all.indexOf(payload));
  assert.ok(all.indexOf(payload) < all.indexOf(upload));
  assert.equal(
    field(payload, 'run', 8),
    'node utils/pack-version-candidate.mjs'
  );
  assert.equal(field(payload, 'SOURCE_SHA', 10), '${{ inputs.ref }}');
  assert.equal(field(payload, 'PLAN_PATH', 10), '.release-plan.json');
  assert.equal(
    field(upload, 'name', 10),
    'version-packages-${{ inputs.ref }}-attempt-${{ github.run_attempt }}'
  );
  assert.equal(field(upload, 'overwrite', 10), 'false');
  assert.equal(field(upload, 'if-no-files-found', 10), 'error');
  assert.equal(field(upload, 'retention-days', 10), '30');
});

// Absolute binaries and a clean environment avoid Homebrew Bash and inherited
// credentials/BASH_ENV. macOS /bin/bash is 3.2; Linux uses its system Bash.
// The existing archive suite separately exercises native Windows artifacts.
function shellTest(name, run) {
  if (process.platform === 'win32') {
    test.skip(`${name} (requires POSIX system Bash)`, run);
    return;
  }
  test(name, run);
}

function bash(source, env = {}) {
  const result = spawnSync(
    '/usr/bin/env',
    [
      '-i',
      'PATH=/usr/bin:/bin',
      ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
      '/bin/bash',
      '--noprofile',
      '--norc',
      '-e',
      '-o',
      'pipefail',
      '-c',
      source,
    ],
    { encoding: 'utf8' }
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function temporary(run) {
  const dir = mkdtempSync(join(tmpdir(), 'frozen-workflow-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const statusExpressions = {
  'steps.pr-context.outputs.headSha': H,
  'github.server_url': 'https://github.example',
  'github.repository': 'owner/repo',
  'github.run_id': '42',
};

async function reportStatus(source, state) {
  const statuses = [];
  await compile(script(source, 'script'), statusExpressions)(
    {
      rest: {
        repos: { createCommitStatus: async args => statuses.push(args) },
      },
    },
    {
      repo: { owner: 'owner', repo: 'repo' },
      sha: 'f'.repeat(40),
      payload: { pull_request: { head: { sha: H } } },
    },
    {},
    undefined,
    { env: { CHECK_STATE: state } }
  );
  assert.equal(statuses.length, 1);
  return statuses[0];
}

test('Summary always reports to payload H and overwrites the same pending status, even without setup outputs', async () => {
  assert.equal(field(summary, 'if', 4), 'always()');
  assert.equal(field(report, 'if', 8), 'always()');
  assert.equal(field(checkAll, 'continue-on-error', 8), 'true');
  assert.equal(
    field(report, 'CHECK_STATE', 10),
    '${{ steps.check-all.outputs.state }}'
  );
  const pendingStatus = await reportStatus(pending);
  assert.equal(pendingStatus.state, 'pending');
  for (const state of ['success', 'failure', 'cancelled', '', undefined]) {
    const finalStatus = await reportStatus(report, state);
    for (const key of ['owner', 'repo', 'sha', 'context', 'target_url']) {
      assert.equal(finalStatus[key], pendingStatus[key], key);
    }
    assert.equal(finalStatus.sha, H);
    assert.equal(finalStatus.context, 'Summary');
    assert.equal(
      finalStatus.state,
      state === 'success' ? 'success' : 'failure'
    );
  }
  const fail = step(summary, 'Fail the job if Check All failed');
  assert.equal(
    field(fail, 'if', 8),
    "${{ steps.check-all.outcome == 'failure' }}"
  );
  assert.equal(field(fail, 'run', 8), 'exit 1');
});

for (const [label, results, expected] of [
  ['success', ['success', 'success'], 'success'],
  ['failure', ['success', 'failure'], 'failure'],
  ['cancelled', ['success', 'cancelled'], 'failure'],
  ['expected skips', ['success', 'skipped', 'skipped'], 'success'],
  ['failure mixed with skips', ['skipped', 'failure'], 'failure'],
  [
    'setup failed, downstream skipped',
    ['failure', 'skipped', 'skipped'],
    'failure',
  ],
  ['setup cancelled, downstream skipped', ['cancelled', 'skipped'], 'failure'],
]) {
  shellTest(`actual Summary shell reports job results: ${label}`, async () => {
    temporary(dir => {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const result = bash(
        replaceGitHubExpressions(script(checkAll, 'run'), {
          "join(needs.*.result, ' ')": results.join(' '),
        }),
        { GITHUB_OUTPUT: output }
      );
      assert.equal(
        result.status,
        expected === 'success' ? 0 : 1,
        result.stderr
      );
      assert.equal(readFileSync(output, 'utf8'), `state=${expected}\n`);
    });
    assert.equal((await reportStatus(report, expected)).state, expected);
  });
}

for (const [label, source, head, code] of [
  ['exact H', H, H, 0],
  ['missing SHA', undefined, H, 1],
  ['empty SHA', '', H, 1],
  ['branch rather than SHA', 'main', H, 1],
  ['short SHA', H.slice(0, 7), H, 1],
  ['uppercase SHA', H.toUpperCase(), H, 1],
  ['trailing newline', `${H}\n`, H, 1],
  ['mismatched checkout', H, 'b'.repeat(40), 1],
]) {
  shellTest(`system Bash (3.2 on macOS) binary SHA guard: ${label}`, () => {
    const verify = step(section(binaries, 'build', 2), 'Verify source SHA');
    assert.equal(field(verify, 'SOURCE_SHA', 10), '${{ inputs.ref }}');
    const result = bash(
      [
        'git() { test "$1 $2" = "rev-parse HEAD" || return 99; printf "%s\\n" "$MOCK_HEAD"; }',
        script(verify, 'run'),
        'printf "verified\\n"',
      ].join('\n'),
      {
        MOCK_HEAD: head,
        ...(source === undefined ? {} : { SOURCE_SHA: source }),
      }
    );
    assert.equal(result.status, code, result.stderr);
    assert.equal(result.stdout, code === 0 ? 'verified\n' : '');
  });
}

shellTest('binary SHA guard fails closed if git cannot resolve HEAD', () => {
  const verify = step(section(binaries, 'build', 2), 'Verify source SHA');
  const result = bash(
    `git() { return 128; }\n${script(verify, 'run')}\nprintf 'verified\\n'`,
    { SOURCE_SHA: H }
  );
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
});

shellTest('only the version PR runs macOS cells', () => {
  const run = script(step(setup, 'Choose platform cells'), 'run');
  const choose = IS_VERSION_PR =>
    temporary(dir => {
      const GITHUB_OUTPUT = join(dir, 'output');
      writeFileSync(GITHUB_OUTPUT, '');
      const result = bash(run, { IS_VERSION_PR, GITHUB_OUTPUT });
      assert.equal(result.status, 0, result.stderr);
      const outputs = Object.fromEntries(
        readFileSync(GITHUB_OUTPUT, 'utf8')
          .trim()
          .split('\n')
          .map(line => [
            line.slice(0, line.indexOf('=')),
            line.slice(line.indexOf('=') + 1),
          ])
      );
      return {
        unit: JSON.parse(outputs.unitMatrix).map(cell => cell.runner),
        cli: JSON.parse(outputs.cliUnitRunners),
      };
    });
  const isMac = runner => runner.startsWith('macos-');

  // Merging the version PR releases it, so it runs every platform first.
  const version = choose('true');
  assert.ok(version.unit.some(isMac) && version.unit.some(r => !isMac(r)));
  assert.deepEqual(version.cli, [
    'ubuntu-latest',
    'macos-15',
    'windows-latest',
  ]);

  const pr = choose('false');
  assert.ok(pr.unit.length && !pr.unit.some(isMac));
  assert.deepEqual(pr.cli, ['ubuntu-latest', 'windows-latest']);
});

test('the version job keeps its default name, which the candidate validator looks up', () => {
  const job = section(section(version, 'jobs', 0), 'version', 2);
  assert.doesNotMatch(job, /^ {4}name:/m);
  assert.match(
    readFileSync(join(__dirname, 'validate-version-candidate.js'), 'utf8'),
    /const VERSION_JOB = 'version';/
  );
});
