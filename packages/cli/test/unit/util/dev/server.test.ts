import { Readable } from 'stream';
import { request } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { frameworkList } from '@vercel/frameworks';
import { getVercelIgnore } from '@vercel/client';
import DevServer from '../../../../src/util/dev/server';
import output from '../../../../src/output-manager';
import {
  DEV_RESOURCE_TOKEN,
  listenOnDevResourcePort,
} from '../../../../src/util/dev/resource-servers';
import {
  DEV_RUNTIME_CACHE_API_PREFIX,
  RuntimeCacheStore,
  getDevRuntimeCacheEnv,
} from '../../../../src/util/dev/runtime-cache';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));

describe('DevServer build filtering', () => {
  it('keeps `api/` builds for every framework runtime when services are not configured', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    const frameworkRuntimes = new Set(
      frameworkList.map(f => f.useRuntime?.use).filter(Boolean)
    );

    expect(frameworkRuntimes.size).toBeGreaterThan(0);
    for (const use of frameworkRuntimes) {
      expect(
        shouldBuildInDev({ use: use as string, src: 'api/handler.rs' })
      ).toBe(true);
    }
  });

  it('filters framework builds that are not in the `api/` directory', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(shouldBuildInDev({ use: '@vercel/next', src: 'package.json' })).toBe(
      false
    );
    expect(shouldBuildInDev({ use: '@vercel/rust', src: 'src/main.rs' })).toBe(
      false
    );
  });

  it('keeps versioned `api/` builds with a leading "./" in `src`', () => {
    const server = new DevServer(process.cwd(), {});
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(
      shouldBuildInDev({ use: '@vercel/rust@1.4.0', src: './api/simple.rs' })
    ).toBe(true);
  });

  it('keeps the previous filtering behavior in services mode', () => {
    const server = new DevServer(process.cwd(), {
      services: [{ name: 'rust-api' }],
    } as any);
    const shouldBuildInDev = (server as any).shouldBuildInDev as (build: {
      use: string;
      src?: string;
    }) => boolean;

    expect(
      shouldBuildInDev({ use: '@vercel/rust', src: 'api/simple.rs' })
    ).toBe(false);
    expect(shouldBuildInDev({ use: '@vercel/node', src: 'api/date.js' })).toBe(
      true
    );
  });

  it('keeps only the top-level proxy build in services mode', async () => {
    const cwd = join(__dirname, '../../../fixtures/unit/commands/build/proxy');
    const server = new DevServer(cwd, {
      services: [{}],
    } as any);
    (server as any).sidecars = [];
    (server as any)._address = new URL('http://localhost:3000');
    // Deliberately not stubbing `validateVercelConfig`: the synthesized
    // `proxy` build used to trip its `proxy` + `builds` rule and exit.
    (server as any).exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    (server as any).readJsonFile = vi.fn(async (name: string) => {
      if (name === 'package.json') {
        return null;
      }
      return {
        version: 2,
        projectSettings: { framework: 'services' },
        proxy: { entrypoint: 'proxy.ts', matcher: '/api/:func*' },
        services: {
          api: {
            root: '.',
            runtime: 'node',
            entrypoint: 'middleware.ts',
          },
        },
      };
    });

    const config = await server._getVercelConfig();

    expect(config.builds).toEqual([
      {
        src: 'proxy.ts',
        use: '@vercel/node@latest',
        config: {
          zeroConfig: true,
          middleware: true,
          middlewareRuntime: 'nodejs',
          middlewareMatcher: '/api/:func*',
        },
      },
    ]);
  });

  it('keeps the zero-config proxy build alongside detected builds', async () => {
    const cwd = join(__dirname, '../../../fixtures/unit/commands/build/proxy');
    const server = new DevServer(cwd, {} as any);
    (server as any).sidecars = [];
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    (server as any).readJsonFile = vi.fn(async (name: string) => {
      if (name === 'package.json') {
        return null;
      }
      return {
        version: 2,
        proxy: { entrypoint: 'proxy.ts' },
      };
    });

    const config = await server._getVercelConfig();

    expect(config.builds).toContainEqual({
      src: 'proxy.ts',
      use: '@vercel/node@latest',
      config: {
        zeroConfig: true,
        middleware: true,
        middlewareRuntime: 'nodejs',
      },
    });
  });
});

