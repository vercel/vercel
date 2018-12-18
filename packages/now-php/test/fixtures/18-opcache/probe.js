const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp = await fetch(`https://${deploymentUrl}/index.php`);
  assert.equal(await resp.text(), 'bool(true)\n');
};
