module.exports = async ({ github, context }) => {
  await github.rest.actions.createWorkflowDispatch({
    owner: context.repo.owner,
    repo: 'api',
    workflow_id: 'cron-update-build-container.yml',
    ref: 'main',
  });
};
