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
    await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cdn = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cache = cdn.headers.get('x-vercel-cache');
    if (cache !== 'HIT') {
      failures.push(`${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
    }
  }

  // fallback=None: files are served, but a miss is a plain 404 with no CDN
  // fallback (the builder emits no fallback route for this mount), so even a
  // navigation request reaches the Lambda and 404s.
  await expectCdnHit('none asset', '/none/asset.txt', {
    status: 200,
    contains: 'NONE_ASSET',
  });
  const noneMiss = await fetch(`https://${deploymentUrl}/none/does-not-exist`, {
    headers: { accept: 'text/html' },
  });
  if (noneMiss.status !== 404) {
    const body = await noneMiss.text();
    failures.push(`none miss: expected 404 (no fallback), got ${noneMiss.status} ${JSON.stringify(body)}`);
  }

  // fallback="auto" with both index.html and 404.html -> resolves to 404.html:
  // every miss is 404.html with a 404, regardless of Accept (no navigation
  // heuristic for 404.html).
  await expectCdnHit('auto -> 404.html', '/both/does-not-exist', {
    status: 404,
    contains: 'BOTH_404',
  });

  // fallback="auto" with only index.html -> resolves to index.html: served with
  // 200 for a navigation request (Accept: text/html), matching the runtime.
  await expectCdnHit('auto -> index.html', '/spa/client-route', {
    status: 200,
    contains: 'SPA_INDEX',
    headers: { accept: 'text/html' },
  });

  // Non-navigation GET (Accept without text/html) must NOT get the index.html
  // fallback: the route is Accept-gated, so it falls through to the Lambda,
  // which 404s — matching the frontend's navigation heuristic. A distinct path
  // avoids the warmed navigation cache above.
  const spaNonNav = await fetch(`https://${deploymentUrl}/spa/api-route`, {
    headers: { accept: 'application/json' },
  });
  if (spaNonNav.status !== 404) {
    const body = await spaNonNav.text();
    failures.push(`spa non-nav GET: expected 404 (Accept-gated), got ${spaNonNav.status} ${JSON.stringify(body)}`);
  }

  // Method handling on the 200 (index.html) fallback route, which is GET/HEAD
  // only: a HEAD navigation still serves it (200), while a POST skips it and
  // reaches the Lambda, which 404s a non-GET frontend miss.
  const spaHead = await fetch(`https://${deploymentUrl}/spa/client-route`, {
    method: 'HEAD',
    headers: { accept: 'text/html' },
  });
  if (spaHead.status !== 200) failures.push(`spa HEAD: expected 200, got ${spaHead.status}`);
  const spaPost = await fetch(`https://${deploymentUrl}/spa/client-route`, {
    method: 'POST',
  });
  if (spaPost.status !== 404) {
    const body = await spaPost.text();
    failures.push(`spa POST: expected 404 (Lambda), got ${spaPost.status} ${JSON.stringify(body)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
