const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = globalThis.test || require('node:test').test;
const load = import('./release-dry-run.mjs');

async function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'release dry run '));
  try {
    mkdirSync(join(dir, 'packages/cli'), { recursive: true });
    writeFileSync(
      join(dir, 'packages/cli/package.json'),
      JSON.stringify({ name: 'vercel', version: '1.2.3' })
    );
    const env = {
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: 'a'.repeat(40),
      GITHUB_RUN_ID: '1234',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REPOSITORY: 'vercel/vercel-internal',
      GITHUB_OUTPUT: join(dir, 'output'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      DRY_RUN_DIR: join(dir, 'artifacts'),
    };
    const { runDryRun } = await load;
    const stage = name => runDryRun(name, env, dir);
    const prepared = stage('prepare');
    env.CANDIDATE_ID = prepared.candidate.candidateId;
    env.CANDIDATE_DIGEST = prepared.candidateDigest;
    const read = name =>
      JSON.parse(readFileSync(join(env.DRY_RUN_DIR, name), 'utf8'));
    const rewrite = (name, value) => {
      const bytes = `${JSON.stringify(value)}\n`;
      writeFileSync(join(env.DRY_RUN_DIR, name), bytes);
      return createHash('sha256').update(bytes).digest('hex');
    };
    const publish = () => {
      stage('publish');
      env.PUBLICATION_DIGEST = readFileSync(env.GITHUB_OUTPUT, 'utf8').match(
        /publication-digest=([a-f0-9]{64})/
      )[1];
    };
    await run({ dir, env, stage, read, rewrite, publish });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('complete rehearsal verifies one frozen fixture and writes only dry-run receipts', () =>
  fixture(({ env, stage, read, publish }) => {
    stage('validate');
    publish();
    stage('verify-publication');
    stage('promote');
    const candidate = read('candidate.json');
    assert.equal(candidate.committedCliVersion, '1.2.3');
    assert.equal(candidate.candidateId, 'dry-run-1234-1');
    assert.equal(candidate.kind, 'release-approval-fixture');
    assert.equal(candidate.dryRun, true);
    const publication = read('publication-dry-run.json');
    assert.equal(publication.candidateDigest, env.CANDIDATE_DIGEST);
    assert.equal(publication.candidateTag, candidate.candidateId);
    assert.equal(publication.publishedToNpm, false);
    const promotion = read('promotion-dry-run.json');
    assert.equal(promotion.targetTag, 'latest');
    assert.equal(promotion.changedDistTags, false);
    assert.equal(promotion.publicationDigest, env.PUBLICATION_DIGEST);
    assert.equal(promotion.dryRun, true);
    const summary = readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
    assert.equal((summary.match(/## DRY RUN/g) || []).length, 5);
    assert.match(summary, /No version allocation, build, package CI/);
    assert.ok(summary.includes(env.CANDIDATE_DIGEST));
  }));

for (const [field, value] of [
  ['GITHUB_REF', 'refs/heads/feature'],
  ['GITHUB_SHA', 'moving-main'],
  ['GITHUB_RUN_ID', '0'],
  ['GITHUB_RUN_ATTEMPT', '../1'],
  ['GITHUB_REPOSITORY', 'not-a-repository'],
  ['DRY_RUN_DIR', ''],
]) {
  test(`rejects invalid ${field}`, () =>
    fixture(({ env, stage }) => {
      env[field] = value;
      assert.throws(() => stage('prepare'));
    }));
}

for (const [field, value] of [
  ['schemaVersion', 2],
  ['dryRun', false],
  ['kind', 'real-release'],
  ['repository', 'some/other-repo'],
  ['sourceSha', 'b'.repeat(40)],
  ['runId', '5678'],
  ['prepareAttempt', ''],
  ['candidateId', 'dry-run-1234-2'],
]) {
  test(`rejects a mismatched candidate ${field} even with a valid digest`, () =>
    fixture(({ env, stage, read, rewrite }) => {
      const candidate = { ...read('candidate.json'), [field]: value };
      env.CANDIDATE_DIGEST = rewrite('candidate.json', candidate);
      assert.throws(() => stage('validate'));
      assert.throws(() => stage('publish'));
      assert.equal(
        existsSync(join(env.DRY_RUN_DIR, 'publication-dry-run.json')),
        false
      );
    }));
}

test('tampered candidate bytes fail before a simulated publication', () =>
  fixture(({ stage, read, rewrite }) => {
    rewrite('candidate.json', {
      ...read('candidate.json'),
      committedCliVersion: '9.9.9',
    });
    assert.throws(() => stage('publish'), /digest mismatch/);
  }));

test('promotion cannot proceed without a publication receipt and its digest', () =>
  fixture(({ env, stage }) => {
    assert.throws(() => stage('promote'), /Missing SHA-256/);
    env.PUBLICATION_DIGEST = 'b'.repeat(64);
    assert.throws(() => stage('promote'), /ENOENT/);
  }));

for (const [field, value] of [
  ['candidateId', 'dry-run-9999-1'],
  ['candidateDigest', 'b'.repeat(64)],
  ['sourceSha', 'b'.repeat(40)],
  ['candidateTag', 'latest'],
  ['dryRun', false],
  ['publishedToNpm', true],
]) {
  test(`promotion rejects mismatched publication ${field}`, () =>
    fixture(({ env, stage, read, rewrite, publish }) => {
      publish();
      env.PUBLICATION_DIGEST = rewrite('publication-dry-run.json', {
        ...read('publication-dry-run.json'),
        [field]: value,
      });
      assert.throws(
        () => stage('verify-publication'),
        /exact dry-run candidate/
      );
      assert.throws(() => stage('promote'), /exact dry-run candidate/);
    }));
}

test('tampered publication receipt fails its independently saved digest', () =>
  fixture(({ stage, read, rewrite, publish }) => {
    publish();
    rewrite('publication-dry-run.json', {
      ...read('publication-dry-run.json'),
      publishedToNpm: true,
    });
    assert.throws(() => stage('promote'), /digest mismatch/);
  }));

test('retrying a failed downstream job preserves the candidate from preparation', () =>
  fixture(({ env, stage, publish }) => {
    publish();
    env.GITHUB_RUN_ATTEMPT = '2';
    const { candidate } = stage('promote');
    assert.equal(candidate.candidateId, 'dry-run-1234-1');
  }));

test('rerunning preparation creates a new candidate that rejects the old receipt', () =>
  fixture(({ env, stage, publish }) => {
    publish();
    const oldDigest = env.CANDIDATE_DIGEST;
    env.GITHUB_RUN_ATTEMPT = '2';
    const fresh = stage('prepare');
    assert.equal(fresh.candidate.candidateId, 'dry-run-1234-2');
    assert.notEqual(fresh.candidateDigest, oldDigest);
    env.CANDIDATE_ID = fresh.candidate.candidateId;
    env.CANDIDATE_DIGEST = fresh.candidateDigest;
    assert.throws(() => stage('promote'), /exact dry-run candidate/);
  }));

test('unknown stages fail rather than returning simulated success', () =>
  fixture(({ stage }) => {
    assert.throws(() => stage('real-publish'), /Unknown dry-run stage/);
  }));

test('CLI entry point succeeds for the frozen fixture and exits 1 on invalid input', () =>
  fixture(({ dir, env }) => {
    const script = join(__dirname, 'release-dry-run.mjs');
    const stdout = execFileSync(process.execPath, [script, 'validate'], {
      cwd: dir,
      env,
      encoding: 'utf8',
    });
    assert.match(stdout, /DRY RUN validate: dry-run-1234-1/);
    const failure = spawnSync(process.execPath, [script, 'promote'], {
      cwd: dir,
      env,
      encoding: 'utf8',
    });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /Release DRY RUN failed: Missing SHA-256/);
  }));

const workflow = readFileSync(
  join(__dirname, '../.github/workflows/release-dry-run.yml'),
  'utf8'
);
const job = name => {
  const section = workflow.split(`  ${name}:\n`)[1];
  assert.ok(section, `Missing job ${name}`);
  return section.split(/\n {2}[\w-]+:\n/)[0];
};

for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
  test(`outcome script correctly reports ${result}`, () =>
    fixture(({ dir, env }) => {
      const script = job('summary')
        .split("node <<'NODE'\n")[1]
        .split('\n          NODE')[0]
        .replace(/^ {10}/gm, '');
      const execution = spawnSync(process.execPath, ['-e', script], {
        cwd: dir,
        env: {
          GITHUB_STEP_SUMMARY: env.GITHUB_STEP_SUMMARY,
          SOURCE_SHA: env.GITHUB_SHA,
          RESULTS: JSON.stringify({ publish: { result } }),
        },
        encoding: 'utf8',
      });
      assert.equal(execution.status, result === 'success' ? 0 : 1);
      const summary = readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8');
      assert.ok(summary.includes(`| publish | ${result} |`));
      assert.match(summary, /DRY RUN ONLY/);
    }));
}

test('workflow is manual, isolated, read-only, and never invokes a real release', () => {
  assert.match(workflow, /name: Release \(DRY RUN\)/);
  assert.match(workflow, /on:\n {2}workflow_dispatch:\n/);
  assert.match(workflow, /group: release-dry-run\n/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /queue: max/);
  assert.doesNotMatch(
    workflow,
    /secrets\.|id-token:|: write\b|npm (publish|dist-tag)|workflow_call:|uses: \.\/\.github\/workflows\//
  );
  assert.match(job('prepare'), /needs: check-approvals/);
  assert.match(job('check-approvals'), /assertDryRunEnvironments/);
  assert.match(job('summary'), /if: always\(\)/);
  assert.match(job('summary'), /job.result !== 'success'/);
});

test('Changesets preview uses a disposable pinned worktree without versioning or real builds', () => {
  const prepare = job('prepare');
  assert.match(prepare, /fetch-depth: 0/);
  assert.match(prepare, /pnpm install --frozen-lockfile --ignore-scripts/);
  assert.match(prepare, /SOURCE_SHA: \$\{\{ github.sha \}\}/);
  assert.match(
    prepare,
    /git worktree add --detach "\$scratch\/worktree" "\$SOURCE_SHA"/
  );
  assert.match(prepare, /cd "\$scratch\/worktree"/);
  assert.match(prepare, /expand-internal-changesets.mjs/);
  assert.match(prepare, /changeset status --output release-plan.json/);
  assert.match(prepare, /release-rehearsal-summary.mjs/);
  assert.match(prepare, /release-preview.md/);
  assert.doesNotMatch(
    prepare,
    /ci:version|changeset version|pnpm build|git push|git commit/
  );
});

test('two distinct approvals are sequential, with receipt validation before latest', () => {
  assert.match(job('publish'), /needs: \[prepare, validate-candidate\]/);
  assert.match(job('publish'), /name: release-canary\n/);
  assert.match(job('validate-publication'), /needs: \[prepare, publish\]/);
  assert.match(
    job('promote'),
    /needs: \[prepare, publish, validate-publication\]/
  );
  assert.match(job('promote'), /name: release-latest\n/);
  assert.equal((workflow.match(/ {4}environment:/g) || []).length, 2);
});

test('every artifact consumer uses exact IDs, flat extraction, and frozen digest outputs', () => {
  for (const name of [
    'validate-candidate',
    'publish',
    'validate-publication',
    'promote',
  ]) {
    const section = job(name);
    assert.match(
      section,
      /artifact-ids: \$\{\{ needs.prepare.outputs.artifact-id \}\}/
    );
    assert.match(section, /merge-multiple: true/);
    assert.match(
      section,
      /CANDIDATE_DIGEST: \$\{\{ needs.prepare.outputs.candidate-digest \}\}/
    );
    assert.match(section, /ref: \$\{\{ github.sha \}\}/);
    assert.match(section, /persist-credentials: false/);
    assert.doesNotMatch(section, /overwrite: true/);
  }
  for (const name of ['validate-publication', 'promote']) {
    assert.match(
      job(name),
      /PUBLICATION_DIGEST: \$\{\{ needs.publish.outputs.publication-digest \}\}/
    );
  }
});
