/**
 * Dispatch release-binary.yml as a top-level workflow_dispatch (so npm
 * trusted publishing sees workflow filename `release-binary.yml`) and wait
 * until that run finishes successfully.
 *
 * Used from Release before publishing vercel, so @vercel/vc-native* packages
 * exist on npm for optionalDependencies injection.
 */
module.exports = async ({ github, context, core }) => {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const workflowId = 'release-binary.yml';
  const sha = context.sha;
  // createWorkflowDispatch only accepts a branch or tag name — not a SHA.
  const branch =
    context.ref?.replace(/^refs\/heads\//, '') ||
    context.payload?.ref?.replace(/^refs\/heads\//, '') ||
    'main';
  const dispatchedAt = Date.now();

  core.info(
    `Dispatching ${workflowId} on branch ${branch} (inputs.ref=${sha}) for natives-first publish`
  );

  await github.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: workflowId,
    ref: branch,
    inputs: {
      // Checkout / build this SHA (versioned package.json, no tag yet).
      ref: sha,
      tag: '',
    },
  });

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  let run = null;
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    await sleep(5000);
    const { data } = await github.rest.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
      event: 'workflow_dispatch',
      branch,
      per_page: 20,
    });

    run = data.workflow_runs.find(
      candidate =>
        candidate.head_sha === sha &&
        new Date(candidate.created_at).getTime() >= dispatchedAt - 15_000
    );

    if (run) {
      core.info(`Found dispatched run ${run.id} (${run.html_url})`);
      break;
    }
    core.info(`Waiting for dispatched run to appear (${attempt}/36)...`);
  }

  if (!run) {
    core.setFailed(
      `Timed out waiting for ${workflowId} workflow_dispatch run for ${sha}`
    );
    return;
  }

  // Darwin/linux binary builds can take a while; keep headroom.
  const maxPollAttempts = 150; // 150 * 60s = 2.5h
  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    const { data: current } = await github.rest.actions.getWorkflowRun({
      owner,
      repo,
      run_id: run.id,
    });

    core.info(
      `Binary run ${run.id}: status=${current.status} conclusion=${current.conclusion || 'n/a'} (${attempt}/${maxPollAttempts})`
    );

    if (current.status === 'completed') {
      if (current.conclusion === 'success') {
        core.info(`Binary release succeeded: ${current.html_url}`);
        return;
      }
      core.setFailed(
        `Binary release finished with conclusion=${current.conclusion}: ${current.html_url}`
      );
      return;
    }

    await sleep(60_000);
  }

  core.setFailed(
    `Timed out waiting for binary release run ${run.id} to complete`
  );
};
