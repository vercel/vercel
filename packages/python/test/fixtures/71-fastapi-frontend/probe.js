module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  const asset = await fetch(`https://${deploymentUrl}/asset.txt`);
  const assetBody = await asset.text();
  if (asset.status !== 200) failures.push(`asset: expected 200, got ${asset.status}`);
  if (!assetBody.includes('FRONTEND_ASSET')) {
    failures.push(`asset: expected FRONTEND_ASSET, got ${JSON.stringify(assetBody)}`);
  }
  if (asset.headers.get('x-served-by-fastapi') !== null) {
    failures.push('asset: expected CDN response, but FastAPI served it');
  }

  const nav = await fetch(`https://${deploymentUrl}/client/route`, {
    headers: { accept: 'text/html' },
  });
  const navBody = await nav.text();
  if (nav.status !== 200) failures.push(`fallback: expected 200, got ${nav.status}`);
  if (!navBody.includes('FRONTEND_INDEX_FALLBACK')) {
    failures.push(`fallback: expected FRONTEND_INDEX_FALLBACK, got ${JSON.stringify(navBody)}`);
  }
  if (nav.headers.get('x-served-by-fastapi') !== null) {
    failures.push('fallback: expected CDN response, but FastAPI served it');
  }

  const missing = await fetch(`https://${deploymentUrl}/missing.js`, {
    headers: { accept: 'text/html' },
  });
  if (missing.status !== 404) failures.push(`missing asset: expected 404, got ${missing.status}`);

  // Verify CDN routing: second request to static file should be a cache HIT
  await fetch(`https://${deploymentUrl}/asset.txt`);
  const cdnRes = await fetch(`https://${deploymentUrl}/asset.txt`);
  const cacheHeader = cdnRes.headers.get('x-vercel-cache');
  if (cacheHeader !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cacheHeader)}`);
  }

  const api = await fetch(`https://${deploymentUrl}/api/health`);
  const apiBody = await api.json();
  if (api.status !== 200) failures.push(`api: expected 200, got ${api.status}`);
  if (api.headers.get('x-served-by-fastapi') !== '1') {
    failures.push('api: expected the FastAPI middleware response header');
  }
  if (
    apiBody.message !== 'PACKAGE_RELATIVE_IMPORT' ||
    apiBody.module !== 'backend.main' ||
    apiBody.package !== 'backend'
  ) {
    failures.push(`api: unexpected response ${JSON.stringify(apiBody)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
