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
    expect(onRetry).toHaveBeenCalledWith(2);
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
