const { withLocalServer } = require('../../fastapi-probe-helpers');

async function runProbes(state, failures) {
  async function check({ name, path, method = 'GET', status, bodyIncludes }) {
    const res = await state.fetch(state.base + path, { method });
    const body = await res.text();
    const mw = res.headers.get('x-fastapi-middleware');
    if (res.status !== status) failures.push(`${name}: expected ${status}, got ${res.status}`);
    if (bodyIncludes && !body.includes(bodyIncludes)) {
      failures.push(`${name}: expected ${JSON.stringify(bodyIncludes)}, got ${JSON.stringify(body)}`);
    }
    if (mw !== 'ran') {
      failures.push(`${name}: expected x-fastapi-middleware=ran, got ${JSON.stringify(mw)}`);
    }
  }

  // The CDN opt-in env var is set, but `tool.vercel.fastapi.static.cdn = false`
  // overrides it, so the CDN stays off and the Lambda handles everything — full
  // FastAPI semantics (middleware runs, method handling intact).
  await check({ name: 'API route wins over frontend file', path: '/api/collision.txt', status: 200, bodyIncludes: 'API_ROUTE_WON' });
  await check({ name: 'middleware runs for static file', path: '/asset.txt', status: 200, bodyIncludes: 'FRONTEND_ASSET' });
  await check({ name: 'HEAD static file is 200', path: '/asset.txt', method: 'HEAD', status: 200 });
  await check({ name: 'POST to static file is 405', path: '/asset.txt', method: 'POST', status: 405 });
}

module.exports = async ({ deploymentUrl, fetch, pythonBin }) => {
  const failures = [];
  const state = { base: '', fetch };

  if (pythonBin) {
    await withLocalServer(pythonBin, __dirname, fetch, '/docs', async base => {
      state.base = base;
      await runProbes(state, failures);
    });
  }

  if (deploymentUrl) {
    state.base = `https://${deploymentUrl}`;
    await runProbes(state, failures);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
