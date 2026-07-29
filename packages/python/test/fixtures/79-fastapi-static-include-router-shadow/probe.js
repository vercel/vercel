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

  // The included router's `/data/report` outranks the `/data` StaticFiles mount
  // for that exact path: the builder shadows it to the Lambda, which returns
  // INCLUDED_ROUTE_WON.
  const report = await fetch(`https://${deploymentUrl}/data/report`);
  const reportBody = await report.text();
  if (report.status !== 200) failures.push(`report: expected 200, got ${report.status}`);
  if (!reportBody.includes('INCLUDED_ROUTE_WON')) {
    failures.push(`report: expected INCLUDED_ROUTE_WON, got ${JSON.stringify(reportBody)}`);
  }

  // A subpath under `/data/report` is not shadowed, so it is served from the
  // `/data` mount on the CDN.
  await expectCdnHit('subpath', '/data/report/summary.txt', {
    status: 200,
    contains: 'STATIC_SUBPATH',
  });

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
