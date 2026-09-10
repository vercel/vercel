import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { join } from 'path';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { frameworkList } from '@vercel/frameworks';
import { getVercelIgnore } from '@vercel/client';
import DevServer from '../../../../src/util/dev/server';
import {
  DEV_RUNTIME_CACHE_ITEM_PREFIX,
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

    await (server as any).handleQueuesRoute(
      req,
      res,
      '/_svc/_queues/api/v3/topic/orders'
    );

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
      '/_svc/_queues/api/v3/topic/orders/consumer/worker/id/duplicate-message-id'
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

describe('DevServer Runtime Cache routes', () => {
  const ITEM_PATH = `${DEV_RUNTIME_CACHE_ITEM_PREFIX}products$abc123`;

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
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}revalidate?tags=products,home`
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
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}revalidate?tags=category=products`
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
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}revalidate?itemId=products%24abc123`
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
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}revalidate`
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
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}products%24abc123`
    );

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    store.stop();
  });

  it('rejects a malformed key instead of throwing', async () => {
    const { server, store } = createServer();

    const res = await call(
      server,
      'GET',
      `${DEV_RUNTIME_CACHE_ITEM_PREFIX}bad%zz`
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
  it('points functions at the dev server store', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');

    const env = (server as any).getDevRuntimeCacheEnv({});

    expect(env).toEqual(
      getDevRuntimeCacheEnv('http://localhost:3000') as Record<string, string>
    );
  });

  it('leaves a developer-configured cache endpoint alone', () => {
    const server = new DevServer(process.cwd(), {});
    (server as any)._address = new URL('http://localhost:3000');

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
    (server as any).exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    (server as any).readJsonFile = vi.fn(async (name: string) =>
      name === 'package.json' ? null : { version: 2 }
    );

    await server._getVercelConfig();

    expect((server as any).envConfigs.runEnv).toMatchObject(
      getDevRuntimeCacheEnv('http://localhost:3000')
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
