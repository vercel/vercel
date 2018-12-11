const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp1 = await fetch(`https://${deploymentUrl}/index.php`);
  assert.equal(await resp1.text(), 'paskantamasaari');
  const resp2 = await fetch(`https://${deploymentUrl}/index.php`);
  assert.equal(await resp2.text(), 'paskantamasaari');
};
