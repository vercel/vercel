const assert = require('assert');

async function test1({ deploymentUrl, fetch, randomness }) {
  const bodyMustBe = `${randomness}:content-length`;
  const resp = await fetch(`https://${deploymentUrl}/test1.js`);
  assert.equal(resp.status, 401);
  assert.equal(resp.headers.get('content-length'), bodyMustBe.length);
  assert.equal(await resp.text(), bodyMustBe);
}

async function test2({ deploymentUrl, fetch }) {
  const resp = await fetch(`https://${deploymentUrl}/test2.js`);
  assert.equal(resp.status, 502);
}

async function test3({ deploymentUrl, fetch, randomness }) {
  const bodyMustBe = `${randomness}:content-length`;
  const resp = await fetch(`https://${deploymentUrl}/test3.js`);
  assert.equal(resp.status, 401);
  assert.equal(resp.headers.get('content-length'), null);
  assert.equal(await resp.text(), bodyMustBe);
}

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  await test1({ deploymentUrl, fetch, randomness });
  await test2({ deploymentUrl, fetch, randomness });
  await test3({ deploymentUrl, fetch, randomness });
};