describe('DevServer buildpack builds', () => {
  let cwd: string;

  beforeAll(async () => {
    // A Rack app the Ruby preset detects; with the buildpack flag on, project
    // detection routes it to a `@vercel/container` buildpack build.
    cwd = await mkdtemp(join(tmpdir(), 'vc-dev-ruby-buildpack-'));
    await writeFile(join(cwd, 'Gemfile'), 'source "https://rubygems.org"\n');
    await writeFile(join(cwd, 'config.ru'), 'run ->(_env) { [200, {}, []] }\n');
  });

  afterAll(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createServer(vercelConfig: Record<string, unknown>) {
    const server = new DevServer(cwd, {} as any);
    (server as any).sidecars = [];
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    (server as any).readJsonFile = vi.fn(async (name: string) =>
      name === 'package.json' ? null : { version: 2, ...vercelConfig }
    );
    return server;
  }

  it('fails clearly when detection selects a buildpack build', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const server = createServer({ framework: 'ruby' });

    await expect(server._getVercelConfig()).rejects.toMatchObject({
      code: 'BUILDPACK_DEV_UNSUPPORTED',
      message: "`vercel dev` doesn't support Ruby projects yet.",
    });
    // The error propagates to the caller; config resolution never shuts the
    // server down itself, which would deadlock a request awaiting the config.
    expect((server as any).exit).not.toHaveBeenCalled();
  });

  it('rejects the shared config promise without leaving an unhandled rejection, then re-resolves after a fix', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const server = createServer({ framework: 'ruby' });

    // Two concurrent callers (a request and the watcher, say) share one
    // in-flight promise and both observe the rejection.
    const first = server.getVercelConfig();
    const second = server.getVercelConfig();
    expect(second).toBe(first);
    await expect(first).rejects.toMatchObject({
      code: 'BUILDPACK_DEV_UNSUPPORTED',
    });
    await expect(second).rejects.toMatchObject({
      code: 'BUILDPACK_DEV_UNSUPPORTED',
    });
    expect((server as any).exit).not.toHaveBeenCalled();

    // The next call re-resolves from scratch rather than replaying the cached
    // rejection: with the flag off the same project resolves to its legacy
    // Ruby build.
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', undefined);
    const config = await server.getVercelConfig();
    expect(config.builds).toContainEqual(
      expect.objectContaining({
        src: 'config.ru',
        use: expect.stringMatching(/^@vercel\/ruby/),
      })
    );
  });

  it('reports a filesystem-event failure instead of crashing the process', async () => {
    const server = createServer({ framework: 'ruby' });
    const failure = new Error('config no longer resolves');
    (server as any).handleFilesystemEvents = vi.fn(async () => {
      throw failure;
    });
    (server as any).watchAggregationTimeout = 0;
    const prettyError = vi.mocked(output.prettyError);
    prettyError.mockClear();

    server.enqueueFsEvent('change', join(cwd, 'vercel.json'));
    await vi.waitFor(() => {
      expect(prettyError).toHaveBeenCalledWith(failure);
    });
    expect((server as any).handleFilesystemEvents).toHaveBeenCalledWith([
      { type: 'change', path: join(cwd, 'vercel.json') },
    ]);
  });

  it('fails even when the project has a Development Command', async () => {
    // A Development Command does not make the build runnable yet; support
    // for running the app through it comes later.
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    const server = createServer({
      framework: 'ruby',
      devCommand: 'bundle exec rackup -p $PORT',
    });

    await expect(server._getVercelConfig()).rejects.toMatchObject({
      code: 'BUILDPACK_DEV_UNSUPPORTED',
      message: "`vercel dev` doesn't support Ruby projects yet.",
    });
  });

  it('keeps the legacy Ruby runtime build when the buildpack flag is off', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', undefined);
    const server = createServer({ framework: 'ruby' });

    const config = await server._getVercelConfig();

    expect(config.builds).toContainEqual(
      expect.objectContaining({
        src: 'config.ru',
        use: expect.stringMatching(/^@vercel\/ruby/),
      })
    );
  });
});

