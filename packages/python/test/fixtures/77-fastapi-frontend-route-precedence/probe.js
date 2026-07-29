module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A response served from the CDN reports `x-vercel-cache: HIT` on a warmed,
  // repeated request. This asserts status + body once, then confirms two more
  // requests are served by the CDN (not the Lambda).
  async function expectCdnHit(name, path, { status, contains, headers }) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const body = await res.text();
    if (res.status !== status) failures.push(`${name}: expected ${status}, got ${res.status}`);
    if (!body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body)}`);
    }
    // Warm the cache, then confirm the response is a CDN hit.
    await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cdn = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cache = cdn.headers.get('x-vercel-cache');
    if (cache !== 'HIT') {
      failures.push(`${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
    }
  }

  // `app.frontend()` is low-priority, so `@app.get("/collision.txt")` wins even
  // though `frontend/collision.txt` exists: the builder shadows the route to
  // the Lambda, which returns API_ROUTE_WON.
  const collide = await fetch(`https://${deploymentUrl}/collision.txt`);
  const collideBody = await collide.text();
  if (collide.status !== 200) failures.push(`collision: expected 200, got ${collide.status}`);
  if (!collideBody.includes('API_ROUTE_WON')) {
    failures.push(
      `collision: expected API_ROUTE_WON (frontend is low-priority), got ${JSON.stringify(collideBody)}`
    );
  }

  // A non-colliding frontend file is served straight from the CDN.
  await expectCdnHit('asset', '/asset.txt', { status: 200, contains: 'FRONTEND_ASSET' });

  // `@app.get("/collision.txt")` is GET-only (FastAPI doesn't add HEAD to GET
  // routes). Because a normal route already path-matches, the low-priority
  // frontend is never consulted, so every non-GET method — HEAD included —
  // reaches the Lambda as a 405 (method mismatch), not the frontend's file.
  for (const method of ['HEAD', 'POST']) {
    const res = await fetch(`https://${deploymentUrl}/collision.txt`, { method });
    if (res.status !== 405) {
      const body = await res.text();
      failures.push(`${method}: expected 405, got ${res.status} ${JSON.stringify(body)}`);
    }
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
