const assert = require('assert');

async function test1({ deploymentUrl, fetch, randomness }) {
  const bodyMustBe = `${randomness}:content-length`;
  const resp = await fetch(`https://${deploymentUrl}/test1.js`);
  assert.equal(resp.status, 401);
  assert.equal(await resp.text(), bodyMustBe);
  assert.equal(resp.headers.get('content-length'), bodyMustBe.length);
}

async function test2({ deploymentUrl, fetch }) {
  const bodyMustBe = '';
  const resp = await fetch(`https://${deploymentUrl}/test2.js`);
  assert.equal(resp.status, 401);
  assert.equal(await resp.text(), bodyMustBe);
  assert.equal(resp.headers.get('content-length'), bodyMustBe.length);
}

async function test3({ deploymentUrl, fetch, randomness }) {
  const bodyMustBe = `${randomness}:content-length`;
  const resp = await fetch(`https://${deploymentUrl}/test3.js`);
  assert.equal(resp.status, 401);
  assert.equal(await resp.text(), bodyMustBe);
  assert.equal(resp.headers.get('content-length'), bodyMustBe.length);
}

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  await test1({ deploymentUrl, fetch, randomness });
  await test2({ deploymentUrl, fetch, randomness });
  await test3({ deploymentUrl, fetch, randomness });
};
