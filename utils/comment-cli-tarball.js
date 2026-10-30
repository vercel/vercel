const path = require('node:path');
const { getPythonPackages } = require('./get-python-packages');
const {
  validateDeploymentUrl,
  validatePackage,
  validateWheelMetadata,
} = require('./resolve-python-wheel-env');

const heading = '## 📦 CLI Tarball Ready';
const marker = '<!-- vercel-cli-tarball -->';

// GitHub's deployment-status API is eventually consistent: the deployment
// and its "success" status for a commit can appear a little while after the
// preview itself is ready. Poll for up to this long before giving up so an
// early repository_dispatch doesn't fail purely on that timing race, while a
// commit whose deployment genuinely never succeeds still errors out once the
// deadline passes.
const DEFAULT_DEPLOYMENT_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS = 15 * 1000;

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isVercelCreator(creator) {
  return (
    creator?.id === 35613825 &&
    creator.login === 'vercel[bot]' &&
    creator.type === 'Bot'
  );
}

function isCurrentPr(pull, sha) {
  return (
    Number.isSafeInteger(pull?.number) &&
    pull.number > 0 &&
    pull.state === 'open' &&
    pull.base?.repo?.full_name === 'vercel/vercel-internal' &&
    pull.head?.sha === sha &&
    pull.title !== 'Version Packages'
  );
}

async function hasVerifiedDeployment(github, repo, sha, origin) {
  const deployments = await github.paginate(github.rest.repos.listDeployments, {
    ...repo,
    sha,
    per_page: 100,
  });
  for (const deployment of deployments) {
    if (
      deployment.sha !== sha ||
      !isVercelCreator(deployment.creator) ||
      !Number.isSafeInteger(deployment.id) ||
      deployment.id <= 0
    )
      continue;
    const statuses = await github.paginate(
      github.rest.repos.listDeploymentStatuses,
      { ...repo, deployment_id: deployment.id, per_page: 100 }
    );
    if (
      statuses.some(status => {
        if (status.state !== 'success' || !isVercelCreator(status.creator))
          return false;
        try {
          return validateDeploymentUrl(status.environment_url) === origin;
        } catch {
          return false;
        }
      })
    )
      return true;
  }
  return false;
}

async function verifyDeployment(
  github,
  repo,
  sha,
  origin,
  {
    timeoutMs = DEFAULT_DEPLOYMENT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS,
    sleep = defaultSleep,
    now = Date.now,
  } = {}
) {
  const deadline = now() + timeoutMs;
  for (;;) {
    if (await hasVerifiedDeployment(github, repo, sha, origin)) return;
    const remainingMs = deadline - now();
    // Bounded wait: keep polling only while time remains, so a deployment
    // that never succeeds still fails once the deadline passes instead of
    // retrying forever.
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
  throw new Error(
    'Preview URL is not a verified Vercel deployment for this commit.'
  );
}

async function buildComment(origin, packages, fetchImpl) {
  let message = `${marker}\n${heading}\n\n`;
  message += 'The Vercel CLI tarball for this PR is now available!\n\n';
  message += '### Quick Test\n\n';
  message += "You can test this PR's CLI directly by running:\n\n";
  message += `\`\`\`bash\nnpx ${origin}/tarballs/vercel.tgz --help\n\`\`\`\n\n`;
  message += '### Use in vercel.json\n\n';
  message +=
    'To use this CLI version in your project builds, add to your `vercel.json`:\n\n';
  message += '```json\n';
  message += JSON.stringify(
    {
      build: {
        env: { VERCEL_CLI_VERSION: `vercel@${origin}/tarballs/vercel.tgz` },
      },
    },
    null,
    2
  );
  message += '\n```\n';

  // Descriptors and tooling come from the trusted workflow commit, not the PR.
  for (const entry of packages) {
    const pkg = validatePackage(entry);
    if (
      typeof pkg.title !== 'string' ||
      pkg.title.length > 100 ||
      pkg.title.match(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/)?.[0] !== pkg.title
    )
      throw new Error('Invalid Python package title');
    const response = await fetchImpl(
      `${origin}/tarballs/${pkg.packageDir}-wheel.json`,
      { redirect: 'error', signal: AbortSignal.timeout(15000) }
    );
    if (response.status === 404) continue;
    if (!response.ok) throw new Error('Python wheel metadata request failed');
    const filename = validateWheelMetadata(await response.json());
    message += `\n### Python ${pkg.title} Wheel\n\n`;
    message += `A \`${pkg.packageName}\` wheel was also built for this PR.\n`;
    message +=
      'To use in your Python project builds, also set this environment variable:\n\n';
    message += `\`\`\`\n${pkg.envName}="${pkg.packageName} @ ${origin}/tarballs/${filename}"\n\`\`\`\n`;
  }
  return `${message}\n---\n*This comment is automatically generated*`;
}

async function commentCliTarball({
  github,
  context,
  core,
  fetchImpl = fetch,
  getPackages = () => getPythonPackages(path.resolve(__dirname, '..')),
  deploymentTimeoutMs,
  deploymentPollIntervalMs,
  sleep,
  now,
}) {
  if (
    context.eventName !== 'repository_dispatch' ||
    context.repo.owner !== 'vercel' ||
    context.repo.repo !== 'vercel-internal' ||
    context.payload.client_payload?.environment !== 'preview'
  )
    return;
  const payload = context.payload.client_payload;
  const sha = payload.git?.sha;
  if (
    typeof sha !== 'string' ||
    sha.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(sha)
  ) {
    throw new Error('Invalid preview commit SHA');
  }
  const origin = validateDeploymentUrl(payload.url);
  const repo = context.repo;
  const pulls = await github.paginate(
    github.rest.repos.listPullRequestsAssociatedWithCommit,
    { ...repo, commit_sha: sha, per_page: 100 }
  );
  const candidates = pulls.filter(pull => isCurrentPr(pull, sha));
  if (candidates.length === 0) {
    core.info('No current open PR for this preview; skipping tarball comment.');
    return;
  }

  await verifyDeployment(github, repo, sha, origin, {
    timeoutMs: deploymentTimeoutMs,
    pollIntervalMs: deploymentPollIntervalMs,
    sleep,
    now,
  });
  // All metadata is validated before any comment is created or updated.
  const body = await buildComment(origin, getPackages(), fetchImpl);
  for (const candidate of candidates) {
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...repo,
      issue_number: candidate.number,
      per_page: 100,
    });
    const { data: current } = await github.rest.pulls.get({
      ...repo,
      pull_number: candidate.number,
    });
    if (current.number !== candidate.number || !isCurrentPr(current, sha)) {
      core.info(
        'PR changed while preparing the comment; skipping stale preview.'
      );
      continue;
    }
    const existing = comments.find(
      comment =>
        comment.user?.login === 'github-actions[bot]' &&
        comment.user.type === 'Bot' &&
        typeof comment.body === 'string' &&
        (comment.body.includes(marker) || comment.body.includes(heading))
    );
    if (existing) {
      await github.rest.issues.updateComment({
        ...repo,
        comment_id: existing.id,
        body,
      });
    } else {
      await github.rest.issues.createComment({
        ...repo,
        issue_number: candidate.number,
        body,
      });
    }
  }
}

module.exports = { commentCliTarball };
