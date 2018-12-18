const assert = require('assert');

async function test1({ deploymentUrl, fetch }) {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php?get1=foo&get1=bar&get2[]=bim&get2[]=bom`, {
      headers: {
        'X-Some-Header': 'x-some-header-value',
      },
    },
  );
  assert(resp.status === 200);
  const text = await resp.text();
  const lines = text.trim().split('\n');

  assert.deepEqual(lines, [
    '/var/task/user/index.php',
    'GET',
    '/index.php?get1=foo&get1=bar&get2%5B%5D=bim&get2%5B%5D=bom', // TODO fake news, must be unescaped
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    'x-some-header-value',
    'HTTP/1.1',
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
    '',
    'NULL',
    'bar',
    'array(2) {',
    '  [0]=>',
    '  string(3) "bim"',
    '  [1]=>',
    '  string(3) "bom"',
    '}',
    '',
    'NULL',
    '',
    'NULL',
    '',
    'end',
  ]);
}

async function test2({ deploymentUrl, fetch }) {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php`, {
      method: 'POST',
      body: 'post1=baz&post1=bat&post2[]=pim&post2[]=pom',
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
    '',
    'HTTP/1.1',
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '443',
    'on',
    '',
    'NULL',
    'bat',
    'array(2) {',
    '  [0]=>',
    '  string(3) "pim"',
    '  [1]=>',
    '  string(3) "pom"',
    '}',
    '',
    'NULL',
    '',
    'NULL',
    'bat',
    'array(2) {',
    '  [0]=>',
    '  string(3) "pim"',
    '  [1]=>',
    '  string(3) "pom"',
    '}',
    '',
    'NULL',
    'post1=baz&post1=bat&post2[]=pim&post2[]=pom',
    'end',
  ]);
}

async function test3({ deploymentUrl, fetch }) {
  const resp = await fetch(
    `https://${deploymentUrl}/index.php`, {
      method: 'GET',
      headers: {
        Cookie: `cookie1=foo; cookie1=${escape('bar|bar')}; ${escape('cookie2[]')}=dim; ${escape('cookie2[]')}=${escape('dom|dom')}`,
      },
    },
  );
  assert(resp.status === 200);
  const text = await resp.text();
  const lines = text.trim().split('\n');

  assert.deepEqual(lines, [
    '/var/task/user/index.php',
    'GET',
    '/index.php',
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '',
    'HTTP/1.1',
    deploymentUrl, // example 'test-19phw91ph.now.sh'
    '443',
    'on',
    '',
    'NULL',
    '',
    'NULL',
    'foo',
    'array(2) {',
    '  [0]=>',
    '  string(3) "dim"',
    '  [1]=>',
    '  string(7) "dom|dom"',
    '}',
    '',
    'NULL',
    '',
    'NULL',
    'foo',
    'array(2) {',
    '  [0]=>',
    '  string(3) "dim"',
    '  [1]=>',
    '  string(7) "dom|dom"',
    '}',
    '',
    'end',
  ]);
}

module.exports = async (opts) => {
  await test1(opts);
  await test2(opts);
  await test3(opts);
};
