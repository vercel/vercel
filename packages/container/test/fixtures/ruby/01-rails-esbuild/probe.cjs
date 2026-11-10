const assert = require('node:assert/strict');

module.exports = async ({ deploymentUrl, fetch }) => {
  const origin = `https://${deploymentUrl}`;
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json\b/);
  const { asset_path, ...status } = await response.json();
  assert.deepEqual(status, {
    message: 'hello from the esbuild Rails fixture',
    bundled_asset: true,
    rails_env: 'production',
    rack_env: 'production',
    rails_serve_static_files: 'true',
    bundle_without: ['development', 'test'],
    node_modules: false,
    dummy_secret: false,
  });
  assert.match(asset_path, /^\/assets\/application-[a-f0-9]+\.js$/);

  const asset = await fetch(`${origin}${asset_path}`);
  assert.equal(asset.status, 200);
  assert.match(
    asset.headers.get('content-type'),
    /^(?:text|application)\/javascript\b/
  );
  assert.ok((await asset.text()).includes('esbuild-bundled-asset'));
};
