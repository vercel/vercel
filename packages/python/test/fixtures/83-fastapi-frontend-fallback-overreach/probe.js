module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // The root frontend fallback must not hijack the mounted sub-app's subtree.
  // A navigation GET to a sub-app ROUTE must reach the app. Buggy: the
  // post-filesystem fallback route matches first and serves ROOT_INDEX.
  const hello = await fetch(`https://${deploymentUrl}/api/hello`, {
    headers: { accept: 'text/html' },
  });
  const helloBody = await hello.text();
  if (hello.status !== 200 || !helloBody.includes('SUB_ROUTE_WON')) {
    failures.push(
      `sub-app route: expected 200 SUB_ROUTE_WON, got ${hello.status} ${JSON.stringify(helloBody)}`
    );
  }

  // A MISS under the mounted sub-app must 404 from the sub-app, not serve the
  // root index.html with 200.
  const miss = await fetch(`https://${deploymentUrl}/api/missing`, {
    headers: { accept: 'text/html' },
  });
  if (miss.status !== 404) {
    const body = await miss.text();
    failures.push(`sub-app miss: expected 404, got ${miss.status} ${JSON.stringify(body)}`);
  }

  // A frontend FILE under the mounted prefix (frontend/api/hijack.txt) is
  // unreachable at runtime (the mount owns /api/*), so it must 404. Buggy: the
  // file is copied to the CDN and served.
  const hijack = await fetch(`https://${deploymentUrl}/api/hijack.txt`);
  if (hijack.status !== 404) {
    failures.push(`frontend file hijack: expected 404, got ${hijack.status}`);
  }

  // Copy-order: the normal /static mount always beats the low-priority
  // frontend, so the mount's file must win over frontend/static/collision.txt.
  // Buggy: the frontend is copied last and overwrites it on the CDN.
  const col = await fetch(`https://${deploymentUrl}/static/collision.txt`);
  const colBody = await col.text();
  if (!colBody.includes('STATIC_MOUNT_WON')) {
    failures.push(`copy order: expected STATIC_MOUNT_WON, got ${JSON.stringify(colBody)}`);
  }

  // Controls: the frontend still serves its own assets from the CDN, the
  // shadowed /foo route reaches the app, and the fallback itself works for
  // paths the frontend really owns.
  const asset = await fetch(`https://${deploymentUrl}/asset.txt`);
  const assetBody = await asset.text();
  if (asset.status !== 200 || !assetBody.includes('FRONTEND_ASSET')) {
    failures.push(`control asset: expected 200 FRONTEND_ASSET, got ${asset.status}`);
  }
  const foo = await fetch(`https://${deploymentUrl}/foo`);
  const fooBody = await foo.text();
  if (foo.status !== 200 || !fooBody.includes('FOO_ROUTE')) {
    failures.push(`control foo: expected 200 FOO_ROUTE, got ${foo.status}`);
  }
  const nav = await fetch(`https://${deploymentUrl}/client-route`, {
    headers: { accept: 'text/html' },
  });
  const navBody = await nav.text();
  if (nav.status !== 200 || !navBody.includes('ROOT_INDEX')) {
    failures.push(`control fallback: expected 200 ROOT_INDEX, got ${nav.status}`);
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