describe('DevServer queue routes', () => {
  it('forwards the VQS idempotency key to the queue broker', async () => {
    const server = new DevServer(process.cwd(), {});
    const enqueue = vi.fn().mockReturnValue({ messageId: 'message-id' });
    (server as any).queueBroker = { enqueue };

    const req = Readable.from([
      Buffer.from('{"attempt":1}'),
    ]) as IncomingMessage;
    req.method = 'POST';
    req.headers = {
      'content-type': 'application/json',
      'vqs-idempotency-key': 'order-123',
      'vqs-retention-seconds': '120',
      'vqs-delay-seconds': '5',
    };
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleQueuesRoute(req, res, '/api/v3/topic/orders');

    expect(enqueue).toHaveBeenCalledWith(
      'orders',
      Buffer.from('{"attempt":1}'),
      'application/json',
      {
        retentionSeconds: 120,
        delaySeconds: 5,
        idempotencyKey: 'order-123',
      }
    );
    expect(res.writeHead).toHaveBeenCalledWith(201, {
      'Content-Type': 'application/json',
      'Vqs-Message-Id': 'message-id',
    });
  });

  it('redirects duplicate message IDs to the original message ID', async () => {
    const server = new DevServer(process.cwd(), {});
    const getOriginalMessageIdForDuplicate = vi
      .fn()
      .mockReturnValue('original-message-id');
    const receiveById = vi.fn();
    (server as any).queueBroker = {
      getOriginalMessageIdForDuplicate,
      receiveById,
    };

    const req = Readable.from([]) as IncomingMessage;
    req.method = 'POST';
    req.headers = {};
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await (server as any).handleQueuesRoute(
      req,
      res,
      '/api/v3/topic/orders/consumer/worker/id/duplicate-message-id'
    );

    expect(getOriginalMessageIdForDuplicate).toHaveBeenCalledWith(
      'orders',
      'duplicate-message-id'
    );
    expect(receiveById).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(409, {
      'Content-Type': 'application/json',
    });
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({
        error: 'This messageId was a duplicate - use originalMessageId instead',
        originalMessageId: 'original-message-id',
      })
    );
  });
});

