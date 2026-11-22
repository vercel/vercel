const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// The railties welcome page, rendered in production through an explicit root
// route. It reports the Rails and Ruby versions the image actually runs.
module.exports = async ({ deploymentUrl, fetch }) => {
  const origin = `https://${deploymentUrl}`;
  const rubyVersion = readFileSync(join(__dirname, 'mise.toml'), 'utf8').match(
    /^ruby = "([^"]+)"/m
  )[1];
  const railsVersion = readFileSync(join(__dirname, 'Gemfile'), 'utf8').match(
    /^gem "railties", "([^"]+)"/m
  )[1];

  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html\b/);
  const html = await response.text();
  assert.ok(html.includes(`<title>Ruby on Rails ${railsVersion}</title>`));
  assert.ok(html.includes('alt="Ruby on Rails Logo"'));
  assert.ok(html.includes(`Rails version:</strong> ${railsVersion}`));
  // RUBY_DESCRIPTION, e.g. "ruby 3.4.1 (2024-12-25 revision ...) [x86_64-linux]"
  assert.ok(html.includes(`Ruby version:</strong> ruby ${rubyVersion} (`));

  // Unknown paths are application 404s, not a crashed process.
  const missing = await fetch(`${origin}/missing`);
  assert.equal(missing.status, 404);
};
