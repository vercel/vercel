const assert = require('assert').strict;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function tryTest({
  pathname,
  deploymentUrl,
  fetch,
  randomness,
  retries = 4,
}) {
  try {
    const res = await fetch(`https://${deploymentUrl}${pathname}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    console.log(`Finished testing "${pathname}" probe.`);
  } catch (e) {
    if (retries === 0) {
      console.error(e);
      throw e;
    }
    console.log(`Failed "${pathname}" probe. Retries remaining: ${retries}`);
    await sleep(100);
    await tryTest({
      pathname,
      deploymentUrl,
      fetch,
      randomness,
      retries: retries - 1,
    });
  }
}

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  await tryTest({
    pathname: '/api/og',
    deploymentUrl,
    fetch,
    randomness,
  });
};
