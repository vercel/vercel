const ENVIRONMENTS = ['release-canary', 'release-latest'];

function gateError(name, reason, cause) {
  return new Error(
    `DRY RUN ${name}: ${reason}. In Settings > Environments, configure required reviewers with administrator bypass disabled, and selected deployment branches and tags allowing only the branch main (no tags or wildcards).`,
    { cause }
  );
}

async function readGate(name, read) {
  try {
    return await read();
  } catch (error) {
    throw gateError(
      name,
      error.status === 404
        ? 'Environment or branch policy not found or inaccessible (HTTP 404); an administrator must set it up before running release-dry-run.yml'
        : `Cannot verify approval gate (HTTP ${error.status ?? 'unknown'}: ${error.message}); check API read access`,
      error
    );
  }
}

async function assertDryRunEnvironments({ github, context, core }) {
  if (
    context.eventName !== 'workflow_dispatch' ||
    context.ref !== 'refs/heads/main'
  ) {
    throw gateError(
      ENVIRONMENTS.join(', '),
      'release-dry-run.yml must run manually via workflow_dispatch on refs/heads/main'
    );
  }

  for (const name of ENVIRONMENTS) {
    const args = { ...context.repo, environment_name: name };
    const { data } = await readGate(name, () =>
      github.rest.repos.getEnvironment(args)
    );
    const review = data?.protection_rules?.find(
      rule => rule.type === 'required_reviewers'
    );
    if (!Array.isArray(review?.reviewers) || review.reviewers.length === 0) {
      throw gateError(name, 'Missing required reviewers');
    }
    if (data.can_admins_bypass !== false) {
      throw gateError(name, 'Administrator bypass must be disabled');
    }

    const policy = data.deployment_branch_policy;
    if (
      policy?.custom_branch_policies !== true ||
      policy?.protected_branches !== false
    ) {
      throw gateError(
        name,
        'Missing selected, main-only deployment restrictions'
      );
    }

    const branches = await readGate(name, () =>
      github.paginate(github.rest.repos.listDeploymentBranchPolicies, {
        ...args,
        per_page: 100,
      })
    );
    if (
      branches.length !== 1 ||
      branches[0].name !== 'main' ||
      branches[0].type !== 'branch'
    ) {
      throw gateError(
        name,
        'Deployment policies must contain exactly branch main'
      );
    }
  }

  core.info(
    `DRY RUN ${ENVIRONMENTS.join(', ')}: required reviewers, no administrator bypass, and main-only deployment policies verified.`
  );
}

module.exports = { ENVIRONMENTS, assertDryRunEnvironments };
