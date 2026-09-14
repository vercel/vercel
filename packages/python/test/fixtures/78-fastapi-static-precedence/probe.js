module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // A response served from the CDN reports `x-vercel-cache: HIT` on a warmed,
  // repeated request. Asserts status + body once, then confirms two more
  // requests are served by the CDN (not the Lambda).
  async function expectCdnHit(name, path, { status, contains, headers }) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const body = await res.text();
    if (res.status !== status) failures.push(`${name}: expected ${status}, got ${res.status}`);
    if (!body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 80))}`);
    }
    await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cdn = await fetch(`https://${deploymentUrl}${path}`, { headers });
    const cache = cdn.headers.get('x-vercel-cache');
    if (cache !== 'HIT') {
      failures.push(`${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`);
    }
  }

  // A response served by the Lambda: asserts status + optional body, with no
  // CDN cache assertion.
  async function expectBody(name, path, { method = 'GET', status, contains, headers } = {}) {
    const res = await fetch(`https://${deploymentUrl}${path}`, { method, headers });
    const body = await res.text();
    if (res.status !== status) {
      failures.push(`${name}: expected ${status}, got ${res.status} ${JSON.stringify(body.slice(0, 60))}`);
    }
    if (contains && !body.includes(contains)) {
      failures.push(`${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 60))}`);
    }
  }

  // A bare path that the Lambda answers with a redirect to another form.
  async function expectRedirect(name, path, endsWith) {
    const res = await fetch(`https://${deploymentUrl}${path}`, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    if (![307, 308].includes(res.status)) {
      failures.push(`${name}: expected 307/308, got ${res.status}`);
    }
    const loc = res.headers.get('location') || '';
    if (!loc.endsWith(endsWith)) {
      failures.push(`${name}: expected Location ending ${endsWith}, got ${JSON.stringify(loc)}`);
    }
  }

  // A route declared before its StaticFiles mount owns the exact path; a
  // sibling file under the same mount stays on the CDN. HEAD has no route
  // (GET-only), so the mount serves it; POST is a method mismatch (405).
  await expectBody('static route', '/static/example.txt', { status: 200, contains: 'API_ROUTE_WON' });
  await expectCdnHit('static sibling', '/static/plain.txt', { status: 200, contains: 'PLAIN_STATIC_ASSET' });
  await expectBody('static HEAD', '/static/example.txt', { method: 'HEAD', status: 200 });
  await expectBody('static POST', '/static/example.txt', { method: 'POST', status: 405 });

  // An include_router route owns /data/report; the rest of the /data mount is
  // on the CDN.
  await expectBody('included route', '/data/report', { status: 200, contains: 'INCLUDED_ROUTE_WON' });
  await expectCdnHit('included subpath', '/data/report/summary.txt', { status: 200, contains: 'STATIC_SUBPATH' });

  // A Router owns the /eclipse subtree, so the eclipsed mount is never copied
  // and a file under it 404s; the reachable mount is on the CDN.
  await expectBody('eclipse route', '/eclipse/inner', { status: 200, contains: 'NESTED_ROUTE_WON' });
  await expectBody('eclipsed file', '/eclipse/inner/data.txt', { status: 404 });
  await expectCdnHit('reachable mount', '/reachable/logo.txt', { status: 200, contains: 'ASSET_OK' });

  // A plain Starlette route inside an included APIRouter owns its exact path.
  await expectBody('starlette route', '/plain/collision.txt', { status: 200, contains: 'STARLETTE_ROUTE_WON' });

  // A mounted sub-app: its StaticFiles are on the CDN under /sub, its included
  // route owns /sub/data/report, and its nested frontend lives at /sub/inner/ui
  // (not /inner/ui, which the app does not own).
  await expectCdnHit('sub-app static', '/sub/static/asset.txt', { status: 200, contains: 'SUB_APP_ASSET' });
  await expectBody('sub-app route', '/sub/data/report', { status: 200, contains: 'API_ROUTE_WON' });
  await expectCdnHit('sub-app subpath', '/sub/data/plain.txt', { status: 200, contains: 'PLAIN_OK' });
  await expectCdnHit('sub-app frontend', '/sub/inner/ui/asset.txt', { status: 200, contains: 'UI_ASSET' });
  await expectBody('sub-app frontend wrong space', '/inner/ui/asset.txt', { status: 404 });
  await expectBody('sub-app frontend wrong fallback', '/inner/ui/client-route', {
    status: 404,
    headers: { accept: 'text/html' },
  });

  // fallback=None: files on the CDN, a miss is a plain 404 with no fallback.
  await expectCdnHit('none asset', '/none/asset.txt', { status: 200, contains: 'NONE_ASSET' });
  await expectBody('none miss', '/none/does-not-exist', { status: 404, headers: { accept: 'text/html' } });

  // fallback="auto" resolving to 404.html: every miss is 404.html with a 404.
  await expectCdnHit('both -> 404.html', '/both/does-not-exist', { status: 404, contains: 'BOTH_404' });

  // fallback="auto" resolving to index.html: a navigation miss serves index
  // (200); a non-navigation Accept and an extensioned path fall through to the
  // Lambda (404). HEAD serves the fallback; POST skips it and 404s.
  await expectCdnHit('spa navigation', '/spa/client-route', {
    status: 200,
    contains: 'SPA_INDEX',
    headers: { accept: 'text/html' },
  });
  await expectBody('spa non-navigation', '/spa/api-route', { status: 404, headers: { accept: 'application/json' } });
  await expectBody('spa extension', '/spa/missing.js', { status: 404, headers: { accept: 'text/html' } });
  await expectBody('spa HEAD', '/spa/client-route', { method: 'HEAD', status: 200, headers: { accept: 'text/html' } });
  await expectBody('spa POST', '/spa/client-route', { method: 'POST', status: 404 });

  // A route under the /spa frontend owns its path; a trailing-slash request
  // 307s to it rather than serving the fallback, and an Accept that rejects
  // html (q=0) does not get the fallback.
  await expectBody('spa route', '/spa/foo', { status: 200, contains: 'FOO_ROUTE' });
  await expectRedirect('spa route trailing slash', '/spa/foo/', '/spa/foo');
  await expectBody('spa accept q=0', '/spa/qzero-check', {
    status: 404,
    headers: { accept: 'text/html;q=0, application/json' },
  });

  // A mounted sub-app owns /over/api: its routes reach the app and its misses
  // 404 there, the frontend fallback does not hijack the subtree, and a
  // frontend file under the mounted prefix is not copied. The frontend still
  // serves its own asset and fallback.
  await expectBody('over sub-app route', '/over/api/hello', { status: 200, contains: 'SUB_ROUTE_WON', headers: { accept: 'text/html' } });
  await expectBody('over sub-app miss', '/over/api/missing', { status: 404, headers: { accept: 'text/html' } });
  await expectBody('over hijack file', '/over/api/hijack.txt', { status: 404 });
  await expectCdnHit('over asset', '/over/asset.txt', { status: 200, contains: 'FRONTEND_ASSET' });
  await expectCdnHit('over fallback', '/over/client-route', {
    status: 200,
    contains: 'OVER_INDEX',
    headers: { accept: 'text/html' },
  });

  // A frontend with nested index.html directories: bare directory URLs 307 to
  // the slash form (Lambda), the slash form and files stay on the CDN.
  await expectRedirect('mnt root bare', '/mnt', '/mnt/');
  await expectRedirect('mnt subdir bare', '/mnt/guide', '/mnt/guide/');
  await expectRedirect('mnt nested bare', '/mnt/guide/section', '/mnt/guide/section/');
  await expectCdnHit('mnt root slash', '/mnt/', { status: 200, contains: 'MNT_ROOT_INDEX', headers: { accept: 'text/html' } });
  await expectCdnHit('mnt subdir slash', '/mnt/guide/', { status: 200, contains: 'GUIDE_INDEX', headers: { accept: 'text/html' } });
  await expectCdnHit('mnt nested slash', '/mnt/guide/section/', { status: 200, contains: 'SECTION_INDEX', headers: { accept: 'text/html' } });
  await expectCdnHit('mnt index file', '/mnt/guide/index.html', { status: 200, contains: 'GUIDE_INDEX' });
  await expectCdnHit('mnt asset file', '/mnt/guide/asset.txt', { status: 200, contains: 'GUIDE_ASSET' });

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
