module.exports = async ({ deploymentUrl, fetch }) => {
  const failures = [];

  // redirect_slashes: the runtime redirects /foo/ -> /foo (307) before the
  // frontend is consulted. Buggy: the CDN fallback route matches the
  // trailing-slash path (no extension, navigation Accept) and serves
  // index.html with 200.
  const slash = await fetch(`https://${deploymentUrl}/foo/`, {
    redirect: 'manual',
    headers: { accept: 'text/html' },
  });
  if (![307, 308].includes(slash.status)) {
    const body = await slash.text();
    failures.push(`redirect_slashes: expected 307/308, got ${slash.status} ${JSON.stringify(body)}`);
  }

  // Accept q=0: "text/html;q=0" explicitly rejects html, so neither fastapi
  // 0.139 nor 0.140 treats this as a navigation request and the runtime 404s.
  // Buggy: the fallback route's accept regex matches the literal "text/html"
  // and serves index.html with 200.
  const qzero = await fetch(`https://${deploymentUrl}/qzero-check`, {
    headers: { accept: 'text/html;q=0, application/json' },
  });
  if (qzero.status !== 404) {
    const body = await qzero.text();
    failures.push(`accept q=0: expected 404, got ${qzero.status} ${JSON.stringify(body)}`);
  }

  // Controls: the shadowed route reaches the app, and the fallback works for a
  // genuine navigation request.
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
