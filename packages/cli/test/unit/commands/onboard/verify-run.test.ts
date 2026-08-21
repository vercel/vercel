import { describe, expect, it, vi } from 'vitest';
import { parseManifest } from '../../../../src/commands/onboard/verify/manifest';
import { runChecks } from '../../../../src/commands/onboard/verify/run';

function manifestOf(checks: object[]) {
  const parsed = parseManifest(JSON.stringify({ checks }));
  if (!parsed.ok) throw new Error(parsed.errors.join(', '));
  return parsed.manifest;
}

function respond(
  status: number,
  body = '',
  headers: Record<string, string> = {}
): Response {
  return new Response(body, { status, headers });
}

describe('verify runner', () => {
  it('passes when status and body match', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(200, '<div id="root"></div>', { 'content-type': 'text/html' })
    );

    const { outcomes, passed, failed } = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([
        { path: '/', expect: { bodyContains: '<div id="root"' } },
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(passed).toBe(1);
    expect(failed).toBe(0);
    expect(outcomes[0]).toMatchObject({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.vercel.app/',
      expect.objectContaining({ method: 'GET', redirect: 'manual' })
    );
  });

  it('collects every mismatch, with a body snippet', async () => {
    const fetchImpl = async () =>
      respond(500, 'Internal Server Error', { 'content-type': 'text/plain' });

    const { outcomes, failed } = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([
        {
          path: '/api/health',
          expect: {
            status: 200,
            contentType: 'application/json',
            bodyContains: '"ok"',
          },
        },
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(failed).toBe(1);
    expect(outcomes[0].failures).toEqual([
      'status 500 (expected 200)',
      'content-type text/plain (expected application/json)',
      'body missing "\\"ok\\""',
    ]);
    expect(outcomes[0].bodySnippet).toBe('Internal Server Error');
  });

  it('accepts any status in the list', async () => {
    const fetchImpl = async () => respond(308);
    const { passed } = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/old', expect: { status: [200, 308] } }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(passed).toBe(1);
  });

  it('fails on forbidden body content', async () => {
    const fetchImpl = async () => respond(200, '{"detail":"Not Found"}');
    const { outcomes } = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([
        { path: '/x', expect: { notBodyContains: 'Not Found' } },
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].failures[0]).toContain('forbidden');
  });

  it('sends JSON bodies with the implied content type, plus the bypass token', async () => {
    const fetchImpl = vi.fn(async () => respond(201));
    await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([
        {
          method: 'POST',
          path: '/api/todos',
          body: { title: 'x' },
          expect: { status: 201 },
        },
      ]),
      bypassToken: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.body).toBe('{"title":"x"}');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-vercel-protection-bypass': 'secret',
    });
  });

  it('reports a failed request as a failed check, and keeps going', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'))
      .mockResolvedValueOnce(respond(200));

    const { outcomes, passed, failed } = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(failed).toBe(1);
    expect(passed).toBe(1);
    expect(outcomes[0].failures[0]).toContain('request failed');
    expect(outcomes[0].status).toBeUndefined();
  });

  it('retries while the deployment is not answering, then reports the pass', async () => {
    // The observed post-deploy signature: every check fails at the status
    // level seconds after the deploy, then the deployment propagates.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(404))
      .mockResolvedValueOnce(respond(404))
      .mockResolvedValue(respond(200));
    const sleeps: number[] = [];
    const onRetry = vi.fn();

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 30_000,
      onRetry,
      sleepImpl: async ms => {
        sleeps.push(ms);
      },
    });

    expect(result.passed).toBe(2);
    expect(result.attempts).toBe(2);
    expect(onRetry).toHaveBeenCalledWith(2, 'unready');
    expect(sleeps).toHaveLength(1);
  });

  it('does not retry a partial failure — an answering app is a result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(200))
      .mockResolvedValueOnce(respond(500));

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 30_000,
      sleepImpl: async () => {
        throw new Error('must not sleep');
      },
    });

    expect(result.attempts).toBe(1);
    expect(result.passed).toBe(1);
  });

  it('does not retry body-only failures', async () => {
    // Wrong content is the app answering wrong, not the app being unready.
    const fetchImpl = vi.fn(async () => respond(200, 'goodbye'));

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/', expect: { bodyContains: 'hello' } }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 30_000,
      sleepImpl: async () => {
        throw new Error('must not sleep');
      },
    });

    expect(result.attempts).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('runs checks sequentially, in manifest order', async () => {
    const order: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      order.push(String(url));
      return respond(200);
    };
    await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/1' }, { path: '/2' }, { path: '/3' }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(order).toEqual([
      'https://app.vercel.app/1',
      'https://app.vercel.app/2',
      'https://app.vercel.app/3',
    ]);
  });
});

/** A Vercel Authentication redirect: the SSO handshake entry point. */
function protectedRedirect(): Response {
  return respond(302, 'Redirecting...', {
    location:
      'https://vercel.com/sso-api?url=https%3A%2F%2Fapp.vercel.app%2F&nonce=abc',
  });
}

/** A Vercel Authentication 401 that sets the SSO nonce cookie. */
function protectedUnauthorized(): Response {
  return respond(401, 'Authentication Required', {
    'set-cookie': '_vercel_sso_nonce=abc123; Path=/; HttpOnly',
  });
}

