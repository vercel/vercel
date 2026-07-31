module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  async function expectBody(name, path, { status, contains, headers } = {}) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const body = await res.text();
    if (res.status !== status) {
      failures.push(`${name}: expected ${status}, got ${res.status} ${JSON.stringify(body)}`);
    }
    if (contains && !body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body)}`);
    }
  }

  // The included route (declared before the sub-app's mount) must win for
  // /sub/data/report. Buggy: the shim drops the outer "/sub" prefix from the
  // harvested route path, emits no shadow route, and the CDN serves the
  // colliding file (STATIC_FILE_WRONGLY_WON).
  await expectBody('included route wins', '/sub/data/report', {
    status: 200,
    contains: 'API_ROUTE_WON',
  });

  // Control: an unshadowed file under the same mount is served.
  await expectBody('unshadowed file', '/sub/data/plain.txt', {
    status: 200,
    contains: 'PLAIN_OK',
  });

  // The app does not own /inner/ui/* (the included frontend lives at
  // /sub/inner/ui/*), so both must 404. Buggy: the misplaced urlPath makes the
  // CDN serve the copied file, and the misplaced fallback route serves
  // UI_INDEX for navigation requests.
  const wrongAsset = await fetch(`https://${deploymentUrl}/inner/ui/asset.txt`);
  if (wrongAsset.status !== 404) {
    failures.push(`misplaced frontend asset: expected 404, got ${wrongAsset.status}`);
  }
  const wrongNav = await fetch(`https://${deploymentUrl}/inner/ui/client-route`, {
    headers: { accept: 'text/html' },
  });
  if (wrongNav.status !== 404) {
    failures.push(`misplaced frontend fallback: expected 404, got ${wrongNav.status}`);
  }

  // Control: the frontend's real URL space works (via the Lambda until the
  // urlPath is fixed, via the CDN after).
  await expectBody('frontend real path', '/sub/inner/ui/asset.txt', {
    status: 200,
    contains: 'UI_ASSET',
  });

  // The plain Starlette route (declared before the /assets mount) must win for
  // its exact path. Buggy: its effective route context has an empty path, so
  // no shadow route is emitted and the CDN serves the colliding file.
  await expectBody('starlette route wins', '/assets/collision.txt', {
    status: 200,
    contains: 'STARLETTE_ROUTE_WON',
  });

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
