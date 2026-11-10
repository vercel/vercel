// Find the merged version PR, its exact candidate commit H, and the release
// payloads that Manual Version Packages (a trusted main run) built for H.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const branch = 'manual-version-packages';
const planPath = '.release-plan.json';
const preparationWorkflow = '.github/workflows/version-packages.yml';

export const get = async path =>
  JSON.parse((await exec('gh', ['api', path])).stdout);

async function list(get, path) {
  const all = [];
  for (let page = 1; ; page++) {
    const rows = await get(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`
    );
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

export async function resolveRelease({ get, repository, mergeSha }) {
  assert.match(mergeSha, /^[a-f0-9]{40}$/);
  const api = path => get(`repos/${repository}/${path}`);
  const candidates = (
    await list(get, `repos/${repository}/commits/${mergeSha}/pulls`)
  ).filter(pr => pr.head.ref === branch && pr.base.ref === 'main');
  if (!candidates.length) {
    // Ordinary main pushes are not releases. A merge that changes the plan is,
    // so a missing or lagging PR association must fail rather than skip.
    // Compare the plan blob on both sides; commit file lists stop at 300 files.
    const { parents = [] } = await api(`commits/${mergeSha}`);
    const planBlob = async ref => {
      try {
        return (await api(`contents/${planPath}?ref=${ref}`)).sha;
      } catch (error) {
        if (/HTTP 404/.test(`${error?.stderr ?? ''} ${error?.message ?? ''}`)) {
          return null;
        }
        throw error;
      }
    };
    const before = parents[0] ? await planBlob(parents[0].sha) : null;
    assert.equal(
      await planBlob(mergeSha),
      before,
      `${mergeSha} changes ${planPath} but no merged version PR was found; rerun once GitHub links the PR`
    );
    return null;
  }
  assert.equal(candidates.length, 1, 'Expected one version PR');

  const pr = await api(`pulls/${candidates[0].number}`);
  assert(
    pr.merged &&
      pr.merge_commit_sha === mergeSha &&
      pr.base.ref === 'main' &&
      pr.head.ref === branch &&
      pr.head.repo.full_name === repository,
    'Expected the merged same-repository version PR'
  );
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/);

  const content = await api(`contents/${planPath}?ref=${pr.head.sha}`);
  const plan = JSON.parse(
    Buffer.from(content.content, 'base64').toString('utf8')
  );
  const cli = plan.releases.find(p => p.name === 'vercel' && p.type !== 'none');
  const build = await findPreparationBuild({
    api,
    repository,
    candidateSha: pr.head.sha,
  });
  return {
    candidateSha: pr.head.sha,
    prNumber: pr.number,
    cliVersion: cli?.newVersion || '',
    preparationRunId: build.runId,
    payloadArtifactId: build.payloadId,
  };
}

// H commits .release-candidate.json with the Manual Version Packages run that
// created it. That run also built, assembled and checked H; release publishes
// only those files.
export async function findPreparationBuild({ api, repository, candidateSha }) {
  const receipt = await api(
    `contents/.release-candidate.json?ref=${candidateSha}`
  );
  const { preparationRunId: runId } = JSON.parse(
    Buffer.from(receipt.content, 'base64').toString('utf8')
  );
  assert(
    Number.isSafeInteger(runId) && runId > 0,
    `${candidateSha} has no preparation run ID; rerun Manual Version Packages`
  );
  const run = await api(`actions/runs/${runId}`);
  const { parents = [] } = await api(`commits/${candidateSha}`);
  assert(
    run.id === runId &&
      run.path === preparationWorkflow &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === 'main' &&
      run.repository?.full_name === repository &&
      parents.length === 1 &&
      run.head_sha === parents[0].sha,
    `Preparation run ${runId} is not Manual Version Packages on main for ${candidateSha}`
  );
  assert.equal(
    run.conclusion,
    'success',
    `The release build for ${candidateSha} is not ready (${run.status}/${run.conclusion}); wait for or rerun preparation run ${run.id}, then re-run this release`
  );
  const { artifacts: runArtifacts = [] } = await api(
    `actions/runs/${run.id}/artifacts?per_page=100`
  );
  const prefix = `release-payloads-${candidateSha}-attempt-`;
  const attempt = artifact => Number(artifact.name.slice(prefix.length));
  const payloads = runArtifacts
    .filter(
      artifact =>
        artifact.name.startsWith(prefix) &&
        !artifact.expired &&
        Number.isInteger(attempt(artifact))
    )
    .sort((a, b) => attempt(b) - attempt(a));
  assert(
    payloads.length,
    `Preparation run ${run.id} has no unexpired release payloads for ${candidateSha}; rerun Manual Version Packages`
  );
  return { runId: run.id, payloadId: payloads[0].id };
}

export async function main(env = process.env) {
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Releases run on main');
  const output = (name, value) =>
    appendFile(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  const release = await resolveRelease({
    get,
    repository: env.GITHUB_REPOSITORY,
    mergeSha: env.GITHUB_SHA,
  });
  if (!release) {
    await output('release', 'false');
    return;
  }
  await output('release', 'true');
  await output('candidate-sha', release.candidateSha);
  await output('cli-version', release.cliVersion);
  await output('preparation-run', release.preparationRunId);
  await output('payload-id', release.payloadArtifactId);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
