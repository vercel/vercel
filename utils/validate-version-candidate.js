const { setTimeout: sleepDefault } = require('node:timers/promises');

const BRANCH = 'manual-version-packages';
const WORKFLOW = '.github/workflows/version-packages.yml';
const VERSION_JOB = 'version';
const isSha = value =>
  typeof value === 'string' &&
  value.length === 40 &&
  /^[a-f0-9]{40}$/.test(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

function check(condition, message) {
  if (!condition) {
    throw new Error(
      `${message}. Rerun version-packages.yml on main; do not update or rebase the managed branch.`
    );
  }
}

// Run ONLY from trusted main/base-SHA code, before any candidate execution.
// Requires contents:read, actions:read, pull-requests:read. No writes/downloads.
// The authenticated main producer registers H in the exact artifact NAME after
// checking its single parent S. Receipt contents are not needed for this guard.
async function validateVersionCandidate({
  github,
  context,
  sleep = sleepDefault,
}) {
  check(
    ['pull_request', 'pull_request_target'].includes(context.eventName),
    'Expected pull_request or pull_request_target'
  );
  const pr = context.payload.pull_request;
  const repositoryId = context.payload.repository?.id;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const sameRepo = repo =>
    repo?.id === repositoryId && repo?.full_name === repository;
  const managedPr = value =>
    value?.state === 'open' &&
    value.head?.ref === BRANCH &&
    value.base?.ref === 'main' &&
    sameRepo(value.head.repo) &&
    sameRepo(value.base.repo);
  check(positiveInteger(repositoryId), 'Invalid event repository ID');
  check(managedPr(pr), 'Expected an open same-repository managed PR to main');
  const number = pr.number;
  const candidateSha = pr.head.sha;
  const baseSha = pr.base.sha;
  check(positiveInteger(number), 'Invalid PR number');
  check(
    isSha(candidateSha) && isSha(baseSha),
    'Expected full candidate and base commit SHAs'
  );
  const { data: file } = await github.rest.repos.getContent({
    ...context.repo,
    path: '.release-candidate.json',
    ref: candidateSha,
  });
  check(
    file?.type === 'file' &&
      file.encoding === 'base64' &&
      typeof file.content === 'string',
    'Missing committed candidate registration'
  );
  let registration;
  try {
    registration = JSON.parse(Buffer.from(file.content, 'base64').toString());
  } catch {
    check(false, 'Invalid candidate registration JSON');
  }
  check(
    registration?.schemaVersion === 1 &&
      isSha(registration.sourceSha) &&
      positiveInteger(registration.preparationRunId) &&
      positiveInteger(registration.preparationRunAttempt),
    'Invalid candidate registration schema'
  );
  const {
    sourceSha,
    preparationRunId: runId,
    preparationRunAttempt: runAttempt,
  } = registration;
  const { data: commit } = await github.rest.repos.getCommit({
    ...context.repo,
    ref: candidateSha,
  });
  check(
    commit.sha === candidateSha &&
      candidateSha !== sourceSha &&
      commit.parents?.length === 1 &&
      commit.parents[0].sha === sourceSha,
    'Candidate must have exactly one parent: preparation source S'
  );
  const { data: comparison } = await github.rest.repos.compareCommits({
    ...context.repo,
    base: sourceSha,
    head: baseSha,
  });
  check(
    ['ahead', 'identical'].includes(comparison.status),
    'Preparation source is not an ancestor of PR base main'
  );

  // Nineteen reads with ten-second sleeps allow a quick close/reopen to race
  // the upload/job completion for ~3 minutes. Reauthenticate every observed run.
  // Only the pinned attempt's `version` job registers H; the release build jobs
  // that follow in the same run (and any rerun of them, which starts a new
  // attempt) neither delay nor invalidate the candidate.
  for (let poll = 0; poll <= 18; poll++) {
    const { data: run } = await github.rest.actions.getWorkflowRunAttempt({
      ...context.repo,
      run_id: runId,
      attempt_number: runAttempt,
    });
    check(
      run.id === runId &&
        run.repository?.id === repositoryId &&
        run.head_repository?.id === repositoryId &&
        run.event === 'workflow_dispatch' &&
        run.path === WORKFLOW &&
        run.head_branch === 'main' &&
        run.head_sha === sourceSha &&
        run.run_attempt === runAttempt,
      'Preparation run does not match the trusted main workflow and attempt'
    );
    const {
      data: { jobs = [] },
    } = await github.rest.actions.listJobsForWorkflowRunAttempt({
      ...context.repo,
      run_id: runId,
      attempt_number: runAttempt,
      per_page: 100,
    });
    const versionJobs = jobs.filter(job => job.name === VERSION_JOB);
    check(versionJobs.length <= 1, 'Ambiguous preparation version jobs');
    const version = versionJobs[0];
    if (version?.status === 'completed') {
      check(
        version.conclusion === 'success',
        'Preparation run did not succeed'
      );
      const artifacts = await github.paginate(
        github.rest.actions.listWorkflowRunArtifacts,
        { ...context.repo, run_id: runId, per_page: 100 }
      );
      const matches = artifacts.filter(
        artifact => artifact.name === `version-candidate-${candidateSha}`
      );
      check(matches.length <= 1, 'Ambiguous candidate registration artifacts');
      if (matches.length === 1) {
        const artifact = matches[0];
        check(
          positiveInteger(artifact.id) && artifact.expired === false,
          'Invalid or expired candidate registration artifact'
        );
        check(
          !artifact.workflow_run ||
            (artifact.workflow_run.id === runId &&
              artifact.workflow_run.head_sha === sourceSha),
          'Candidate artifact workflow metadata does not match preparation'
        );
        const { data: current } = await github.rest.pulls.get({
          ...context.repo,
          pull_number: number,
        });
        check(
          managedPr(current) &&
            current.number === number &&
            current.head.sha === candidateSha,
          'Managed PR changed while waiting for candidate registration'
        );
        return { artifactId: artifact.id, runId, candidateSha, sourceSha };
      }
    }
    if (poll < 18) await sleep(10_000);
  }
  check(
    false,
    'Timed out waiting for successful preparation and exact candidate artifact'
  );
}

module.exports = { validateVersionCandidate };
