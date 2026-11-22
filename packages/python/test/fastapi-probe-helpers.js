/**
 * Shared helpers for probe.js files in packages/python/test/fixtures/.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const net = require('net');

/** Bind to :0, let the OS choose a free port, then return it. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

/** Poll `url` every 200 ms until any HTTP response arrives. */
async function waitForServer(url, fetch) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: 'manual' });
      return;
    } catch {
      /**/
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} did not start within 15s`);
}

/**
 * Spawn `pythonBin -m uvicorn main:app` in `cwd`, wait for `readyPath` to
 * respond, call `callback(base)`, then kill the process.
 */
async function withLocalServer(pythonBin, cwd, fetch, readyPath, callback) {
  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(
    pythonBin,
    [
      '-m',
      'uvicorn',
      'main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd, stdio: 'ignore' }
  );
  try {
    await waitForServer(`${base}${readyPath}`, fetch);
    await callback(base);
  } finally {
    proc.kill();
    await new Promise(r => {
      proc.once('exit', r);
      setTimeout(r, 500);
    });
  }
}

/**
 * Repeatedly call `doFetch(signal)` until the response's `x-vercel-cache`
 * header is `HIT`, or `deadlineMs` elapses.
 *
 * A freshly deployed asset needs a first request to prime the edge CDN
 * cache; how long the edge then takes to actually start reporting `HIT` on
 * subsequent requests is not bounded by a fixed, small number of requests.
 * Polling with a bounded deadline lets a slow-but-genuine warm-up succeed,
 * while a permanent miss still fails once the deadline is reached -- same
 * failure behavior as before, just not racing a fixed 2-request budget.
 *
 * The deadline is enforced even if an individual attempt stalls (e.g. a
 * hung connection): each attempt gets an `AbortSignal` that fires once the
 * remaining budget is exhausted, so a stalled probe is aborted rather than
 * left to hang past the deadline (or leak an open socket).
 *
 * Returns the last observed `x-vercel-cache` header value (which is `'HIT'`
 * if and only if a HIT was observed before the deadline).
 */
async function pollForCdnHit(
  doFetch,
  { deadlineMs = 8_000, intervalMs = 220 } = {}
) {
  const deadline = Date.now() + deadlineMs;
  let cache;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return cache;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), remaining);
    let res;
    try {
      res = await doFetch(controller.signal);
    } catch {
      // Aborted (deadline hit mid-request) or a transient network error;
      // treat as "still not a HIT" and fall through to the deadline check.
      res = null;
    } finally {
      clearTimeout(abortTimer);
    }
    if (res) {
      cache = res.headers.get('x-vercel-cache');
      if (cache === 'HIT') return cache;
    }
    const sleepMs = Math.min(intervalMs, deadline - Date.now());
    if (sleepMs <= 0) return cache;
    await new Promise(r => setTimeout(r, sleepMs));
  }
}

/**
 * Create probe assertion helpers bound to a mutable state object.
 *
 * state.base    – current URL prefix (e.g. "https://dep.vercel.app" or "http://127.0.0.1:PORT")
 * state.isLocal – true when probing a local server; skips the x-vercel-cache HIT check
 * state.fetch   – the fetch function to use for all requests
 * failures      – string array; failures are pushed here
 *
 * Returns { expectCdnHit, expectBody, expectStatus, expectRedirect }.
 */
function makeProbeHelpers(state, failures) {
  // Status + body always. CDN cache (poll-for-HIT check) only on deployment.
  async function expectCdnHit(name, path, { status, contains, headers }) {
    const res = await state.fetch(state.base + path, { headers });
    const body = await res.text();
    if (res.status !== status)
      failures.push(`${name}: expected ${status}, got ${res.status}`);
    if (!body.includes(contains))
      failures.push(
        `${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 80))}`
      );
    if (!state.isLocal) {
      // Prime the cache, then poll (bounded) for the edge to report HIT.
      await state.fetch(state.base + path, { headers });
      const cache = await pollForCdnHit(signal =>
        state.fetch(state.base + path, { headers, signal })
      );
      if (cache !== 'HIT')
        failures.push(
          `${name}: expected x-vercel-cache: HIT, got ${JSON.stringify(cache)}`
        );
    }
  }

  async function expectBody(
    name,
    path,
    { method = 'GET', status, contains, headers } = {}
  ) {
    const res = await state.fetch(state.base + path, { method, headers });
    const body = await res.text();
    if (res.status !== status)
      failures.push(
        `${name}: expected ${status}, got ${res.status} ${JSON.stringify(body.slice(0, 60))}`
      );
    if (contains && !body.includes(contains))
      failures.push(
        `${name}: expected ${JSON.stringify(contains)}, got ${JSON.stringify(body.slice(0, 60))}`
      );
  }

  async function expectStatus(
    name,
    path,
    { method = 'GET', status, headers = {} } = {}
  ) {
    const res = await state.fetch(state.base + path, {
      method,
      headers,
      redirect: 'manual',
    });
    if (res.status !== status)
      failures.push(`${name}: expected ${status}, got ${res.status}`);
  }

  async function expectRedirect(name, path, endsWith) {
    const res = await state.fetch(state.base + path, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    if (![307, 308].includes(res.status)) {
      failures.push(`${name}: expected 307/308, got ${res.status}`);
      return;
    }
    const loc = res.headers.get('location') || '';
    if (!loc.endsWith(endsWith))
      failures.push(
        `${name}: expected Location ending ${endsWith}, got ${JSON.stringify(loc)}`
      );
  }

  return { expectCdnHit, expectBody, expectStatus, expectRedirect };
}

/**
 * Read the installed version of a package by asking the Python interpreter.
 * Returns the version as an array of numbers (e.g. [0, 140, 0]), or null
 * when the interpreter is not provided or the package cannot be found.
 */
function readInstalledVersion(pythonBin, packageName) {
  if (!pythonBin) return null;
  try {
    const output = execFileSync(
      pythonBin,
      [
        '-c',
        `import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(packageName)}))`,
      ],
      { encoding: 'utf8' }
    );
    return output.trim().split('.').map(Number);
  } catch {
    return null;
  }
}

/**
 * Read the pinned version of a package from a fixture's pyproject.toml.
 * Returns the version as an array of numbers (e.g. [0, 140, 0]), or null
 * when the package is not listed or the file cannot be read.
 */
function readPinnedVersion(fixtureDir, packageName) {
  try {
    const toml = fs.readFileSync(
      path.join(fixtureDir, 'pyproject.toml'),
      'utf8'
    );
    const m = toml.match(new RegExp(String.raw`${packageName}==([\d.]+)`));
    return m ? m[1].split('.').map(Number) : null;
  } catch {
    return null;
  }
}

module.exports = {
  findFreePort,
  waitForServer,
  withLocalServer,
  makeProbeHelpers,
  pollForCdnHit,
  readInstalledVersion,
  readPinnedVersion,
};
