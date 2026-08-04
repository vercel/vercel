module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const res = await fetch(`https://${deploymentUrl}/static/index.html`);
  const body = await res.text();
  if (res.status !== 200) failures.push(`expected 200, got ${res.status}`);
  if (!body.includes('Hello World')) {
    failures.push(`expected Hello World, got ${JSON.stringify(body)}`);
  }

  const apiFirst = await fetch(
    `https://${deploymentUrl}/static/api-first.txt`
  );
  const apiFirstBody = await apiFirst.text();
  if (apiFirst.status !== 200) {
    failures.push(`api first: expected 200, got ${apiFirst.status}`);
  }
  if (apiFirstBody !== 'API_ROUTE_WON') {
    failures.push(
      `api first: expected API_ROUTE_WON, got ${JSON.stringify(apiFirstBody)}`
    );
  }

  const mountFirst = await fetch(
    `https://${deploymentUrl}/static/mount-first.txt`
  );
  const mountFirstBody = await mountFirst.text();
  if (mountFirst.status !== 200) {
    failures.push(`mount first: expected 200, got ${mountFirst.status}`);
  }
  if (mountFirstBody.trim() !== 'STATIC_ROUTE_WON') {
    failures.push(
      `mount first: expected STATIC_ROUTE_WON, got ${JSON.stringify(mountFirstBody)}`
    );
  }

  // Verify CDN routing: second request to static file should be a cache HIT
  await fetch(`https://${deploymentUrl}/static/mount-first.txt`);
  const cdnRes = await fetch(
    `https://${deploymentUrl}/static/mount-first.txt`
  );
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