describe('verify runner — deployment protection', () => {
  it('refreshes the token and retries the full manifest when all checks are protected', async () => {
    const fetchImpl = vi
      .fn()
      // First pass: both checks blocked by protection.
      .mockResolvedValueOnce(protectedRedirect())
      .mockResolvedValueOnce(protectedRedirect())
      // Second pass, with the refreshed token: both pass.
      .mockResolvedValue(respond(200));
    const refreshBypassToken = vi.fn(async () => 'fresh-token');

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      bypassToken: 'stale-token',
      refreshBypassToken,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(refreshBypassToken).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.protectionRetries).toBe(1);
    expect(result.protectionBlocked).toBe(0);

    // The retried pass carries the refreshed token.
    const lastCall = fetchImpl.mock.calls.at(-1) as unknown as [
      string,
      RequestInit,
    ];
    expect(lastCall[1].headers).toMatchObject({
      'x-vercel-protection-bypass': 'fresh-token',
    });
  });

  it('retries the full manifest even when only early checks were protected', async () => {
    // The observed misclassification: protection blocks the first requests
    // of a pass while later ones pass — a partial pass must not end retries.
    const order: string[] = [];
    let pass = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      order.push(String(url));
      if (order.length === 1) return protectedRedirect();
      if (order.length === 2) return respond(200);
      pass = 2;
      return respond(200);
    });

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      refreshBypassToken: async () => 'fresh-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(pass).toBe(2);
    // Full manifest, original order, from the beginning.
    expect(order).toEqual([
      'https://app.vercel.app/a',
      'https://app.vercel.app/b',
      'https://app.vercel.app/a',
      'https://app.vercel.app/b',
    ]);
    expect(result.passed).toBe(2);
    expect(result.protectionRetries).toBe(1);
  });

  it('reruns a stateful POST-then-GET manifest from the beginning in order', async () => {
    const order: string[] = [];
    const fetchImpl = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        order.push(`${init?.method} ${String(url)}`);
        return order.length <= 2 ? protectedUnauthorized() : respond(200);
      }
    );

    await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([
        {
          method: 'POST',
          path: '/api/todos',
          body: { title: 'x' },
          expect: { status: 200 },
        },
        { path: '/api/todos' },
      ]),
      refreshBypassToken: async () => 'fresh-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(order).toEqual([
      'POST https://app.vercel.app/api/todos',
      'GET https://app.vercel.app/api/todos',
      'POST https://app.vercel.app/api/todos',
      'GET https://app.vercel.app/api/todos',
    ]);
  });

  it('does not classify an ordinary application redirect as protection', async () => {
    const fetchImpl = vi.fn(async () =>
      respond(302, 'Redirecting...', { location: '/login' })
    );

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/' }, { path: '/two' }]),
      refreshBypassToken: async () => {
        throw new Error('must not refresh for an application redirect');
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(result.protectionRetries).toBe(0);
    expect(result.protectionBlocked).toBe(0);
    expect(result.outcomes[0].failureClass).toBe('application');
  });

  it('does not retry application 401/403 responses without protection signals', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(401, 'unauthorized'))
      .mockResolvedValueOnce(respond(403, 'forbidden'));

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }]),
      refreshBypassToken: async () => {
        throw new Error('must not refresh for application auth failures');
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(result.protectionRetries).toBe(0);
    expect(result.outcomes.map(outcome => outcome.failureClass)).toEqual([
      'application',
      'application',
    ]);
  });

  it('stays bounded and names protection when the refresh fails', async () => {
    const fetchImpl = vi.fn(async () => protectedRedirect());
    const refreshBypassToken = vi.fn(async () => null);

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/a' }, { path: '/b' }, { path: '/c' }]),
      refreshBypassToken,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
      sleepImpl: async () => {
        throw new Error('protection retries must not use the readiness sleep');
      },
    });

    // Two protection retries (the budget), then a bounded stop — no
    // readiness retries piled on top of a protection result.
    expect(refreshBypassToken).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(3);
    expect(result.protectionRetries).toBe(2);
    expect(result.protectionBlocked).toBe(3);
    expect(result.outcomes.every(o => !o.ok)).toBe(true);
    expect(
      result.outcomes.every(o => o.failureClass === 'deployment-protection')
    ).toBe(true);
    expect(result.outcomes[0].failures).toContain(
      'blocked by Vercel Deployment Protection'
    );
  });

  it('a protected response that matches the expectation is a pass, not a retry', async () => {
    // The author explicitly expects the protected redirect — asking for it
    // means measuring it, so classification must not override the match.
    const fetchImpl = vi.fn(async () => protectedRedirect());

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/', expect: { status: 302 } }]),
      refreshBypassToken: async () => {
        throw new Error('must not refresh a passing check');
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(result.passed).toBe(1);
    expect(result.protectionRetries).toBe(0);
    expect(result.outcomes[0].failureClass).toBeUndefined();
  });

  it('works without a refresh callback — bounded reruns with the same token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(protectedUnauthorized())
      .mockResolvedValue(respond(200));

    const result = await runChecks({
      baseUrl: 'https://app.vercel.app',
      manifest: manifestOf([{ path: '/' }]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readinessMs: 0,
    });

    expect(result.passed).toBe(1);
    expect(result.protectionRetries).toBe(1);
  });
});
