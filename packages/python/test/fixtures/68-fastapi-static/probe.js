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

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
