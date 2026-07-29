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

  // `/foo/bar` is handled by the `/foo` router's `/bar` route; the `/foo/bar`
  // StaticFiles mount is eclipsed and never reached at runtime.
  const bar = await fetch(`https://${deploymentUrl}/foo/bar`);
  const barBody = await bar.text();
  if (bar.status !== 200) failures.push(`route: expected 200, got ${bar.status}`);
  if (!barBody.includes('NESTED_ROUTE_WON')) {
    failures.push(`route: expected NESTED_ROUTE_WON, got ${JSON.stringify(barBody)}`);
  }

  // The eclipsed directory is not on the CDN, so a file under it 404s (the
  // router has no match for `/bar/data.txt`) instead of serving ECLIPSED_STATIC.
  const eclipsed = await fetch(`https://${deploymentUrl}/foo/bar/data.txt`);
  if (eclipsed.status !== 404) {
    const body = await eclipsed.text();
    failures.push(`eclipsed: expected 404, got ${eclipsed.status} ${JSON.stringify(body)}`);
  }

  // The reachable `/assets` mount is still collected and served from the CDN.
  await expectCdnHit('assets', '/assets/logo.txt', { status: 200, contains: 'ASSET_OK' });

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
