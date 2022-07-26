const fetch = require('node-fetch');

module.exports = async function fetchVercelCliTarball() {
  const sha = process.env.GITHUB_HEAD_SHA;
  if (!sha) {
    throw new Error('Please provide GITHUB_HEAD_SHA env var');
  }

  const res1 = await fetch(
    `https://api.github.com/repos/vercel/vercel/deployments?sha=${sha}`
  );
  const deployments = await res1.json();
  const deployment = deployments[0];
  if (!deployment) {
    throw new Error(
      `Failed to find deployment for sha "${sha}": ${deployments}`
    );
  }
  const res2 = await fetch(deployment.statuses_url);
  const statuses = await res2.json();
  const status = statuses[0];
  if (!status) {
    throw new Error(`Failed to find status for sha "${sha}": ${deployments}`);
  }
  return status.target_url;
};
