const assert = require('assert').strict;

async function tryTest({ path, status, deploymentUrl, fetch }) {
  const res = await fetch(`https://${deploymentUrl}${path}`);
  assert.equal(res.status, status);
  console.log(`Finished testing "${path}" probe.`);
}

module.exports = async ({ deploymentUrl, fetch }) => {
  await tryTest({ path: '/example.html', status: 200, deploymentUrl, fetch });
  await tryTest({ path: '/output.html', status: 200, deploymentUrl, fetch });
  await tryTest({
    path: '/node_modules/copee/package.json',
    status: 404,
    deploymentUrl,
    fetch,
  });
  await tryTest({ path: '/.git/HEAD', status: 404, deploymentUrl, fetch });
  await tryTest({ path: '/.env', status: 404, deploymentUrl, fetch });
  await tryTest({ path: '/yarn.lock', status: 404, deploymentUrl, fetch });
  await tryTest({
    path: '/package-lock.json',
    status: 404,
    deploymentUrl,
    fetch,
  });
  await tryTest({ path: '/package.json', status: 404, deploymentUrl, fetch });
};
