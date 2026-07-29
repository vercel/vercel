module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A colliding path must be served by the Lambda so FastAPI route precedence
  // is honored, not shadowed by a static file on the CDN. The current builder
  // copies the whole static/ and frontend/ directories to the CDN and serves
  // them via the filesystem handler before the Lambda, wrongly returning
  // `STATIC_FILE_WRONGLY_WON`.
  async function expectRouteWins(name, path) {
    const res = await fetch(`https://${deploymentUrl}${path}`);
    const body = await res.text();
    if (res.status !== 200) failures.push(`${name}: expected 200, got ${res.status}`);
    if (!body.includes('API_ROUTE_WON')) {
      failures.push(`${name}: expected API_ROUTE_WON, got ${JSON.stringify(body)}`);
    }
  }

  // A non-colliding static file must still be served from the CDN. A repeated
  // request should report `x-vercel-cache: HIT`, proving the file is served by
  // the CDN and not the Lambda (so the fix must not disable static serving).
  async function expectCdnFile(name, path, contains) {
    const res = await fetch(`https://${deploymentUrl}${path}`);
    const body = await res.text();
    if (res.status !== 200) failures.push(`${name}: expected 200, got ${res.status}`);
    if (!body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body)}`);
    }
    // Warm the cache, then confirm the second response is a CDN hit.
    await fetch(`https://${deploymentUrl}${path}`);
    const cdnRes = await fetch(`https://${deploymentUrl}${path}`);
    const cacheHeader = cdnRes.headers.get('x-vercel-cache');
    if (cacheHeader !== 'HIT') {
      failures.push(`${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
    }
  }

  // mount(): `@app.get("/static/example.txt")` is declared before
  // `app.mount("/static", ...)`, so the route wins (evaluated in order).
  await expectRouteWins('mount collision', '/static/example.txt');
  // frontend(): the build is low-priority, so `@app.get("/collision.txt")`
  // wins even though `frontend/collision.txt` exists.
  await expectRouteWins('frontend collision', '/collision.txt');

  // Non-colliding files are served from the CDN (and must stay that way).
  await expectCdnFile('mount asset', '/static/plain.txt', 'PLAIN_STATIC_ASSET');
  await expectCdnFile('frontend asset', '/asset.txt', 'FRONTEND_ASSET');

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
