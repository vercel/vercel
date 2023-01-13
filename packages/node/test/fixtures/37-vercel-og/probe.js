const assert = require('assert').strict;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function tryTest({
  testName,
  deploymentUrl,
  fetch,
  randomness,
  retries = 4,
}) {
  try {
    const res = await fetch(`https://${deploymentUrl}${testName}`);
    assert.equal(res.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    console.log(`Finished testing "${testName}" probe.`);
  } catch (e) {
    if (retries === 0) {
      console.error(e);
      throw e;
    }
    console.log(`Failed "${testName}" probe. Retries remaining: ${retries}`);
    await sleep(100);
    await tryTest({
      testName,
      deploymentUrl,
      fetch,
      randomness,
      retries: retries - 1,
    });
  }
}

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  await tryTest({
    testName: '/api/og',
    deploymentUrl,
    fetch,
    randomness,
  });
};