describe('DevServer dedicated resource listeners', () => {
  it('serves Queues on its native API path', async () => {
    const server = new DevServer(process.cwd(), {});
    const enqueue = vi.fn().mockReturnValue({ messageId: 'message-id' });
    (server as any).queueBroker = { enqueue, stop: vi.fn() };
    const listener = await listenOnDevResourcePort(
      (server as any).queueServer,
      {
        name: 'Vercel Queues',
        flag: '--queue-port',
        defaultPort: 4782,
        port: 0,
      }
    );
    (server as any).queueOrigin = listener.origin;

    try {
      const response = await fetch(`${listener.origin}/api/v3/topic/orders`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
          'content-type': 'application/json',
        },
        body: '{"attempt":1}',
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ messageId: 'message-id' });
      expect(enqueue).toHaveBeenCalledWith(
        'orders',
        Buffer.from('{"attempt":1}'),
        'application/json',
        {
          retentionSeconds: undefined,
          delaySeconds: undefined,
          idempotencyKey: undefined,
        }
      );
    } finally {
      await server.stop();
    }
  });

  it('rejects missing credentials and DNS rebinding hosts', async () => {
    const server = new DevServer(process.cwd(), {});
    const enqueue = vi.fn();
    (server as any).queueBroker = { enqueue, stop: vi.fn() };
    const listener = await listenOnDevResourcePort(
      (server as any).queueServer,
      {
        name: 'Vercel Queues',
        flag: '--queue-port',
        defaultPort: 4782,
        port: 0,
      }
    );
    (server as any).queueOrigin = listener.origin;

    try {
      const unauthorized = await fetch(
        `${listener.origin}/api/v3/topic/orders`,
        { method: 'POST', body: '{}' }
      );
      expect(unauthorized.status).toBe(401);

      const requestStatus = (host: string) =>
        new Promise<number>((resolve, reject) => {
          const req = request(
            {
              hostname: '127.0.0.1',
              port: listener.port,
              path: '/api/v3/topic/orders',
              method: 'POST',
              headers: {
                authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
                host,
              },
            },
            res => {
              res.resume();
              resolve(res.statusCode || 0);
            }
          );
          req.once('error', reject);
          req.end('{}');
        });

      await expect(requestStatus('attacker.example')).resolves.toBe(403);
      await expect(
        requestStatus(`localhost:${listener.port}/path`)
      ).resolves.toBe(403);
      await expect(
        requestStatus(`localhost:${listener.port + 1}`)
      ).resolves.toBe(403);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await server.stop();
    }
  });

  it('shares Runtime Cache state with the authenticated container alias', async () => {
    const server = new DevServer(process.cwd(), {});
    (server as any).runtimeCache = new RuntimeCacheStore();
    const listener = await listenOnDevResourcePort(
      (server as any).runtimeCacheServer,
      {
        name: 'Runtime Cache',
        flag: '--runtime-cache-port',
        defaultPort: 4783,
        port: 0,
      }
    );
    (server as any).runtimeCacheOrigin = listener.origin;

    try {
      const setResponse = await fetch(
        `${listener.origin}/v1/suspense-cache/products`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${DEV_RESOURCE_TOKEN}` },
          body: '{"count":1}',
        }
      );
      expect(setResponse.status).toBe(200);

      const req = Readable.from([]) as IncomingMessage;
      req.method = 'GET';
      req.url = `/_svc/_cache/${(server as any).resourceProxyToken}/v1/suspense-cache/products`;
      req.headers = {
        authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
      };
      (server as any).buildMatches.set('container', {
        builderWithPkg: { pkg: { name: '@vercel/container' } },
      });
      const res = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;

      await server.serveProjectAsNowV2(req, res, 'request-id', {
        version: 2,
      } as any);

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
      expect((res.end as any).mock.calls[0][0].toString()).toBe('{"count":1}');
    } finally {
      await server.stop();
    }
  });

  it.each([
    '/_svc/_queues/test-proxy-token/api/v3/topic/orders',
    '/_svc/_cache/test-proxy-token/v1/suspense-cache/products',
  ])('requires authorization on container alias %s', async requestUrl => {
    const server = new DevServer(process.cwd(), {});
    (server as any).resourceProxyToken = 'test-proxy-token';
    (server as any).queueBroker = { stop: vi.fn() };
    (server as any).runtimeCache = new RuntimeCacheStore();
    (server as any).buildMatches.set('container', {
      builderWithPkg: { pkg: { name: '@vercel/container' } },
    });
    const req = Readable.from([]) as IncomingMessage;
    req.method = 'GET';
    req.url = requestUrl;
    req.headers = {};
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    await server.serveProjectAsNowV2(req, res, 'request-id', {
      version: 2,
    } as any);

    expect(res.writeHead).toHaveBeenCalledWith(401, {
      'WWW-Authenticate': 'Bearer',
    });
    await server.stop();
  });

  it('provides authenticated proxy configuration to container builders', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).queueOrigin = 'http://127.0.0.1:4782';
    (server as any).runtimeCacheOrigin = 'http://127.0.0.1:4783';
    (server as any).resourceProxyToken = 'test-proxy-token';
    (server as any).schedulesOrigin = 'http://127.0.0.1:4784';

    const env = (server as any).getBuilderDevEnv(
      { builderWithPkg: { pkg: { name: '@vercel/container' } } },
      {
        VERCEL_QUEUE_BASE_URL: 'http://127.0.0.1:4782',
        VERCEL_SCHEDULE_BASE_URL: 'https://remote.invalid',
        VERCEL_SCHEDULE_TOKEN: 'remote-token',
        VERCEL_QUEUE_TOKEN: DEV_RESOURCE_TOKEN,
        VERCEL_REGION: 'dev1',
        RUNTIME_CACHE_ENDPOINT: 'http://127.0.0.1:4783/v1/suspense-cache/',
        RUNTIME_CACHE_HEADERS: JSON.stringify({
          authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
        }),
      }
    );

    expect(env).toMatchObject({
      VERCEL_QUEUE_BASE_URL:
        'http://localhost:3000/_svc/_queues/test-proxy-token',
      VERCEL_SCHEDULE_BASE_URL:
        'http://host.docker.internal:3000/_svc/_schedules/test-proxy-token',
      VERCEL_SCHEDULE_TOKEN: DEV_RESOURCE_TOKEN,
      VERCEL_SCHEDULE_DEV_API_VERSION: '1',
      VERCEL_QUEUE_TOKEN: DEV_RESOURCE_TOKEN,
      RUNTIME_CACHE_ENDPOINT:
        'http://localhost:3000/_svc/_cache/test-proxy-token/v1/suspense-cache/',
      RUNTIME_CACHE_HEADERS: JSON.stringify({
        authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
      }),
    });
  });
});

describe('DevServer Runtime Cache routes', () => {
  const ITEM_PATH = `${DEV_RUNTIME_CACHE_API_PREFIX}products$abc123`;

  function createServer() {
    const server = new DevServer(process.cwd(), {});
    const store = new RuntimeCacheStore();
    (server as any).runtimeCache = store;
    return { server, store };
  }

  function createRequest(
    method: string,
    urlPath: string,
    body: string = '',
    headers: Record<string, string> = {}
  ) {
    const req = Readable.from(
      body ? [Buffer.from(body)] : []
    ) as IncomingMessage;
    req.method = method;
    req.url = urlPath;
    req.headers = headers;
    return req;
  }

  function createResponse() {
    return {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
  }

  async function call(
    server: DevServer,
    method: string,
    urlPath: string,
    body?: string,
    headers?: Record<string, string>
  ) {
    const res = createResponse();
    await (server as any).handleRuntimeCacheRoute(
      createRequest(method, urlPath, body, headers),
      res,
      urlPath.split('?')[0]
    );
    return res;
  }

  it('stores a value that a later read returns unchanged', async () => {
    const { server, store } = createServer();

    const setRes = await call(server, 'POST', ITEM_PATH, '{"count":1}', {
      'x-vercel-revalidate': '60',
      'x-vercel-cache-tags': 'products,home',
      'x-vercel-cache-item-name': 'product-count',
    });
    expect(setRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });

    const getRes = await call(server, 'GET', ITEM_PATH);
    expect(getRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
      'Content-Length': 11,
      'x-vercel-cache-state': 'fresh',
      'x-vercel-cache-tags': 'products,home',
      Age: '0',
    });
    expect((getRes.end as any).mock.calls[0][0].toString()).toBe('{"count":1}');

    store.stop();
  });

  it('responds 404 for keys that were never written', async () => {
    const { server, store } = createServer();

    const res = await call(server, 'GET', ITEM_PATH);

    expect(res.writeHead).toHaveBeenCalledWith(404);
    store.stop();
  });

  it('deletes a key', async () => {
    const { server, store } = createServer();
    await call(server, 'POST', ITEM_PATH, '"value"');

    const deleteRes = await call(server, 'DELETE', ITEM_PATH);
    expect(deleteRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });

    const getRes = await call(server, 'GET', ITEM_PATH);
    expect(getRes.writeHead).toHaveBeenCalledWith(404);
    store.stop();
  });

  it('expires tags', async () => {
    const { server, store } = createServer();
    await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-cache-tags': 'products',
    });

    const revalidateRes = await call(
      server,
      'POST',
      `${DEV_RUNTIME_CACHE_API_PREFIX}revalidate?tags=products,home`
    );
    expect(revalidateRes.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });

    const getRes = await call(server, 'GET', ITEM_PATH);
    expect(getRes.writeHead).toHaveBeenCalledWith(404);
    store.stop();
  });

  it('preserves equals signs in revalidated tags', async () => {
    const { server, store } = createServer();
    await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-cache-tags': 'category=products',
    });

    await call(
      server,
      'POST',
      `${DEV_RUNTIME_CACHE_API_PREFIX}revalidate?tags=category=products`
    );

    const getRes = await call(server, 'GET', ITEM_PATH);
    expect(getRes.writeHead).toHaveBeenCalledWith(404);
    store.stop();
  });

  it('expires a single item by id', async () => {
    const { server, store } = createServer();
    await call(server, 'POST', ITEM_PATH, '"value"');

    await call(
      server,
      'POST',
      `${DEV_RUNTIME_CACHE_API_PREFIX}revalidate?itemId=products%24abc123`
    );

    const getRes = await call(server, 'GET', ITEM_PATH);
    expect(getRes.writeHead).toHaveBeenCalledWith(404);
    store.stop();
  });

  it('rejects a revalidate request without tags or an item id', async () => {
    const { server, store } = createServer();

    const res = await call(
      server,
      'POST',
      `${DEV_RUNTIME_CACHE_API_PREFIX}revalidate`
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/json',
    });
    store.stop();
  });

  it('treats an escaped key as the same entry as an unescaped one', async () => {
    const { server, store } = createServer();
    await call(server, 'POST', ITEM_PATH, '"value"');

    const res = await call(
      server,
      'GET',
      `${DEV_RUNTIME_CACHE_API_PREFIX}products%24abc123`
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    store.stop();
  });

  it('rejects a malformed key instead of throwing', async () => {
    const { server, store } = createServer();

    const res = await call(
      server,
      'GET',
      `${DEV_RUNTIME_CACHE_API_PREFIX}bad%zz`
    );

    expect(res.writeHead).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/json',
    });
    store.stop();
  });

  it.each([
    '-1',
    '1.5',
    'not-a-number',
    'true',
  ])('rejects invalid revalidate value %s', async revalidate => {
    const { server, store } = createServer();

    const res = await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-revalidate': revalidate,
    });

    expect(res.writeHead).toHaveBeenCalledWith(400, {
      'Content-Type': 'application/json',
    });
    expect(store.get('products$abc123')).toBe(null);
    store.stop();
  });

  it('does not store values with a zero revalidate value', async () => {
    const { server, store } = createServer();

    const res = await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-revalidate': '0',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    expect(store.get('products$abc123')).toBe(null);
    store.stop();
  });

  it('accepts Infinity as a one-year revalidate value', async () => {
    const { server, store } = createServer();

    const res = await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-revalidate': 'Infinity',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    expect(store.get('products$abc123')).not.toBe(null);
    store.stop();
  });

  it('treats an empty revalidate value as absent', async () => {
    const { server, store } = createServer();

    const res = await call(server, 'POST', ITEM_PATH, '"value"', {
      'x-vercel-revalidate': '',
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json',
    });
    expect(store.get('products$abc123')).not.toBe(null);
    store.stop();
  });

  it('rejects values larger than the deployed cache limit', async () => {
    const { server, store } = createServer();

    const res = await call(
      server,
      'POST',
      ITEM_PATH,
      'x'.repeat(2 * 1024 * 1024 + 1)
    );

    expect(res.writeHead).toHaveBeenCalledWith(413, {
      'Content-Type': 'application/json',
    });
    expect(store.get('products$abc123')).toBe(null);
    store.stop();
  });

  it('responds 503 before the store is created', async () => {
    const server = new DevServer(process.cwd(), {});

    const res = await call(server, 'GET', ITEM_PATH);

    expect(res.writeHead).toHaveBeenCalledWith(503);
  });
});

describe('DevServer Runtime Cache environment', () => {
  it('points Queue clients at the dedicated local listener', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any).queueOrigin = 'http://127.0.0.1:4782';

    expect((server as any).getDevQueueEnv()).toMatchObject({
      VERCEL_QUEUE_BASE_URL: 'http://127.0.0.1:4782',
      VERCEL_QUEUE_TOKEN: 'vc-dev-token',
    });
    expect(
      (server as any).getDevQueueEnv().VERCEL_HAS_WORKER_SERVICES
    ).toBeUndefined();
  });

  it('points functions at the dev server store', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).runtimeCacheOrigin = 'http://127.0.0.1:4783';

    const env = (server as any).getDevRuntimeCacheEnv({});

    expect(env).toEqual(
      getDevRuntimeCacheEnv(
        'http://127.0.0.1:4783',
        DEV_RUNTIME_CACHE_API_PREFIX
      ) as Record<string, string>
    );
  });

  it('leaves a developer-configured cache endpoint alone', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).runtimeCacheOrigin = 'http://127.0.0.1:4783';

    const env = (server as any).getDevRuntimeCacheEnv({
      RUNTIME_CACHE_ENDPOINT: 'https://cache.example.com/v1/suspense-cache/',
    });

    expect(env).toEqual({});
  });

  it('injects nothing before the dev server has an address', () => {
    const server = new DevServer(process.cwd(), {});

    expect((server as any).getDevRuntimeCacheEnv({})).toEqual({});
  });

  it('passes a cache endpoint exported in the shell to functions', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).runtimeCacheOrigin = 'http://127.0.0.1:4783';
    vi.stubEnv(
      'RUNTIME_CACHE_ENDPOINT',
      'https://cache.example.com/v1/suspense-cache/'
    );
    vi.stubEnv(
      'RUNTIME_CACHE_HEADERS',
      JSON.stringify({ authorization: 'Bearer custom-token' })
    );

    try {
      expect((server as any).getDevRuntimeCacheEnv({})).toEqual({
        RUNTIME_CACHE_ENDPOINT: 'https://cache.example.com/v1/suspense-cache/',
        RUNTIME_CACHE_HEADERS: JSON.stringify({
          authorization: 'Bearer custom-token',
        }),
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('adds the cache endpoint to the function run environment', async () => {
    const cwd = join(__dirname, '../../../fixtures/unit/commands/build/proxy');
    const server = new DevServer(cwd, {} as any);
    (server as any).sidecars = [];
    (server as any)._address = new URL('http://localhost:3000');
    (server as any).runtimeCacheOrigin = 'http://127.0.0.1:4783';
    (server as any).exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    (server as any).readJsonFile = vi.fn(async (name: string) =>
      name === 'package.json' ? null : { version: 2 }
    );

    await server._getVercelConfig();

    expect((server as any).envConfigs.runEnv).toMatchObject(
      getDevRuntimeCacheEnv(
        'http://127.0.0.1:4783',
        DEV_RUNTIME_CACHE_API_PREFIX
      )
    );
  });
});

describe('DevServer watcher ignore filtering', () => {
  const tmpDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tmpDirs.map(dir => rm(dir, { recursive: true, force: true }))
    );
  });

  // Builds the same filter `_start()` installs, so these assertions exercise
  // the real default ignore list rather than a stub.
  async function setupServer(files: Record<string, string> = {}) {
    const cwd = await mkdtemp(join(tmpdir(), 'vc-dev-watcher-'));
    tmpDirs.push(cwd);

    for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(cwd, name), contents);
    }

    const server = new DevServer(cwd, {});
    const { ig } = await getVercelIgnore(cwd);
    (server as any).filter = ig.createFilter();

    return {
      cwd,
      isIgnored: (fsPath: string): boolean =>
        (server as any).isWatcherIgnored(fsPath),
    };
  }

  it('ignores the Cargo target directory in a Rust project', async () => {
    const { cwd, isIgnored } = await setupServer({ 'Cargo.toml': '' });

    // `/target` is anchored, so it only fires once the path is relativized
    expect(isIgnored(join(cwd, 'target'))).toBe(true);
    expect(isIgnored(join(cwd, 'target', 'debug', 'my-server'))).toBe(true);
    expect(isIgnored(join(cwd, 'src', 'main.rs'))).toBe(false);
  });

  it('does not ignore nested directories named `target`', async () => {
    const { cwd, isIgnored } = await setupServer({ 'Cargo.toml': '' });

    // An unanchored `target` pattern would sweep these up as well
    expect(isIgnored(join(cwd, 'src', 'target', 'mod.rs'))).toBe(false);
    expect(isIgnored(join(cwd, 'crates', 'app', 'target'))).toBe(false);
  });

  it('does not add a target rule for projects without a Cargo.toml', async () => {
    const { cwd, isIgnored } = await setupServer();

    expect(isIgnored(join(cwd, 'target', 'debug', 'my-server'))).toBe(false);
  });

  it('honors anchored patterns from a .vercelignore', async () => {
    const { cwd, isIgnored } = await setupServer({
      '.vercelignore': '/dist\n',
    });

    expect(isIgnored(join(cwd, 'dist', 'bundle.js'))).toBe(true);
    // Anchoring is preserved: only the root-level `dist` is ignored
    expect(isIgnored(join(cwd, 'src', 'dist', 'bundle.js'))).toBe(false);
  });

  it('never ignores the watch root itself', async () => {
    const { cwd, isIgnored } = await setupServer({ 'Cargo.toml': '' });

    expect(isIgnored(cwd)).toBe(false);
  });

  it('keeps ignoring unanchored defaults at any depth', async () => {
    const { cwd, isIgnored } = await setupServer();

    expect(isIgnored(join(cwd, 'node_modules'))).toBe(true);
    expect(isIgnored(join(cwd, 'node_modules', 'foo', 'index.js'))).toBe(true);
    expect(isIgnored(join(cwd, 'packages', 'app', 'node_modules'))).toBe(true);
    expect(isIgnored(join(cwd, '.git', 'HEAD'))).toBe(true);
    expect(isIgnored(join(cwd, 'api', 'index.js'))).toBe(false);
  });
});
