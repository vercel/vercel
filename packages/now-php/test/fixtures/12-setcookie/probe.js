const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp = await fetch(`https://${deploymentUrl}/index.php`);
  assert(resp.status === 200);
  assert.equal(resp.headers.get('content-type'), 'text/plain; charset=UTF-16');
  assert(resp.headers.get('set-cookie').includes('cookie1=cookie1value'));
  assert(resp.headers.get('set-cookie').includes('cookie2=cookie2value'));
};
