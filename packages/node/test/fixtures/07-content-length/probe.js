const { strictEqual } = require('assert');

async function test3({ deploymentUrl, fetch, randomness }) {
  const bodyMustBe = `${randomness}:content-length`;
  const resp = await fetch(`https://${deploymentUrl}/test3.js`);
  strictEqual(resp.status, 401);
  strictEqual(await resp.text(), bodyMustBe);
  strictEqual(resp.headers.get('content-length'), String(bodyMustBe.length));
}

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  await test3({ deploymentUrl, fetch, randomness });
};
