const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Each service pins Ruby with a different version file format.
const versionFiles = {
  red: '.ruby-version',
  blue: '.tool-versions',
};

module.exports = async ({ deploymentUrl, fetch }) => {
  const origin = `https://${deploymentUrl}`;
  for (const service of ['red', 'blue']) {
    const rubyVersion = readFileSync(
      join(__dirname, 'services', service, versionFiles[service]),
      'utf8'
    )
      .replace(/^ruby\s+/, '')
      .trim();
    for (const suffix of ['', '/', '/health', '/missing']) {
      const path = suffix || '/';
      const response = await fetch(`${origin}/${service}${suffix}`);
      assert.equal(response.status, suffix === '/missing' ? 404 : 200);
      assert.equal(response.headers.get('content-type'), 'application/json');
      assert.equal(response.headers.get('x-ruby-fixture'), service);
      assert.deepEqual(await response.json(), {
        service,
        path,
        ruby_version: rubyVersion,
      });
    }
  }

  // An application 404 still carries its identity; these must be router 404s.
  for (const path of [
    '/container',
    '/services/red/container',
    '/services/blue/container',
  ]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('x-ruby-fixture'), null, path);
  }
};
