import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@vercel/sandbox');
});

describe('sandboxClient', () => {
  it('injects the vercel-cli user-agent', async () => {
    vi.resetModules();
    class FakeAPIError extends Error {}
    const seen: Headers[] = [];
    const fakeFetch = vi.fn(async (_i: unknown, init: { headers: Headers }) => {
      seen.push(init.headers);
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fakeFetch);
    vi.doMock('@vercel/sandbox', () => ({
      APIError: FakeAPIError,
      Snapshot: {},
      Sandbox: {
        list: async (p: { fetch: typeof fakeFetch }) => {
          await p.fetch('u', { headers: new Headers() });
          return [];
        },
      },
    }));
    const { sandboxClient } = await import(
      '../../../../src/util/sandbox/client'
    );
    await sandboxClient.list({ token: 't', teamId: 'team_1' } as never);
    expect(seen[0].get('user-agent')).toMatch(/^vercel-cli\//);
  });

  it('maps an APIError into a friendly Error using formatSandboxError', async () => {
    vi.resetModules();
    const response = new Response('{"error":{"message":"nope"}}', {
      status: 403,
      statusText: 'Forbidden',
    });
    Object.defineProperty(response, 'url', {
      value: 'https://vercel.com/api/x',
    });
    const { APIError } =
      await vi.importActual<typeof import('@vercel/sandbox')>(
        '@vercel/sandbox'
      );
    const apiError = new APIError(response, {
      json: { error: { message: 'nope' } },
      text: '{}',
    });
    vi.doMock('@vercel/sandbox', async () => {
      const actual =
        await vi.importActual<typeof import('@vercel/sandbox')>(
          '@vercel/sandbox'
        );
      return {
        ...actual,
        Sandbox: {
          list: async () => {
            throw apiError;
          },
        },
      };
    });
    const { sandboxClient } = await import(
      '../../../../src/util/sandbox/client'
    );
    await expect(
      sandboxClient.list({ token: 't', teamId: 'team_1' } as never)
    ).rejects.toThrow(/nope/);
  });
});
