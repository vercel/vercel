module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const res = await fetch(`https://${deploymentUrl}/static/index.html`);
  const body = await res.text();
  if (res.status !== 200) failures.push(`expected 200, got ${res.status}`);
  if (!body.includes('Hello World')) {
    failures.push(`expected Hello World, got ${JSON.stringify(body)}`);
  }

  // Verify CDN routing: second request to static file should be a cache HIT
  await fetch(`https://${deploymentUrl}/static/index.html`);
  const cdnRes = await fetch(`https://${deploymentUrl}/static/index.html`);
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  // HEAD behaves like GET — the file is served from the CDN (no body).
  const head = await fetch(`https://${deploymentUrl}/static/index.html`, {
    method: 'HEAD',
  });
  if (head.status !== 200) failures.push(`head: expected 200, got ${head.status}`);

  // POST is not GET/HEAD, so Starlette's StaticFiles answers 405. Nothing
  // shadows this path, so the CDN serves the copied file directly — this checks
  // whether the CDN method-filters too, or serves the file regardless of method
  // (a divergence from the app's 405, inherent to serving StaticFiles from CDN).
  const post = await fetch(`https://${deploymentUrl}/static/index.html`, {
    method: 'POST',
  });
  if (post.status !== 405) {
    const postBody = await post.text();
    failures.push(`post: expected 405 (StaticFiles), CDN returned ${post.status} ${JSON.stringify(postBody)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
