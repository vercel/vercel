const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php?paramA=foo&paramB[]=bar&paramB[]=baz&paramC=bin&paramC=bon`,
  );
  assert(resp.status === 200);
  const text = await resp.text();
  const lines = text.trim().split('\n');

  assert.deepEqual(lines, [
    '/var/task/user/index.php',
    '/index.php?paramB%5B%5D=bar&paramB%5B%5D=baz&paramC=bin&paramC=bon&paramA=foo', // TODO fake news, must be unescaped, also TODO why paramA is last?
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '443',
    'on',
    'foo',
    'NULL', // TODO fake news, must be:
    //   array(2) {
    //     [0]=>
    //     string(3) "bar"
    //     [1]=>
    //     string(3) "baz"
    //   }
    'bon',
  ]);
};
