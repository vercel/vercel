module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A response served from the CDN reports `x-vercel-cache: HIT` on a warmed,
  // repeated request. Asserts status + body once, then confirms two more
  // requests are served by the CDN (not the Lambda).
  async function expectCdnHit(name, path, { status, contains, headers }) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const body = await res.text();
    if (res.status !== status) failures.push(`${name}: expected ${status}, got ${res.status}`);
    if (!body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 80))}`);
    }
    await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cdn = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cache = cdn.headers.get('x-vercel-cache');
    if (cache !== 'HIT') {
      failures.push(`${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
    }
  }

  // A response served by the Lambda: asserts status + optional body, with no
  // CDN cache assertion.
  async function expectBody(name, path, { method = 'GET', status, contains, headers } = {}) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { method, headers });
    const body = await res.text();
    if (res.status !== status) {
      failures.push(`${name}: expected ${status}, got ${res.status} ${JSON.stringify(body.slice(0, 60))}`);
    }
    if (contains && !body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 60))}`);
    }
  }

  // A bare path that the Lambda answers with a redirect to another form.
  async function expectRedirect(name, path, endsWith) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { redirect: 'manual' });
    if (![307, 308].includes(res.status)) {
      failures.push(`${name}: expected 307/308, got ${res.status}`);
    }
    const loc = res.headers.get('location') || '';
    if (!loc.endsWith(endsWith)) {
      failures.push(`${name}: expected Location ending ${endsWith}, got ${JSON.stringify(loc)}`);
    }
  }

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

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
