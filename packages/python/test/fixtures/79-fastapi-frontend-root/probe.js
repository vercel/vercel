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
    const res = await fetch(`https://${deploymentUrl}${path}`, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    if (![307, 308].includes(res.status)) {
      failures.push(`${name}: expected 307/308, got ${res.status}`);
    }
    const loc = res.headers.get('location') || '';
    if (!loc.endsWith(endsWith)) {
      failures.push(`${name}: expected Location ending ${endsWith}, got ${JSON.stringify(loc)}`);
    }
  }

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

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
