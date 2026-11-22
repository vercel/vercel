const { makeProbeHelpers } = require('../../fastapi-probe-helpers');

module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];
  const state = { base: `https://${deploymentUrl}`, isLocal: false, fetch };
  const { expectCdnHit, expectBody } = makeProbeHelpers(state, failures);

  // CDN enabled x {frontend, staticfiles}: the asset file and the directory
  // index (served at the trailing-slash form) are offloaded to the CDN and
  // served as cache HITs. The bare mount root 307s via the Lambda (see
  // 32-fastapi-static-precedence), so the index is probed at the slash form.
  await expectCdnHit('cdn-frontend asset', '/cdn-frontend/asset.txt', {
    status: 200,
    contains: 'CDN_FRONTEND_ASSET',
  });
  await expectCdnHit('cdn-frontend index', '/cdn-frontend/', {
    status: 200,
    contains: 'CDN_FRONTEND_INDEX',
    headers: { accept: 'text/html' },
  });
  await expectCdnHit('cdn-static asset', '/cdn-static/asset.txt', {
    status: 200,
    contains: 'CDN_STATIC_ASSET',
  });
  await expectCdnHit('cdn-static index', '/cdn-static/', {
    status: 200,
    contains: 'CDN_STATIC_INDEX',
    headers: { accept: 'text/html' },
  });

  // CDN disabled (pyproject cdn=false) x {frontend, staticfiles}: the builder
  // skips the offload, so the service Lambda serves both the asset and index.
  await expectBody('nocdn-frontend asset', '/nocdn-frontend/asset.txt', {
    status: 200,
    contains: 'NOCDN_FRONTEND_ASSET',
  });
  await expectBody('nocdn-frontend index', '/nocdn-frontend/', {
    status: 200,
    contains: 'NOCDN_FRONTEND_INDEX',
    headers: { accept: 'text/html' },
  });
  await expectBody('nocdn-static asset', '/nocdn-static/asset.txt', {
    status: 200,
    contains: 'NOCDN_STATIC_ASSET',
  });
  await expectBody('nocdn-static index', '/nocdn-static/', {
    status: 200,
    contains: 'NOCDN_STATIC_INDEX',
    headers: { accept: 'text/html' },
  });

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
