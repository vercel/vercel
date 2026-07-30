module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // The entrypoint (backend/main.py) uses a package-relative import
  // (`from .settings import ...`). Static discovery must import it as a package
  // so the `app.frontend()` build is collected to the CDN. If discovery breaks,
  // the file is still served — but by the Lambda, so the warmed, repeated
  // request below is never a CDN cache HIT.
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
