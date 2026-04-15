import { afterEach, describe, expect, it, vi } from 'vitest';
import { listen } from 'async-listen';
import fetch, { Response } from 'node-fetch';
import { Readable } from 'stream';
import type { Server } from 'http';
import { createProxy } from '../../../../src/util/extension/proxy';

// Mock output-manager to avoid side-effects and heavy transitive imports.
vi.mock('../../../../src/output-manager', () => ({
  default: { prettyError: vi.fn() },
}));

// Mock errors-ts so we can use APIError without pulling in build-utils /
// python-analysis (which requires a Rust toolchain to build locally).
vi.mock('../../../../src/util/errors-ts', () => {
  class APIError extends Error {
    status: number;
    serverMessage: string;
    [key: string]: unknown;
    constructor(message: string, status: number, body?: object) {
      super(message);
      this.status = status;
      this.serverMessage = message;
      if (body) {
        for (const [key, value] of Object.entries(body)) {
          if (key !== 'message') {
            this[key] = value;
          }
        }
      }
    }
  }
  return { APIError };
});

// Re-import so the proxy module picks up the mocked APIError.
const { APIError } = await import('../../../../src/util/errors-ts');

function makeClient(
  fetchImpl: (...args: unknown[]) => Promise<Response>
): Parameters<typeof createProxy>[0] {
  return { fetch: fetchImpl } as Parameters<typeof createProxy>[0];
}

function jsonResponse(status: number, body: unknown): Response {
  const json = JSON.stringify(body);
  const readable = Readable.from([json]);
  return new Response(readable as any, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createProxy', () => {
  let proxy: Server;
  let proxyUrl: URL;

  async function startProxy(
    fetchImpl: (...args: unknown[]) => Promise<Response>
  ) {
    proxy = createProxy(makeClient(fetchImpl));
    proxyUrl = await listen(proxy, { port: 0, host: '127.0.0.1' });
  }

  afterEach(async () => {
    if (proxy) {
      await new Promise<void>(resolve => {
        proxy.close(() => resolve());
      });
    }
  });

  it('should forward successful 200 responses', async () => {
    await startProxy(async () => jsonResponse(200, { ok: true }));

    const res = await fetch(new URL('/v1/test', proxyUrl).href);
    expect(res.status).toEqual(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('should forward APIError with original status code and error body', async () => {
    const apiError = new APIError(
      'Deployment integrations are still provisioning. Wait for integrations to complete.',
      // @ts-expect-error — mocked constructor takes (message, status, body)
      400,
      {
        code: 'deployment_not_ready_integrations_pending',
        integrationsStatus: 'pending',
      }
    );

    await startProxy(async () => {
      throw apiError;
    });

    const res = await fetch(new URL('/v1/test-error', proxyUrl).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toEqual(400);
    const body = (await res.json()) as {
      error: { code: string; message: string; integrationsStatus: string };
    };
    expect(body.error.code).toEqual(
      'deployment_not_ready_integrations_pending'
    );
    expect(body.error.message).toEqual(
      'Deployment integrations are still provisioning. Wait for integrations to complete.'
    );
    expect(body.error.integrationsStatus).toEqual('pending');
  });

  it('should forward 404 APIError', async () => {
    // @ts-expect-error — mocked constructor takes (message, status, body)
    const apiError = new APIError('Resource not found', 404, {
      code: 'not_found',
    });

    await startProxy(async () => {
      throw apiError;
    });

    const res = await fetch(new URL('/v1/not-found', proxyUrl).href);

    expect(res.status).toEqual(404);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toEqual('not_found');
    expect(body.error.message).toEqual('Resource not found');
  });

  it('should return 500 for non-API errors', async () => {
    await startProxy(async () => {
      throw new Error('connection refused');
    });

    const res = await fetch(new URL('/v1/broken', proxyUrl).href);

    expect(res.status).toEqual(500);
    const text = await res.text();
    expect(text).toEqual('Unexpected error during API call');
  });
});
