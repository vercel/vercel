const assert = require('assert');

async function test1({ deploymentUrl, fetch }) {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php?paramA=foo&paramA=bar&paramB[]=bim&paramB[]=bom`,
  );
  assert(resp.status === 200);
  const text = await resp.text();
  const lines = text.trim().split('\n');

  assert.deepEqual(lines, [
    '/var/task/user/index.php',
    'GET',
    '/index.php?paramB%5B%5D=bim&paramB%5B%5D=bom&paramA=foo&paramA=bar', // TODO fake news, must be unescaped, also TODO why paramA is last?
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '443',
    'on',
    'bar',
    'array(2) {',
    '  [0]=>',
    '  string(3) "bim"',
    '  [1]=>',
    '  string(3) "bom"',
    '}',
    '',
    'NULL',
    'end',
  ]);
}

async function test2({ deploymentUrl, fetch }) {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php`, {
      method: 'POST',
      body: 'paramC=foo&paramC=bar&paramD[]=bim&paramD[]=bom',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  assert(resp.status === 200);
  const text = await resp.text();
  const lines = text.trim().split('\n');

  assert.deepEqual(lines, [
    '/var/task/user/index.php',
    'POST',
    '/index.php',
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '443',
    'on',
    '',
    'NULL',
    'bar',
    'array(2) {',
    '  [0]=>',
    '  string(3) "bim"',
    '  [1]=>',
    '  string(3) "bom"',
    '}',
    'end',
  ]);
}

module.exports = async (opts) => {
  await test1(opts);
  await test2(opts);
};
