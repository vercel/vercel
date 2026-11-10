import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

const {
  pollForCdnHit,
  makeProbeHelpers,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('./fastapi-probe-helpers');

/**
 * A minimal mock "edge CDN" server: it reports `x-vercel-cache: MISS` for
 * the first `warmUpAfterRequests` requests to a path (or forever, if
 * `Infinity`), then `HIT` afterwards -- optionally only after
 * `warmUpDelayMs` has elapsed, to simulate real propagation latency. A
 * `stallOnRequest` index can make a single request hang indefinitely to
 * simulate a stalled probe.
 */
function startMockCdnServer({
  warmUpAfterRequests = 0,
  warmUpDelayMs = 0,
  stallOnRequest = -1,
} = {}) {
  const startedAt = Date.now();
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    if (requestCount === stallOnRequest) {
      // Never respond -- simulates a hung connection / stalled probe.
      return;
    }
    const warmedUpByCount = requestCount > warmUpAfterRequests;
    const warmedUpByTime = Date.now() - startedAt >= warmUpDelayMs;
    const cache = warmedUpByCount && warmedUpByTime ? 'HIT' : 'MISS';
    res.writeHead(200, { 'x-vercel-cache': cache });
    res.end('ok');
  });
  return new Promise<{
    url: string;
    close: () => Promise<void>;
    getRequestCount: () => number;
  }>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>(r => server.close(() => r())),
        getRequestCount: () => requestCount,
      });
    });
  });
}

describe('pollForCdnHit', () => {
  const servers: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(s => s.close()));
  });

  it('succeeds once the CDN starts reporting HIT within the deadline (delayed warm-up)', async () => {
    // Warms up after a delay that a fixed "2 extra unthrottled fetches"
    // budget (completing in single-digit ms) could never wait out, but
    // that fits comfortably inside the poll deadline.
    const server = await startMockCdnServer({ warmUpDelayMs: 400 });
    servers.push(server);

    const start = Date.now();
    const cache = await pollForCdnHit(signal => fetch(server.url, { signal }), {
      deadlineMs: 3000,
      intervalMs: 100,
    });
    const elapsed = Date.now() - start;

    expect(cache).toBe('HIT');
    // It should have actually waited for warm-up, not returned instantly.
    expect(elapsed).toBeGreaterThanOrEqual(300);
    // And it should not have burned the whole deadline either.
    expect(elapsed).toBeLessThan(3000);
  });

  it('fails within the deadline for a permanent miss', async () => {
    const server = await startMockCdnServer({ warmUpAfterRequests: Infinity });
    servers.push(server);

    const start = Date.now();
    const cache = await pollForCdnHit(signal => fetch(server.url, { signal }), {
      deadlineMs: 1000,
      intervalMs: 100,
    });
    const elapsed = Date.now() - start;

    expect(cache).toBe('MISS');
    // Bounded: must not hang past the deadline (with slack for scheduling).
    expect(elapsed).toBeLessThan(2000);
  });

  it('enforces the deadline even when a probe stalls', async () => {
    // The 2nd request never responds; a naive implementation that
    // unconditionally awaits each fetch would hang well past the deadline.
    const server = await startMockCdnServer({
      warmUpAfterRequests: Infinity,
      stallOnRequest: 2,
    });
    servers.push(server);

    const start = Date.now();
    const cache = await pollForCdnHit(signal => fetch(server.url, { signal }), {
      deadlineMs: 900,
      intervalMs: 100,
    });
    const elapsed = Date.now() - start;

    expect(cache).toBe('MISS');
    expect(elapsed).toBeLessThan(1800);
  });

  it('reproduces the original bug: a fixed unthrottled 2-request check fails delayed warm-up', async () => {
    // This mirrors the *old* expectCdnHit behavior directly (prime + 2
    // immediate unthrottled fetches, no wait) to demonstrate the race that
    // caused the intermittent CI failures.
    const server = await startMockCdnServer({ warmUpDelayMs: 400 });
    servers.push(server);

    await fetch(server.url); // priming request
    await fetch(server.url); // old: 1st extra fetch
    const res = await fetch(server.url); // old: 2nd extra fetch (checked)
    const cache = res.headers.get('x-vercel-cache');

    // Old fixed-budget approach completes in single-digit ms and therefore
    // observes MISS -- this is the reproduced intermittent failure.
    expect(cache).toBe('MISS');
  });
});

describe('expectCdnHit (via makeProbeHelpers)', () => {
  const servers: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(s => s.close()));
  });

  it('passes for delayed warm-up and preserves status/body assertions', async () => {
    const server = await startMockCdnServer({ warmUpDelayMs: 400 });
    servers.push(server);

    const failures: string[] = [];
    const state = {
      base: server.url.replace(/\/$/, ''),
      isLocal: false,
      fetch: (url: string, opts?: RequestInit) => fetch(url, opts),
    };
    const { expectCdnHit } = makeProbeHelpers(state, failures);

    await expectCdnHit('mock asset', '/', { status: 200, contains: 'ok' });

    expect(failures).toEqual([]);
  });

  it('still fails (does not weaken the assertion) for a permanent miss', async () => {
    const server = await startMockCdnServer({ warmUpAfterRequests: Infinity });
    servers.push(server);

    const failures: string[] = [];
    const state = {
      base: server.url.replace(/\/$/, ''),
      isLocal: false,
      fetch: (url: string, opts?: RequestInit) => fetch(url, opts),
    };
    const { expectCdnHit } = makeProbeHelpers(state, failures);

    await expectCdnHit('mock asset', '/', { status: 200, contains: 'ok' });

    expect(failures).toEqual([
      'mock asset: expected x-vercel-cache: HIT, got "MISS"',
    ]);
  }, 15_000);
});
