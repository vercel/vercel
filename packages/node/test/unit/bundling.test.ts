import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import http from 'http';
import { join } from 'path';
import { prepareFilesystem } from './test-utils';
import { build, _resetBundlingRoutesEmitted } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';
import { createServer } from 'http';
import type { Server } from 'http';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';

describe('experimentalAllowBundling', () => {
  const originalEnv = process.env.VERCEL_API_FUNCTION_BUNDLING;

  afterEach(() => {
    _resetBundlingRoutesEmitted();
    if (originalEnv === undefined) {
      delete process.env.VERCEL_API_FUNCTION_BUNDLING;
    } else {
      process.env.VERCEL_API_FUNCTION_BUNDLING = originalEnv;
    }
  });

  it('should set experimentalAllowBundling when env var is enabled and zeroConfig is true', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect((buildResult.output as NodejsLambda).experimentalAllowBundling).toBe(
      true
    );
  });

  it('should not set experimentalAllowBundling when env var is absent', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect(
      (buildResult.output as NodejsLambda).experimentalAllowBundling
    ).toBeUndefined();
  });

  it('should not set experimentalAllowBundling when zeroConfig is false', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    expect(
      (buildResult.output as NodejsLambda).experimentalAllowBundling
    ).toBeUndefined();
  });

  it('should not set experimentalAllowBundling for edge functions', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/edge.js': `
        export const config = { runtime: 'edge' };
        export default (req) => new Response('edge');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/edge.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('EdgeFunction');
  });

  it('should not set experimentalAllowBundling for middleware', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'middleware.js': `
        export default (req) => new Response('middleware');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: { zeroConfig: true, middleware: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    // Middleware becomes an EdgeFunction, not a Lambda
    expect(buildResult.output.type).toBe('EdgeFunction');
  });

  it('should use files property (not zipBuffer) for bundling-enabled lambdas', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.files).toBeDefined();
    expect(Object.keys(lambda.files).length).toBeGreaterThan(0);
    expect((lambda as any).zipBuffer).toBeUndefined();
  });

  it('should set handler to shared bundled handler when bundling is enabled', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    // All bundleable lambdas must share the same handler so groupLambdas
    // can match their signatures and group them into a single Lambda.
    expect(lambda.handler).toBe('___vc_bundled_api_handler.js');
    expect(lambda.files['___vc_bundled_api_handler.js']).toBeDefined();
    // The original user entrypoint should still be in files
    expect(lambda.files[join('api', 'hello.js')]).toBeDefined();
  });

  it('should emit handle:hit routes with x-matched-path request header transforms when bundling is enabled', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.routes).toEqual([
      { handle: 'hit' },
      {
        src: '/index(?:/)?',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-matched-path' },
            args: '/',
          },
        ],
        continue: true,
        important: true,
      },
      {
        src: '/((?!index$).*?)(?:/)?',
        transforms: [
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'x-matched-path' },
            args: '/$1',
          },
        ],
        continue: true,
        important: true,
      },
    ]);
  });

  it('should not emit routes when bundling is disabled', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    expect(buildResult.routes).toBeUndefined();
  });

  it('should use original handler when bundling is disabled', async () => {
    delete process.env.VERCEL_API_FUNCTION_BUNDLING;

    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.handler).toBe(join('api', 'hello.js'));
  });
});

describe('bundling produces groupable lambdas', () => {
  const originalEnv = process.env.VERCEL_API_FUNCTION_BUNDLING;

  afterEach(() => {
    _resetBundlingRoutesEmitted();
    if (originalEnv === undefined) {
      delete process.env.VERCEL_API_FUNCTION_BUNDLING;
    } else {
      process.env.VERCEL_API_FUNCTION_BUNDLING = originalEnv;
    }
  });

  it('all handler shapes produce identical handler + matching config for grouping', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    // Build multiple entrypoints of different handler shapes
    const entrypoints: Record<string, string> = {
      'api/cjs.js': `module.exports = (req, res) => res.end('ok');`,
      'api/esm-default.js': `export default (req, res) => res.end('ok');`,
      'api/web.js': `
        export function GET(req) { return new Response('ok'); }
        export function POST(req) { return new Response('ok'); }
      `,
      'api/fetchhandler.js': `
        export function fetch(req) { return new Response('ok'); }
      `,
      'api/ts.ts': `
        import type { IncomingMessage, ServerResponse } from 'http';
        export default (req: IncomingMessage, res: ServerResponse) => res.end('ok');
      `,
    };

    const results: Array<{
      name: string;
      handler: string;
      experimentalAllowBundling: boolean | undefined;
      handlerFileKeys: string[];
      routes: any;
    }> = [];

    for (const [entrypoint, code] of Object.entries(entrypoints)) {
      const filesystem = await prepareFilesystem({ [entrypoint]: code });
      const buildResult = await build({
        ...filesystem,
        entrypoint,
        config: { zeroConfig: true },
        meta: { skipDownload: true },
      });

      const lambda = buildResult.output as NodejsLambda;
      results.push({
        name: entrypoint,
        handler: lambda.handler,
        experimentalAllowBundling: lambda.experimentalAllowBundling,
        handlerFileKeys: Object.keys(lambda.files || {}),
        routes: buildResult.routes,
      });
    }

    // All lambdas must have experimentalAllowBundling enabled
    for (const r of results) {
      expect(
        r.experimentalAllowBundling,
        `${r.name} should have experimentalAllowBundling`
      ).toBe(true);
    }

    // All lambdas must use the same shared handler name
    const handlers = new Set(results.map(r => r.handler));
    expect(handlers.size, 'all lambdas should share the same handler').toBe(1);
    expect(handlers.has('___vc_bundled_api_handler.js')).toBe(true);

    // All lambdas must include the shared handler file in their files
    for (const r of results) {
      expect(
        r.handlerFileKeys,
        `${r.name} should include ___vc_bundled_api_handler.js`
      ).toContain('___vc_bundled_api_handler.js');
    }

    // Only the first bundled build emits handle:hit routes; subsequent builds
    // skip them to avoid inflating the merged route table.
    expect(results[0].routes, `first build should emit routes`).toBeDefined();
    expect(results[0].routes.length).toBeGreaterThanOrEqual(2);
    expect(results[0].routes[0]).toEqual({ handle: 'hit' });
    for (const r of results.slice(1)) {
      expect(
        r.routes,
        `${r.name} should NOT emit duplicate routes`
      ).toBeUndefined();
    }

    // Verify all lambdas include the shared handler file
    // (same FileFsRef → same content → same SHA-1 digest for groupLambdas)
    for (const r of results) {
      expect(r.handlerFileKeys).toContain('___vc_bundled_api_handler.js');
    }
  });

  it('non-bundleable routes are excluded: edge function', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/edge.js': `export const config = { runtime: 'edge' }; export default (req) => new Response('ok');`,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/edge.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as any;
    expect(lambda.experimentalAllowBundling).toBeUndefined();
  });

  it('non-bundleable routes are excluded: middleware', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'middleware.js': `export default (req) => new Response('ok');`,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: { zeroConfig: true, middleware: true },
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as any;
    expect(lambda.experimentalAllowBundling).toBeUndefined();
  });

  it('non-bundleable routes are excluded: non-zeroConfig', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem = await prepareFilesystem({
      'api/hello.js': `module.exports = (req, res) => res.end('ok');`,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: {},
      meta: { skipDownload: true },
    });

    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.experimentalAllowBundling).toBeUndefined();
  });
});

describe('bundling-handler runtime', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let handler: (req: any, res: any) => Promise<void>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    fixtureDir = join(tmpdir(), `bundling-handler-test-${Date.now()}`);
    await fs.mkdir(fixtureDir, { recursive: true });
    await fs.mkdir(join(fixtureDir, 'api'), { recursive: true });

    // Function export (.js)
    await fs.writeFile(
      join(fixtureDir, 'api', 'func.js'),
      `module.exports = (req, res) => { res.end('func-ok'); };`
    );

    // Function export (.cjs)
    await fs.writeFile(
      join(fixtureDir, 'api', 'cjsfunc.cjs'),
      `module.exports = (req, res) => { res.end('cjs-ok'); };`
    );

    // ES module default export (.mjs)
    await fs.writeFile(
      join(fixtureDir, 'api', 'esmfunc.mjs'),
      `export default (req, res) => { res.end('esm-ok'); };`
    );

    // Web handler exports (GET/POST)
    await fs.writeFile(
      join(fixtureDir, 'api', 'web.js'),
      `
      module.exports.GET = (request) => new Response('get-ok');
      module.exports.POST = (request) => new Response('post-ok');
      `
    );

    // Fetch handler export
    await fs.writeFile(
      join(fixtureDir, 'api', 'fetchhandler.js'),
      `module.exports.fetch = (request) => new Response('fetch-ok: ' + request.method);`
    );

    // Server handler (http.createServer + .listen)
    await fs.writeFile(
      join(fixtureDir, 'api', 'serverhandler.js'),
      `
      const http = require('http');
      const server = http.createServer((req, res) => {
        res.end('server-ok');
      });
      server.listen();
      module.exports = server;
      `
    );

    // Index route handler
    await fs.writeFile(
      join(fixtureDir, 'index.js'),
      `module.exports = (req, res) => { res.end('index-ok'); };`
    );

    // Default-wrapped export (TS pattern)
    await fs.writeFile(
      join(fixtureDir, 'api', 'wrapped.js'),
      `module.exports = { default: { default: (req, res) => { res.end('wrapped-ok'); } } };`
    );

    // Race condition target (unused until the concurrent test fires)
    await fs.writeFile(
      join(fixtureDir, 'api', 'race.js'),
      `module.exports = (req, res) => { res.end('race-ok'); };`
    );

    originalCwd = process.cwd();
    process.chdir(fixtureDir);

    // Load the handler
    handler = require('../../src/bundling-handler.js');

    // Create a test server using the handler
    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err: any) {
        res.statusCode = 500;
        res.end(err.message);
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it('returns 500 when x-matched-path header is missing', async () => {
    const res = await fetch(baseUrl + '/api/func');
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain('Missing x-matched-path');
  });

  it('returns 404 for unknown entrypoints', async () => {
    const res = await fetch(baseUrl + '/api/nonexistent', {
      headers: { 'x-matched-path': '/api/nonexistent' },
    });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('No handler found');
  });

  it('handles function exports (.js)', async () => {
    const res = await fetch(baseUrl + '/api/func', {
      headers: { 'x-matched-path': '/api/func' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('func-ok');
  });

  it('handles function exports (.cjs extension)', async () => {
    const res = await fetch(baseUrl + '/api/cjsfunc', {
      headers: { 'x-matched-path': '/api/cjsfunc' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('cjs-ok');
  });

  it('handles ES module default exports (.mjs)', async () => {
    const res = await fetch(baseUrl + '/api/esmfunc', {
      headers: { 'x-matched-path': '/api/esmfunc' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('esm-ok');
  });

  it('handles web handler exports (GET)', async () => {
    const res = await fetch(baseUrl + '/api/web', {
      headers: { 'x-matched-path': '/api/web' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('get-ok');
  });

  it('handles web handler exports (POST)', async () => {
    const res = await fetch(baseUrl + '/api/web', {
      method: 'POST',
      headers: { 'x-matched-path': '/api/web' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('post-ok');
  });

  it('returns 405 for unsupported methods on web handlers', async () => {
    const res = await fetch(baseUrl + '/api/web', {
      method: 'DELETE',
      headers: { 'x-matched-path': '/api/web' },
    });
    expect(res.status).toBe(405);
  });

  it('handles fetch handler exports', async () => {
    const res = await fetch(baseUrl + '/api/fetchhandler', {
      headers: { 'x-matched-path': '/api/fetchhandler' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('fetch-ok: GET');
  });

  it('handles fetch handler with POST method', async () => {
    const res = await fetch(baseUrl + '/api/fetchhandler', {
      method: 'POST',
      headers: { 'x-matched-path': '/api/fetchhandler' },
      body: 'test',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('fetch-ok: POST');
  });

  it('handles server handler exports (http.createServer + .listen)', async () => {
    const res = await fetch(baseUrl + '/api/serverhandler', {
      headers: { 'x-matched-path': '/api/serverhandler' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('server-ok');
  });

  it('handles index route (x-matched-path: /)', async () => {
    const res = await fetch(baseUrl + '/', {
      headers: { 'x-matched-path': '/' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('index-ok');
  });

  it('unwraps nested default exports', async () => {
    const res = await fetch(baseUrl + '/api/wrapped', {
      headers: { 'x-matched-path': '/api/wrapped' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('wrapped-ok');
  });

  it('handles concurrent first requests to the same entrypoint without racing', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(baseUrl + '/api/race', {
          headers: { 'x-matched-path': '/api/race' },
        }).then(async r => ({ status: r.status, body: await r.text() }))
      )
    );
    for (const r of results) {
      expect(r.status).toBe(200);
      expect(r.body).toBe('race-ok');
    }
  });
});

describe('bundling-handler with "type": "module" package', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let handler: (req: any, res: any) => Promise<void>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    fixtureDir = join(tmpdir(), `bundling-type-module-test-${Date.now()}`);
    await fs.mkdir(join(fixtureDir, 'api'), { recursive: true });

    // Mark the project as ESM
    await fs.writeFile(
      join(fixtureDir, 'package.json'),
      JSON.stringify({ type: 'module' })
    );

    // .js file that is ESM due to "type": "module"
    await fs.writeFile(
      join(fixtureDir, 'api', 'esm.js'),
      `export default (req, res) => { res.end('type-module-ok'); };`
    );

    originalCwd = process.cwd();
    process.chdir(fixtureDir);

    // Clear the require cache to get a fresh handler with its own handlerCache,
    // preventing interference from the previous describe block's cached entries.
    const handlerPath = require.resolve('../../src/bundling-handler.js');
    delete require.cache[handlerPath];
    handler = require('../../src/bundling-handler.js');

    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err) {
        res.statusCode = 500;
        res.end(err.message);
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it('loads .js files as ESM when package.json has "type": "module"', async () => {
    const res = await fetch(baseUrl + '/api/esm', {
      headers: { 'x-matched-path': '/api/esm' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('type-module-ok');
  });
});

describe('resolveEntrypoint handles directories with index files', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let handler: (req: any, res: any) => Promise<void>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    fixtureDir = join(tmpdir(), `bundling-dir-resolve-test-${Date.now()}`);
    await fs.mkdir(join(fixtureDir, 'api', 'subdir'), { recursive: true });

    // Directory with index.js — x-matched-path "/api/subdir" should resolve
    // to api/subdir/index.js, not attempt to import the directory itself.
    await fs.writeFile(
      join(fixtureDir, 'api', 'subdir', 'index.js'),
      `module.exports = (req, res) => { res.end('subdir-index-ok'); };`
    );

    // Directory with index.mjs
    await fs.mkdir(join(fixtureDir, 'api', 'esmdir'), { recursive: true });
    await fs.writeFile(
      join(fixtureDir, 'api', 'esmdir', 'index.mjs'),
      `export default (req, res) => { res.end('esmdir-index-ok'); };`
    );

    // Root index.js (x-matched-path "/" maps to entrypoint "index")
    await fs.writeFile(
      join(fixtureDir, 'index.js'),
      `module.exports = (req, res) => { res.end('root-index-ok'); };`
    );

    originalCwd = process.cwd();
    process.chdir(fixtureDir);

    const handlerPath = require.resolve('../../src/bundling-handler.js');
    delete require.cache[handlerPath];
    handler = require('../../src/bundling-handler.js');

    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err: any) {
        res.statusCode = 500;
        res.end(err.message);
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it('resolves api/subdir to api/subdir/index.js instead of ERR_UNSUPPORTED_DIR_IMPORT', async () => {
    const res = await fetch(baseUrl + '/api/subdir', {
      headers: { 'x-matched-path': '/api/subdir' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('subdir-index-ok');
  });

  it('resolves directory with index.mjs', async () => {
    const res = await fetch(baseUrl + '/api/esmdir', {
      headers: { 'x-matched-path': '/api/esmdir' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('esmdir-index-ok');
  });

  it('still resolves extensionless files that are not directories', async () => {
    // "index" resolves to ./index.js (a file, not a directory)
    const res = await fetch(baseUrl + '/', {
      headers: { 'x-matched-path': '/' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('root-index-ok');
  });
});

describe('bundling routes are only emitted once across builds', () => {
  const originalEnv = process.env.VERCEL_API_FUNCTION_BUNDLING;

  afterEach(() => {
    _resetBundlingRoutesEmitted();
    if (originalEnv === undefined) {
      delete process.env.VERCEL_API_FUNCTION_BUNDLING;
    } else {
      process.env.VERCEL_API_FUNCTION_BUNDLING = originalEnv;
    }
  });

  it('first bundled build emits routes, subsequent builds do not', async () => {
    process.env.VERCEL_API_FUNCTION_BUNDLING = '1';

    const filesystem1 = await prepareFilesystem({
      'api/first.js': `export default (req, res) => res.end('first');`,
    });
    const result1 = await build({
      ...filesystem1,
      entrypoint: 'api/first.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    // First build should include the routes
    expect(result1.routes).toBeDefined();
    expect(result1.routes).toEqual(
      expect.arrayContaining([expect.objectContaining({ handle: 'hit' })])
    );

    const filesystem2 = await prepareFilesystem({
      'api/second.js': `export default (req, res) => res.end('second');`,
    });
    const result2 = await build({
      ...filesystem2,
      entrypoint: 'api/second.js',
      config: { zeroConfig: true },
      meta: { skipDownload: true },
    });

    // Second build should NOT emit routes (they were already emitted)
    expect(result2.routes).toBeUndefined();

    // Both lambdas should still have bundling enabled
    expect((result1.output as NodejsLambda).experimentalAllowBundling).toBe(
      true
    );
    expect((result2.output as NodejsLambda).experimentalAllowBundling).toBe(
      true
    );
  });
});

describe('http.Server.prototype.listen is restored after import failure', () => {
  let fixtureDir: string;
  let originalCwd: string;
  let handler: (req: any, res: any) => Promise<void>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    fixtureDir = join(tmpdir(), `bundling-listen-restore-test-${Date.now()}`);
    await fs.mkdir(join(fixtureDir, 'api'), { recursive: true });

    // A module that throws on import
    await fs.writeFile(
      join(fixtureDir, 'api', 'broken.js'),
      `throw new Error('intentional import failure');`
    );

    // A valid function handler to verify listen() still works after failure
    await fs.writeFile(
      join(fixtureDir, 'api', 'healthy.js'),
      `module.exports = (req, res) => { res.end('healthy-ok'); };`
    );

    originalCwd = process.cwd();
    process.chdir(fixtureDir);

    const handlerPath = require.resolve('../../src/bundling-handler.js');
    delete require.cache[handlerPath];
    handler = require('../../src/bundling-handler.js');

    server = createServer(async (req, res) => {
      try {
        await handler(req, res);
      } catch (err: any) {
        res.statusCode = 500;
        res.end(err.message);
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    }
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      );
    }
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it('restores listen() after a module fails to import', async () => {
    const originalListen = http.Server.prototype.listen;

    // Request the broken module — should fail but not leak the patched listen
    const res1 = await fetch(baseUrl + '/api/broken', {
      headers: { 'x-matched-path': '/api/broken' },
    });
    expect(res1.status).toBe(500);

    // listen() must be restored to the original
    expect(http.Server.prototype.listen).toBe(originalListen);
  });

  it('healthy handler still works after a broken module import', async () => {
    // First trigger the broken import
    await fetch(baseUrl + '/api/broken', {
      headers: { 'x-matched-path': '/api/broken' },
    });

    // Now a healthy handler should still work fine
    const res = await fetch(baseUrl + '/api/healthy', {
      headers: { 'x-matched-path': '/api/healthy' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('healthy-ok');
  });
});
