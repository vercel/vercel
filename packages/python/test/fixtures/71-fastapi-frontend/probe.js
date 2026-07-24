module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const asset = await fetch(`https://${deploymentUrl}/asset.txt`);
  const assetBody = await asset.json();
  if (asset.status !== 200) failures.push(`asset: expected 200, got ${asset.status}`);
  if (assetBody.source !== 'api-route') {
    failures.push(`asset collision: expected API route, got ${JSON.stringify(assetBody)}`);
  }
  if (asset.headers.get('x-fastapi-middleware') !== 'ran') {
    failures.push('asset collision: FastAPI middleware did not run');
  }

  const staticFile = await fetch(`https://${deploymentUrl}/static.txt`);
  const staticBody = await staticFile.text();
  if (staticBody.trim() !== 'FRONTEND_STATIC') {
    failures.push(`static: expected FRONTEND_STATIC, got ${JSON.stringify(staticBody)}`);
  }
  if (staticFile.headers.get('x-fastapi-middleware') !== 'ran') {
    failures.push('static: edge middleware did not run before the CDN');
  }
  if (staticFile.headers.get('x-fastapi-frontend-dependency') !== 'ran') {
    failures.push('static: frontend dependency did not run before the CDN');
  }

  const nav = await fetch(`https://${deploymentUrl}/client/route`, {
    headers: { accept: 'text/html' },
  });
  const navBody = await nav.text();
  if (nav.status !== 200) failures.push(`fallback: expected 200, got ${nav.status}`);
  if (!navBody.includes('FRONTEND_INDEX_FALLBACK')) {
    failures.push(`fallback: expected FRONTEND_INDEX_FALLBACK, got ${JSON.stringify(navBody)}`);
  }

  const missing = await fetch(`https://${deploymentUrl}/missing.js`, {
    headers: { accept: 'application/javascript' },
  });
  if (missing.status !== 404) failures.push(`missing asset: expected 404, got ${missing.status}`);

  // Verify CDN routing: second request to static file should be a cache HIT
  await fetch(`https://${deploymentUrl}/static.txt`);
  const cdnRes = await fetch(`https://${deploymentUrl}/static.txt`);
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
