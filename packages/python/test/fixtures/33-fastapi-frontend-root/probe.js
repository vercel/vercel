const { makeProbeHelpers, withLocalServer } = require('../../fastapi-probe-helpers');

async function runProbes(helpers) {
  const { expectCdnHit, expectBody, expectRedirect } = helpers;

  // The root frontend serves its index and assets from the CDN.
  await expectCdnHit('root index', '/', { status: 200, contains: 'ROOT_INDEX', headers: { accept: 'text/html' } });
  await expectCdnHit('asset', '/asset.txt', { status: 200, contains: 'FRONTEND_ASSET' });

  // A route declared before the root frontend owns the exact path; the
  // low-priority frontend is never consulted, so HEAD (GET-only route) and POST
  // are method mismatches (405) rather than the frontend file.
  await expectBody('route wins', '/collision.txt', { status: 200, contains: 'API_ROUTE_WON' });
  await expectBody('route HEAD', '/collision.txt', { method: 'HEAD', status: 405 });
  await expectBody('route POST', '/collision.txt', { method: 'POST', status: 405 });

  // A StaticFiles mount outranks the root frontend at the shared CDN path, so
  // the mount file wins over the frontend's colliding file.
  await expectCdnHit('mount beats frontend', '/static/collision.txt', { status: 200, contains: 'STATIC_MOUNT_WON' });

  // A nested index directory under the root: the bare form 307s (Lambda), the
  // slash form and files stay on the CDN.
  await expectRedirect('subdir bare', '/guide', '/guide/');
  await expectCdnHit('subdir slash', '/guide/', { status: 200, contains: 'GUIDE_INDEX', headers: { accept: 'text/html' } });
  await expectCdnHit('subdir file', '/guide/asset.txt', { status: 200, contains: 'GUIDE_ASSET' });

  // A navigation miss anywhere under the root gets the index (the SPA
  // catch-all).
  await expectCdnHit('catch-all', '/deep/nested/miss', { status: 200, contains: 'ROOT_INDEX', headers: { accept: 'text/html' } });

  // FastAPI's own routes overlap the root frontend but must still reach the
  // Lambda rather than being hijacked by the fallback.
  await expectBody('docs not hijacked', '/docs', { status: 200, contains: 'swagger-ui', headers: { accept: 'text/html' } });
  await expectBody('openapi not hijacked', '/openapi.json', { status: 200, contains: 'openapi' });
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
