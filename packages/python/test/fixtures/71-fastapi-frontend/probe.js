module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A non-colliding frontend file is served from the CDN; a warmed, repeated
  // request is a cache HIT.
  const asset = await fetch(`https://${deploymentUrl}/asset.txt`);
  const assetBody = await asset.text();
  if (asset.status !== 200) failures.push(`asset: expected 200, got ${asset.status}`);
  if (!assetBody.includes('FRONTEND_ASSET')) {
    failures.push(`asset: expected FRONTEND_ASSET, got ${JSON.stringify(assetBody)}`);
  }
  await fetch(`https://${deploymentUrl}/asset.txt`);
  const cdn = await fetch(`https://${deploymentUrl}/asset.txt`);
  const cache = cdn.headers.get('x-vercel-cache');
  if (cache !== 'HIT') {
    failures.push(`asset: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
