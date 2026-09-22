import { afterEach, describe, expect, test, vi } from 'vitest';
import http, { createServer, type IncomingMessage } from 'http';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { listen } from 'async-listen';
import { request } from 'undici';
import { createServerlessEventHandler } from '../../../src/serverless-functions/serverless-handler.mjs';
import type { VercelProxyResponse } from '../../../src/types';

const temporaryDirectories: string[] = [];
const runtimes: Array<{ onExit(): Promise<void> }> = [];

async function createEntrypoint(extension: 'cjs' | 'mjs', source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'vercel-node-handler-'));
  temporaryDirectories.push(directory);
  const entrypoint = join(directory, `index.${extension}`);
  await writeFile(entrypoint, source);
  return entrypoint;
}

async function createRuntime(
  extension: 'cjs' | 'mjs',
  source: string,
  options: {
    shouldAddHelpers?: boolean;
    mode?: 'buffer' | 'streaming';
    isMiddleware?: boolean;
    maxDuration?: number;
  } = {}
) {
  const entrypoint = await createEntrypoint(extension, source);
  const runtime = await createServerlessEventHandler(
    entrypoint,
    {
      shouldAddHelpers: options.shouldAddHelpers ?? true,
      mode: options.mode ?? 'buffer',
      isMiddleware: options.isMiddleware,
    },
    options.maxDuration
  );
  runtimes.push(runtime);
  return runtime;
}

