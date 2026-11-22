const { makeProbeHelpers, withLocalServer } = require('../../fastapi-probe-helpers');

async function runProbes(helpers) {
  const { expectCdnHit, expectBody, expectRedirect } = helpers;

  // A StaticFiles mount serves its files from the CDN. HEAD behaves like GET
  // (200); POST is not GET/HEAD, so the response is 405. html is disabled, so
  // the bare mount root 307s to the trailing slash and the slash itself 404s
  // (no directory index).
  await expectCdnHit('static file', '/static/index.html', { status: 200, contains: 'Hello World' });
  await expectBody('static HEAD', '/static/index.html', { method: 'HEAD', status: 200 });
  await expectBody('static POST', '/static/index.html', { method: 'POST', status: 405 });
  await expectRedirect('static mount root', '/static', '/static/');
  await expectBody('static mount slash', '/static/', { status: 404 });

  // A frontend serves its files from the CDN.
  await expectCdnHit('frontend asset', '/frontend/asset.txt', { status: 200, contains: 'FRONTEND_ASSET' });

  // A frontend discovered through an included router prefix serves from the CDN.
  await expectCdnHit('nested router frontend', '/nested/router.txt', { status: 200, contains: 'ROUTER_FRONTEND_FILE' });
}

module.exports = async ({ deploymentUrl, fetch, pythonBin }) => {
  const failures = [];
  const state = { base: '', isLocal: false, fetch };
  const helpers = makeProbeHelpers(state, failures);

  if (pythonBin) {
    await withLocalServer(pythonBin, __dirname, fetch, '/docs', async base => {
      state.base = base; state.isLocal = true;
      await runProbes(helpers);
    });
  }

  if (deploymentUrl) {
    state.base = `https://${deploymentUrl}`; state.isLocal = false;
    await runProbes(helpers);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
