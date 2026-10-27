import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// This is a metadata-only fixture protocol, NOT build provenance or a release plan.
// No subprocesses, network clients, registry operations, or credential access.
export function runDryRun(stage, env = process.env, cwd = process.cwd()) {
  assert.ok(
    [
      'prepare',
      'validate',
      'publish',
      'verify-publication',
      'promote',
    ].includes(stage),
    'Unknown dry-run stage'
  );
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Dry runs require main');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_REPOSITORY || '', /^[\w.-]+\/[\w.-]+$/);
  assert.ok(env.DRY_RUN_DIR, 'Missing dry-run artifact directory');
  mkdirSync(env.DRY_RUN_DIR, { recursive: true });

  const output = (name, value) => {
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
  };
  const write = (filename, record) => {
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    writeFileSync(join(env.DRY_RUN_DIR, filename), bytes);
    return digest(bytes);
  };
  const read = (filename, expectedDigest) => {
    assert.match(expectedDigest || '', /^[a-f0-9]{64}$/, 'Missing SHA-256');
    const bytes = readFileSync(join(env.DRY_RUN_DIR, filename));
    assert.equal(digest(bytes), expectedDigest, `${filename} digest mismatch`);
    return JSON.parse(bytes);
  };

  let candidate;
  let candidateDigest;
  if (stage === 'prepare') {
    const pkg = JSON.parse(
      readFileSync(join(cwd, 'packages/cli/package.json'), 'utf8')
    );
    assert.equal(pkg.name, 'vercel');
    assert.equal(typeof pkg.version, 'string');
    candidate = {
      schemaVersion: 1,
      dryRun: true,
      kind: 'release-approval-fixture',
      candidateId: `dry-run-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
      repository: env.GITHUB_REPOSITORY,
      sourceSha: env.GITHUB_SHA,
      runId: env.GITHUB_RUN_ID,
      prepareAttempt: env.GITHUB_RUN_ATTEMPT,
      // Informational only: no version allocation or changeset consumption.
      committedCliVersion: pkg.version,
    };
    candidateDigest = write('candidate.json', candidate);
    output('candidate-id', candidate.candidateId);
    output('candidate-digest', candidateDigest);
  } else {
    candidateDigest = env.CANDIDATE_DIGEST;
    candidate = read('candidate.json', candidateDigest);
    assert.equal(candidate.schemaVersion, 1);
    assert.equal(candidate.dryRun, true);
    assert.equal(candidate.kind, 'release-approval-fixture');
    assert.equal(candidate.repository, env.GITHUB_REPOSITORY);
    assert.equal(candidate.sourceSha, env.GITHUB_SHA);
    assert.equal(candidate.runId, env.GITHUB_RUN_ID);
    assert.match(candidate.prepareAttempt || '', /^[1-9][0-9]*$/);
    assert.equal(
      candidate.candidateId,
      `dry-run-${env.GITHUB_RUN_ID}-${candidate.prepareAttempt}`
    );
    assert.equal(candidate.candidateId, env.CANDIDATE_ID);
  }

  // Both approvals bind to the original preparation attempt, even when only a
  // failed downstream job is retried. Re-running everything creates a new ID.
  const publication = {
    schemaVersion: 1,
    dryRun: true,
    operation: 'simulate-npm-publish',
    candidateId: candidate.candidateId,
    candidateDigest,
    sourceSha: candidate.sourceSha,
    candidateTag: candidate.candidateId,
    publishedToNpm: false,
  };
  if (stage === 'publish') {
    output(
      'publication-digest',
      write('publication-dry-run.json', publication)
    );
  }
  if (stage === 'verify-publication' || stage === 'promote') {
    assert.deepEqual(
      read('publication-dry-run.json', env.PUBLICATION_DIGEST),
      publication,
      'Publication receipt must describe this exact dry-run candidate'
    );
  }
  if (stage === 'promote') {
    write('promotion-dry-run.json', {
      ...publication,
      operation: 'simulate-latest-promotion',
      publicationDigest: env.PUBLICATION_DIGEST,
      targetTag: 'latest',
      changedDistTags: false,
    });
  }

  const summary = `## DRY RUN — ${stage}\n\n${'Metadata fixture only. No version allocation, build, package CI, signing, npm publication, or dist-tag changes.\n\n'}Candidate: \`${candidate.candidateId}\`\n\nSource: \`${candidate.sourceSha}\`\n\nCandidate SHA-256: \`${candidateDigest}\`\n\n`;
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  }
  return { candidate, candidateDigest };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { candidate } = runDryRun(process.argv[2]);
    console.log(
      `DRY RUN ${process.argv[2]}: ${candidate.candidateId}. No release side effects.`
    );
  } catch (error) {
    console.error(`Release DRY RUN failed: ${error.message}`);
    process.exitCode = 1;
  }
}
