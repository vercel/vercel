const assert = require('assert').strict;

async function test({ path, contentType, deploymentUrl, fetch }) {
  const res = await fetch(`https://${deploymentUrl}/${path}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), contentType);
  console.log(`Finished testing "${path}" probe.`);
}

module.exports = async ({ deploymentUrl, fetch }) => {
  await test({
    path: '/index.json',
    contentType: 'application/json; charset=utf-8',
    deploymentUrl,
    fetch,
  });
  await test({
    path: '/about.png',
    contentType: 'image/png',
    deploymentUrl,
    fetch,
  });
};
