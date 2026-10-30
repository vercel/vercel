const BRANCH = 'manual-version-packages';

function assertSha(sha) {
  if (
    typeof sha !== 'string' ||
    sha.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(sha)
  ) {
    throw new Error('Expected a full commit SHA');
  }
}

async function resolveTestContext({ github, context, core }) {
  if (!['pull_request', 'pull_request_target'].includes(context.eventName)) {
    throw new Error(
      'Unsupported event; expected pull_request or pull_request_target'
    );
  }
  const pr = context.payload.pull_request;
  assertSha(pr?.base?.sha);
  assertSha(pr?.head?.sha);
  // Classification only, not authorization. Titles/authors are never trusted.
  const isManual = pr.head.ref === BRANCH;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  if (
    isManual &&
    (pr.state !== 'open' ||
      pr.base.ref !== 'main' ||
      pr.head.repo?.full_name !== repository ||
      pr.base.repo?.full_name !== repository)
  ) {
    throw new Error('Invalid managed PR; rerun version-packages.yml on main');
  }
  const outputs = {
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    headRef: pr.head.ref,
    isManual: String(isManual),
  };
  for (const [name, value] of Object.entries(outputs)) {
    core.setOutput(name, value);
  }
  return outputs;
}

module.exports = { resolveTestContext };