async function incomingRequest(
  options: {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<IncomingMessage> {
  const server = createServer(req => {
    resolveRequest(req);
  });
  let resolveRequest!: (request: IncomingMessage) => void;
  const requestPromise = new Promise<IncomingMessage>(resolve => {
    resolveRequest = resolve;
  });
  const url = await listen(server, { host: '127.0.0.1', port: 0 });

  const clientRequest = request(url, {
    path: options.path ?? '/',
    method: (options.method ?? 'GET') as 'GET',
    headers: options.headers,
    body: options.body,
  });
  const incoming = await requestPromise;
  void clientRequest.finally(() => server.close());
  return incoming;
}

async function readBody(response: VercelProxyResponse) {
  if (response.body === null) return '';
  if (Buffer.isBuffer(response.body)) return response.body.toString();
  const chunks: Buffer[] = [];
  for await (const chunk of response.body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
}

afterEach(async () => {
  await Promise.allSettled(runtimes.splice(0).map(runtime => runtime.onExit()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('production serverless handler contract', () => {
  test('loads CommonJS function exports and adds request/response helpers', async () => {
    const runtime = await createRuntime(
      'cjs',
      `
        module.exports = (req, res) => {
          res.status(201).json({
            body: req.body,
            cookies: req.cookies,
            query: req.query,
          });
        };
      `
    );
    const incoming = await incomingRequest({
      path: '/hello?tag=one&tag=two',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'session=abc; theme=dark',
      },
      body: JSON.stringify({ value: 42 }),
    });

    const response = await runtime.handler(incoming);

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(JSON.parse(await readBody(response))).toEqual({
      body: { value: 42 },
      cookies: { session: 'abc', theme: 'dark' },
      query: { tag: ['one', 'two'] },
    });
  });

  test('loads nested ESM default exports', async () => {
    const runtime = await createRuntime(
      'mjs',
      `
        const handler = (_req, res) => res.end('nested-default');
        export default { default: { default: handler } };
      `,
      { shouldAddHelpers: false }
    );

    const response = await runtime.handler(await incomingRequest());

    expect(response.status).toBe(200);
    expect(await readBody(response)).toBe('nested-default');
  });

  test('routes named Web handlers and returns 405 for missing methods', async () => {
    const runtime = await createRuntime(
      'mjs',
      `
        export function GET(request) {
          return new Response('get:' + new URL(request.url).pathname, {
            headers: { 'x-handler': 'GET' },
          });
        }
        export function POST() { return new Response('posted', { status: 202 }); }
      `
    );

    const getResponse = await runtime.handler(
      await incomingRequest({ path: '/users', method: 'GET' })
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('x-handler')).toBe('GET');
    expect(await readBody(getResponse)).toBe('get:/users');

    const deleteResponse = await runtime.handler(
      await incomingRequest({ method: 'DELETE' })
    );
    expect(deleteResponse.status).toBe(405);
    expect(await readBody(deleteResponse)).toBe('');
  });

  test('uses a fetch export for every supported HTTP method', async () => {
    const runtime = await createRuntime(
      'mjs',
      `
        export function fetch(request) {
          return new Response(request.method + ':' + request.headers.get('x-test'));
        }
      `
    );

    for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await runtime.handler(
        await incomingRequest({
          method,
          headers: { 'x-test': 'forwarded' },
          ...(method === 'GET' ? {} : { body: 'body' }),
        })
      );
      expect(await readBody(response)).toBe(`${method}:forwarded`);
    }
  });

  test('captures a server that calls listen() during module initialization', async () => {
    const runtime = await createRuntime(
      'cjs',
      `
        const { createServer } = require('http');
        createServer((_req, res) => res.end('captured-server')).listen(43210);
      `
    );

    const response = await runtime.handler(await incomingRequest());

    expect(response.status).toBe(200);
    expect(await readBody(response)).toBe('captured-server');
  });

  test('forwards x-forwarded-host as the host seen by user code', async () => {
    const runtime = await createRuntime(
      'cjs',
      `module.exports = (req, res) => res.end(req.headers.host);`
    );

    const response = await runtime.handler(
      await incomingRequest({
        headers: {
          host: 'internal.invalid',
          'x-forwarded-host': 'customer.example',
        },
      })
    );

    expect(await readBody(response)).toBe('customer.example');
  });

  test('preserves multiple Set-Cookie response headers', async () => {
    const runtime = await createRuntime(
      'cjs',
      `
        module.exports = (_req, res) => {
          res.setHeader('set-cookie', ['first=1; Path=/', 'second=2; Path=/']);
          res.end('cookies');
        };
      `
    );

    const response = await runtime.handler(await incomingRequest());

    expect(response.headers.getSetCookie()).toEqual([
      'first=1; Path=/',
      'second=2; Path=/',
    ]);
  });

  test('returns a Buffer in buffered mode and a readable body in streaming mode', async () => {
    const source = `
      module.exports = (_req, res) => {
        res.write('first');
        queueMicrotask(() => res.end('-second'));
      };
    `;
    const buffered = await createRuntime('cjs', source, { mode: 'buffer' });
    const streaming = await createRuntime('cjs', source, { mode: 'streaming' });

    const bufferedResponse = await buffered.handler(await incomingRequest());
    expect(Buffer.isBuffer(bufferedResponse.body)).toBe(true);
    expect(await readBody(bufferedResponse)).toBe('first-second');

    const streamingResponse = await streaming.handler(await incomingRequest());
    expect(Buffer.isBuffer(streamingResponse.body)).toBe(false);
    expect(await readBody(streamingResponse)).toBe('first-second');
  });

  test('onExit waits for request-context waitUntil work', async () => {
    let resolveWaitUntil!: () => void;
    (globalThis as any).__vercelWaitUntilPromise = new Promise<void>(
      resolve => {
        resolveWaitUntil = resolve;
      }
    );
    const runtime = await createRuntime(
      'cjs',
      `
        module.exports = (_req, res) => {
          const { waitUntil } = globalThis[Symbol.for('@vercel/request-context')].get();
          waitUntil(globalThis.__vercelWaitUntilPromise);
          res.end('scheduled');
        };
      `
    );
    await runtime.handler(await incomingRequest());

    let exited = false;
    const exiting = runtime.onExit().then(() => {
      exited = true;
    });
    await Promise.resolve();
    expect(exited).toBe(false);
    resolveWaitUntil();
    await exiting;

    delete (globalThis as any).__vercelWaitUntilPromise;
    runtimes.splice(runtimes.indexOf(runtime), 1);
  });

  test('onExit logs a warning and resolves when waitUntil exceeds maxDuration', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runtime = await createRuntime(
      'cjs',
      `
        module.exports = (_req, res) => {
          globalThis[Symbol.for('@vercel/request-context')].get().waitUntil(
            new Promise(() => {})
          );
          res.end('scheduled');
        };
      `,
      { maxDuration: 0.01 }
    );
    await runtime.handler(await incomingRequest());

    vi.useFakeTimers();
    const exiting = runtime.onExit();
    await vi.advanceTimersByTimeAsync(10);
    await exiting;

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('is still running after 0.01s')
    );
    runtimes.splice(runtimes.indexOf(runtime), 1);
  });

  test('rejects modules that expose no supported handler shape', async () => {
    const entrypoint = await createEntrypoint(
      'mjs',
      `export const value = 'not a handler';`
    );

    await expect(
      createServerlessEventHandler(entrypoint, {
        shouldAddHelpers: true,
        mode: 'buffer',
      })
    ).rejects.toThrow("Can't detect way to handle request");
  });

  test('restores Server.prototype.listen when importing user code fails', async () => {
    const originalListen = http.Server.prototype.listen;
    const entrypoint = await createEntrypoint(
      'mjs',
      `throw new Error('module initialization failed');`
    );

    await expect(
      createServerlessEventHandler(entrypoint, {
        shouldAddHelpers: true,
        mode: 'buffer',
      })
    ).rejects.toThrow('module initialization failed');

    expect(http.Server.prototype.listen).toBe(originalListen);
  });
});
