const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch, randomness }) => {
  const resp = await fetch(`https://${deploymentUrl}/`);
  assert.equal(resp.headers.get('content-type'), null);
  assert.equal(await resp.text(), randomness);
};
