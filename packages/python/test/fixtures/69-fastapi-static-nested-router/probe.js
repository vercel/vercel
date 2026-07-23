module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const res = await fetch(`https://${deploymentUrl}/nested/router.txt`);
  const body = await res.text();
  if (res.status !== 200) failures.push(`expected 200, got ${res.status}`);
  if (!body.includes('ROUTER_FRONTEND_FILE')) {
    failures.push(`expected ROUTER_FRONTEND_FILE, got ${JSON.stringify(body)}`);
  }
  // Verify CDN routing: second request to static file should be a cache HIT
  await fetch(`https://${deploymentUrl}/nested/router.txt`);
  const cdnRes = await fetch(`https://${deploymentUrl}/nested/router.txt`);
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
