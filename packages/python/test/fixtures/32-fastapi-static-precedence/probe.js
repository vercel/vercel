const { makeProbeHelpers, withLocalServer, readInstalledVersion, readPinnedVersion } = require('../../fastapi-probe-helpers');

async function runProbes(helpers, { fastapiVersion }) {
  const { expectCdnHit, expectBody, expectStatus, expectRedirect } = helpers;

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
  // (200); a non-navigation Accept falls through to the Lambda (404). HEAD
  // serves the fallback; POST skips it and 404s.
  await expectCdnHit('spa navigation', '/spa/client-route', {
    status: 200,
    contains: 'SPA_INDEX',
    headers: { accept: 'text/html' },
  });
  await expectBody('spa non-navigation', '/spa/api-route', { status: 404, headers: { accept: 'application/json' } });
  const [spaExtMaj = 0, spaExtMin = 0] = fastapiVersion ?? [];
  if (fastapiVersion === null || spaExtMaj > 0 || spaExtMin >= 140) {
    // 0.140+ extensioned paths with `Accept: text/html` are navigation and get served as CDN hits.
    await expectCdnHit('spa extension', '/spa/missing.js', { status: 200, contains: 'SPA_INDEX', headers: { accept: 'text/html' } });
  } else {
    // pre-0.140 extensioned paths fall through to the Lambda and 404.
    await expectBody('spa extension', '/spa/missing.js', { status: 404, headers: { accept: 'text/html' } });
  }
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

  // A dependency-guarded include_router frontend must shadow its subtree: a
  // colliding file under /pub and a /pub navigation miss must both yield 401,
  // not be served from the CDN. The unguarded /pub shell is unaffected.
  await expectBody('guarded file blocked',     '/pub/admin/report.txt', { status: 401 });
  await expectBody('guarded nav miss blocked', '/pub/admin/dashboard',  { status: 401, headers: { accept: 'text/html' } });
  await expectCdnHit('pub fallback', '/pub/client-route', { status: 200, contains: 'PUB_INDEX', headers: { accept: 'text/html' } });

  // Same-prefix tie: own frontend wins; included frontend is completely blocked.
  await expectCdnHit('tie own index', '/tie/index.html', { status: 200, contains: 'OWN-SHELL' });
  await expectBody('tie included only', '/tie/only-included.txt', { status: 404 });
  await expectCdnHit('tie own fallback', '/tie/client-route', {
    status: 200,
    contains: 'OWN-SHELL',
    headers: { accept: 'text/html' },
  });

  // fe_owned/route/index.html exists but a prior app route owns the bare
  // path; the bare-directory redirect must not fire before the shadow route.
  await expectBody('prior route owns bare dir', '/fe_owned/route', { status: 200, contains: 'OWNED_ROUTE' });

  // A prior GET route on a plain html=True StaticFiles mount owns a bare
  // directory path with index.html; an all-methods shadow intercepts before
  // the CDN's 307 redirect fires for GET. HEAD reaches the Lambda but has no
  // matching GET handler so StaticFiles issues a 307 to the slash form.
  await expectBody('html_st owned bare', '/html_st/owned', { status: 200, contains: 'ST_OWNED_ROUTE' });
  await expectStatus('html_st owned head bare', '/html_st/owned', { method: 'HEAD', status: 307 });
  await expectCdnHit('html_st owned slash', '/html_st/owned/', { status: 200, contains: 'ST_OWNED_INDEX' });

  // Plain html=True StaticFiles mount with no prior routes: the CDN emits 307
  // redirects for bare directory paths and serves index.html for slash forms.
  await expectRedirect('html_bare root bare', '/html_bare', '/html_bare/');
  await expectCdnHit('html_bare root slash', '/html_bare/', { status: 200, contains: 'HTML_BARE_INDEX' });
  await expectRedirect('html_bare docs bare', '/html_bare/docs', '/html_bare/docs/');
  await expectCdnHit('html_bare docs slash', '/html_bare/docs/', { status: 200, contains: 'HTML_BARE_DOCS_INDEX' });

  // Plain html=False StaticFiles mount: no bare-dir 307 redirects are emitted.
  // Subdirs with index.html 404 for both bare and slash forms. A subdir
  // without index.html also 404s with no redirect hop.
  await expectBody('html_false file', '/html_false/file.txt', { status: 200, contains: 'HTML_FALSE_FILE' });
  await expectBody('html_false withindex bare', '/html_false/withindex', { status: 404 });
  await expectBody('html_false withindex slash', '/html_false/withindex/', { status: 404 });
  await expectBody('html_false noindex bare', '/html_false/noindex', { status: 404 });

  // A POST-only route colliding with a mount file: GET/HEAD stay CDN hits of
  // the file (in-app they fall through the route to the mount), while POST
  // reaches the route instead of the CDN's 405 for non-GET/HEAD on an
  // existing file.
  await expectCdnHit('post-only collision GET', '/post_owned/upload.txt', { status: 200, contains: 'CDN_UPLOAD' });
  await expectBody('post-only collision POST', '/post_owned/upload.txt', { method: 'POST', status: 200, contains: 'POST_ROUTE_WON' });

  // A trailing-slash route owning the slash form of a directory with an
  // index.html in an html=True mount: the route wins the slash form over the
  // directory index, while the bare form 307s to the slash form.
  await expectBody('trailing-slash route slash form', '/ts_owned/route/', { status: 200, contains: 'TS_ROUTE_WON' });
  await expectRedirect('trailing-slash route bare form', '/ts_owned/route', '/ts_owned/route/');
  await expectStatus('trailing-slash route head bare', '/ts_owned/route', { method: 'HEAD', status: 307 });

  // A HEAD-only route owning a bare directory path with an index.html in an
  // html=True mount: HEAD reaches the route; GET has no matching handler so
  // the mount 307s to the slash form, which stays a CDN hit of the index.
  await expectStatus('head-only owned HEAD bare', '/head_owned/route', { method: 'HEAD', status: 200 });
  await expectRedirect('head-only owned GET bare', '/head_owned/route', '/head_owned/route/');
  await expectCdnHit('head-only owned slash', '/head_owned/route/', { status: 200, contains: 'HEAD_OWNED_INDEX' });

  // A trailing-slash route colliding with a mount file: the route wins the
  // slash form; the bare form serves the file.
  await expectBody('ts_file slash form -> route', '/ts_file/route/', { status: 200, contains: 'TS_FILE_ROUTE_WON' });
  await expectCdnHit('ts_file bare form -> file', '/ts_file/route', { status: 200, contains: 'TS_FILE_CONTENT' });
  await expectBody('html ts_file slash form -> route', '/html_ts_file/route/', { status: 200, contains: 'HTML_TS_FILE_ROUTE_WON' });
  await expectCdnHit('html ts_file bare form -> file', '/html_ts_file/route', { status: 200, contains: 'HTML_TS_FILE_CONTENT' });

  // A parametrized trailing-slash route colliding with a mount file: the
  // route owns the slash form of every path it matches — including ones with
  // no underlying file — while the file stays a CDN hit at the bare form.
  await expectBody('pts_file slash form -> route', '/pts_file/route/', { status: 200, contains: 'PTS_ROUTE_WON:route' });
  await expectCdnHit('pts_file bare form -> file', '/pts_file/route', { status: 200, contains: 'PTS_FILE_CONTENT' });
  await expectBody('pts_file slash form without file', '/pts_file/nofile/', { status: 200, contains: 'PTS_ROUTE_WON:nofile' });

  // The same parametrized collision on an html=True mount. The route also
  // owns the slash form of a directory holding an index.html: the CDN's
  // bare-dir 307 still fires, but the slash form it lands on reaches the
  // route, not the CDN index. Files below the directory stay on the CDN.
  await expectBody('html pts_file slash form -> route', '/html_pts_file/route/', { status: 200, contains: 'HTML_PTS_ROUTE_WON:route' });
  await expectCdnHit('html pts_file bare form -> file', '/html_pts_file/route', { status: 200, contains: 'HTML_PTS_FILE_CONTENT' });
  await expectRedirect('html pts_file dir bare 307', '/html_pts_file/docs', '/html_pts_file/docs/');
  await expectBody('html pts_file dir slash -> route', '/html_pts_file/docs/', { status: 200, contains: 'HTML_PTS_ROUTE_WON:docs' });
  await expectCdnHit('html pts_file nested file', '/html_pts_file/docs/index.html', { status: 200, contains: 'HTML_PTS_DOCS_INDEX' });

  // A directory holding an index.html in an html=False mount 404s both the
  // bare and slash forms for HEAD, just as it does for GET.
  await expectStatus('html_false withindex HEAD bare', '/html_false/withindex', { method: 'HEAD', status: 404 });
  await expectStatus('html_false withindex HEAD slash', '/html_false/withindex/', { method: 'HEAD', status: 404 });

  // Overlapping mounts: the earlier /olap/inner mount owns its subtree, so
  // its file wins the collision with the outer html mount's inner/x/index.html
  // directory. /olap/inner/x serves the file directly with no redirect hop;
  // the outer mount's own directories still 307 the bare form and serve the
  // index at the slash form.
  await expectStatus('overlap owned file no redirect', '/olap/inner/x', { status: 200 });
  await expectCdnHit('overlap owned file content', '/olap/inner/x', { status: 200, contains: 'OLAP_INNER_FILE' });
  await expectRedirect('overlap outer dir bare', '/olap/docs', '/olap/docs/');
  await expectCdnHit('overlap outer dir slash', '/olap/docs/', { status: 200, contains: 'OLAP_DOCS_INDEX' });

  // Overlapping frontends resolve by longest prefix, not registration order:
  // /olfe/sub was registered after /olfe but owns its subtree. Its file wins
  // the collision with the outer build's sub/collide.txt, its shell serves
  // the subtree's fallback, and its root redirects the bare form; the outer
  // build serves everything else under /olfe.
  await expectCdnHit('nested frontend collision', '/olfe/sub/collide.txt', { status: 200, contains: 'OLFE_INNER_COLLIDE' });
  await expectCdnHit('outer frontend file', '/olfe/outer.txt', { status: 200, contains: 'OLFE_OUTER_FILE' });
  await expectBody('outer frontend fallback', '/olfe/client-route', { status: 200, contains: 'OLFE_OUTER_SHELL', headers: { accept: 'text/html' } });
  await expectBody('inner frontend fallback', '/olfe/sub/client-route', { status: 200, contains: 'OLFE_INNER_SHELL', headers: { accept: 'text/html' } });
  await expectRedirect('inner frontend bare root', '/olfe/sub', '/olfe/sub/');
  await expectCdnHit('inner frontend slash root', '/olfe/sub/', { status: 200, contains: 'OLFE_INNER_SHELL' });
}

module.exports = async ({ deploymentUrl, fetch, pythonBin }) => {
  const failures = [];
  const state = { base: '', isLocal: false, fetch };
  const helpers = makeProbeHelpers(state, failures);
  const fastapiVersion = readInstalledVersion(pythonBin, 'fastapi') ?? readPinnedVersion(__dirname, 'fastapi');

  // Run locally first (actual FastAPI behaviour — alerts when a new version
  // changes routing semantics our shim or CDN configuration depends on).
  if (pythonBin) {
    await withLocalServer(pythonBin, __dirname, fetch, '/docs', async base => {
      state.base = base; state.isLocal = true;
      await runProbes(helpers, { fastapiVersion });
    });
  }

  // Run against the deployment (expected CDN + Lambda behaviour).
  if (deploymentUrl) {
    state.base = `https://${deploymentUrl}`; state.isLocal = false;
    await runProbes(helpers, { fastapiVersion });
  }

  if (failures.length > 0) throw new Error(failures.join('\n'));
};
