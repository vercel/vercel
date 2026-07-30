module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A StaticFiles mount inside a mounted sub-application is served from the CDN
  // under the parent prefix (`/sub` + `/static`).
  const res = await fetch(`https://${deploymentUrl}/sub/static/asset.txt`);
  const body = await res.text();
  if (res.status !== 200) failures.push(`expected 200, got ${res.status}`);
  if (!body.includes('SUB_APP_ASSET')) {
    failures.push(`expected SUB_APP_ASSET, got ${JSON.stringify(body)}`);
  }
  // A second warmed request should be served by the CDN (cache HIT).
  await fetch(`https://${deploymentUrl}/sub/static/asset.txt`);
  const cdn = await fetch(`https://${deploymentUrl}/sub/static/asset.txt`);
  const cache = cdn.headers.get('x-vercel-cache');
  if (cache !== 'HIT') {
    failures.push(`cdn: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
