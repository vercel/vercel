import { mkdtemp, mkdir, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { IncomingMessage, ServerResponse, type Server } from 'http';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { createFunction } from '@vercel/fun';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileFsRef, type StartDevServerResult } from '@vercel/build-utils';
import type { ScheduleBroker } from '@vercel-internals/local-schedules';
import DevServer from '../../../../src/util/dev/server';
import { executeBuild } from '../../../../src/util/dev/builder';
import { directFetch } from '../../../../src/util/fetch';
import pkg from '../../../../src/util/pkg';
import { QueueBroker } from '../../../../src/util/dev/queue-broker';
import {
  importBuilders,
  type BuilderWithPkg,
} from '../../../../src/builders/import-builders';
import type { BuildMatch, VercelConfig } from '../../../../src/util/dev/types';
import {
  DEV_RESOURCE_TOKEN,
  listenOnDevResourcePort,
} from '../../../../src/util/dev/resource-servers';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    debug: vi.fn(),
    debugEnabled: false,
    isDebugEnabled: () => false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));
vi.mock('../../../../src/util/fetch', () => ({ directFetch: vi.fn() }));
vi.mock('@vercel/fun', () => ({ createFunction: vi.fn() }));
vi.mock('../../../../src/util/dev/fun-runtime', () => ({
  initializeFunRuntime: vi.fn(),
}));
vi.mock('../../../../src/builders/import-builders', () => ({
  importBuilders: vi.fn(),
}));
vi.mock('../../../../src/util/dev/builder', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../../../src/util/dev/builder')
  >()),
  executeBuild: vi.fn(),
}));

describe('direct development function invocation', () => {
  let cwd: string;
  let server: DevServer;
  let config: VercelConfig;
  const entrypoint = 'api/jobs.custom';
  const startDevServer = vi.fn();
  const competitor = vi.fn();
  const request = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'ce-type': 'com.vercel.queue.v2beta',
      'ce-id': 'message',
    },
    body: Buffer.from('{"job":42}'),
  };

  async function scan() {
    await server.updateBuildMatches(config);
    Object.assign(server, { functionDispatchReady: true });
  }

  beforeEach(async () => {
    vi.mocked(executeBuild).mockReset();
    vi.mocked(createFunction).mockReset();
    cwd = await mkdtemp(join(tmpdir(), 'vc-direct-function-'));
    await mkdir(join(cwd, 'api'));
    await writeFile(join(cwd, entrypoint), 'selected');
    await writeFile(join(cwd, 'catchall.custom'), 'unrelated');
    await writeFile(join(cwd, 'package.json'), '{}');
    await writeFile(
      join(cwd, 'vercel.json'),
      JSON.stringify({
        builds: [
          { src: entrypoint, use: 'unknown-v3' },
          { src: 'catchall.custom', use: 'catchall-runtime' },
        ],
        routes: [
          { src: '/api/(.*)', status: 307, headers: { Location: '/wrong' } },
          { src: '/(.*)', dest: '/catchall.custom' },
        ],
      })
    );
    startDevServer.mockReset().mockResolvedValue({
      port: 4567,
      pid: 12345,
      shutdown: vi.fn(),
      persistent: false,
    });
    competitor.mockReset().mockResolvedValue({ port: 9999, pid: 99999 });
    vi.mocked(importBuilders)
      .mockReset()
      .mockImplementation(
        async specs =>
          new Map(
            [...specs].map(use => [
              use,
              {
                builder: {
                  version: use === 'unknown-v3' ? 3 : 2,
                  build: vi.fn(),
                  shouldServe: () => true,
                  startDevServer:
                    use === 'unknown-v3' ? startDevServer : competitor,
                },
                pkg: { name: use },
              } as unknown as BuilderWithPkg,
            ])
          )
      );
    vi.mocked(directFetch)
      .mockReset()
      .mockImplementation(async () => new Response('ok'));
    server = new DevServer(cwd, {});
    Object.assign(server, {
      _address: new URL('http://localhost:3000'),
      sidecars: [],
      devProcessOrigin: 'http://localhost:4000',
      queueOrigin: 'http://localhost:4010',
      runtimeCacheOrigin: 'http://localhost:4011',
      schedulesOrigin: 'http://127.0.0.1:4012',
    });
    server.files = {
      [entrypoint]: new FileFsRef({ fsPath: join(cwd, entrypoint) }),
      'catchall.custom': new FileFsRef({
        fsPath: join(cwd, 'catchall.custom'),
      }),
    };
    vi.spyOn(server as any, 'killBuilderDevServer').mockImplementation(
      () => {}
    );
    vi.spyOn(server, 'serveProjectAsNowV2');
    config = await server.getVercelConfig();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(cwd, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('looks up exact Schedule output identities without Queue declarations or a broker, before match scanning', async () => {
    expect(server.getDevFunction(entrypoint)).toMatchObject({
      sourceFile: entrypoint,
      invocation: { type: 'entrypoint', entrypoint },
    });
    expect(server.getDevFunction('api/jobs')).toBeUndefined();
    expect(server.getDevFunction('/api/jobs.custom')).toBeUndefined();
    expect(server.resolveDevFunction(entrypoint)).toBeNull();
    expect(await server.invokeDevFunction(entrypoint, request)).toBeNull();
    await scan();
    expect(server.resolveDevFunction(entrypoint)).toBeTypeOf('function');
  });

  it.each([
    'native',
    'builder',
    'lambda',
  ])('dispatches bodyless core Schedule deliveries through the exact %s function', async mode => {
    await scan();
    const broker = (server as unknown as { scheduleBroker: ScheduleBroker })
      .scheduleBroker;
    const invoke = vi.fn().mockResolvedValue({ statusCode: 204 });
    if (mode === 'native') {
      server.getDevFunction(entrypoint)!.invocation = {
        type: 'http',
        pathname: '/internal/native-task',
      };
    } else if (mode === 'lambda') {
      startDevServer.mockResolvedValue(null);
      vi.spyOn(server, 'triggerBuild').mockImplementation(async match => {
        match.buildOutput[entrypoint] = {
          type: 'Lambda',
          fn: invoke,
        } as never;
      });
    }
    try {
      broker.reconcileStatic([
        {
          name: 'direct',
          expression: { type: 'cron', cron: '0 * * * *' },
          target: { type: 'function', function: entrypoint },
        },
      ]);
      await broker.invoke({ name: 'direct' });
      if (mode === 'lambda') {
        const payload = JSON.parse(invoke.mock.calls[0][0].body);
        expect(payload).toMatchObject({
          path: `/${entrypoint}`,
          method: 'POST',
          headers: {
            'ce-type': 'com.vercel.schedule.v1beta',
            'ce-id': expect.any(String),
            'ce-vssscheduledat': expect.any(String),
          },
        });
        expect(Buffer.from(payload.body, 'base64')).toEqual(Buffer.alloc(0));
        expect(payload.headers).not.toHaveProperty('content-type');
        expect(payload.headers).not.toHaveProperty('ce-time');
        expect(payload.headers).not.toHaveProperty('ce-vssscheduleexecutionid');
        expect(
          Number.isFinite(Date.parse(payload.headers['ce-vssscheduledat']))
        ).toBe(true);
      } else {
        expect(directFetch).toHaveBeenCalledWith(
          mode === 'native'
            ? 'http://localhost:4000/internal/native-task'
            : `http://127.0.0.1:4567/${entrypoint}`,
          expect.objectContaining({
            method: 'POST',
            body: Buffer.alloc(0),
            signal: expect.any(AbortSignal),
          })
        );
        const headers = new Headers(
          vi.mocked(directFetch).mock.calls[0][1]?.headers
        );
        expect(headers.get('ce-type')).toBe('com.vercel.schedule.v1beta');
        expect(headers.get('ce-vssschedulename')).toBe('direct');
        expect(headers.has('content-type')).toBe(false);
        expect(headers.get('ce-id')).toEqual(expect.any(String));
        expect(headers.has('ce-time')).toBe(false);
        expect(headers.has('ce-vssscheduleexecutionid')).toBe(false);
        expect(headers.get('ce-vssscheduledat')).toEqual(expect.any(String));
        expect(
          Number.isFinite(Date.parse(headers.get('ce-vssscheduledat')!))
        ).toBe(true);
      }
      if (mode !== 'native') {
        expect(startDevServer.mock.calls[0][0].meta).toMatchObject({
          env: {
            VERCEL_SCHEDULE_BASE_URL: 'http://127.0.0.1:4012',
            VERCEL_SCHEDULE_TOKEN: 'vc-dev-token',
            VERCEL_SCHEDULE_DEV_API_VERSION: '1',
          },
          devResourceEndpoints: {
            schedules: {
              direct: 'http://127.0.0.1:4012',
              proxy: expect.stringContaining('/_svc/_schedules/'),
            },
          },
        });
      }
      expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
      expect(competitor).not.toHaveBeenCalled();
    } finally {
      await broker.close();
    }
  });

  it.each([
    false,
    true,
  ])('selects startDevServer directly despite redirects, rewrites, and competing catchalls (persistent: %s)', async persistent => {
    const shutdown = vi.fn();
    startDevServer.mockResolvedValue({
      port: 4567,
      pid: 12345,
      shutdown,
      persistent,
    });
    await scan();
    server.envConfigs.runEnv.SECRET = 'effective-env';
    Object.assign(server, {
      queueOrigin: 'http://localhost:4010',
      runtimeCacheOrigin: 'http://localhost:4011',
    });
    expect(await server.invokeDevFunction(entrypoint, request)).toEqual({
      ok: true,
      status: 200,
    });
    expect(startDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint,
        workPath: cwd,
        files: server.files,
        meta: expect.objectContaining({
          isDev: true,
          requestPath: entrypoint,
          env: expect.objectContaining({ SECRET: 'effective-env' }),
        }),
      })
    );
    expect(vi.mocked(directFetch).mock.calls[0][0]).toBe(
      'http://127.0.0.1:4567/api/jobs.custom'
    );
    expect(vi.mocked(directFetch).mock.calls[0][1]).toMatchObject({
      body: request.body,
      redirect: 'manual',
    });
    const headers = new Headers(
      vi.mocked(directFetch).mock.calls[0][1]?.headers
    );
    expect(headers.get('ce-id')).toBe('message');
    expect(headers.get('x-vercel-id')).toBeTruthy();
    expect((server as any).shutdownCallbacks.get(12345)).toBe(shutdown);
    expect((server as any).killBuilderDevServer).toHaveBeenCalledTimes(
      persistent ? 0 : 1
    );
    expect(competitor).not.toHaveBeenCalled();
    expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
  });

  it.each([
    'default',
    'dotenv',
    'process',
    'cloud',
    'config',
    'build-only',
    'dotenv-over-process',
  ])('resolves NODE_ENV for dev servers and built Lambdas (%s)', async mode => {
    vi.stubEnv('VERCEL_CLI_VERSION', 'inherited-version');
    vi.stubEnv(
      'NODE_ENV',
      mode === 'process' || mode === 'dotenv-over-process'
        ? 'production'
        : undefined
    );
    Object.assign(server, {
      envValues: {
        CLOUD_ONLY: 'retained',
        VERCEL_CLI_VERSION: 'cloud-version',
        ...(mode === 'cloud' ? { NODE_ENV: 'production' } : {}),
      },
    });
    if (mode === 'dotenv' || mode === 'dotenv-over-process') {
      await writeFile(
        join(cwd, '.env'),
        `NODE_ENV=${mode === 'dotenv' ? 'production' : 'development'}\n`
      );
    } else if (mode === 'config') {
      await writeFile(
        join(cwd, 'vercel.json'),
        JSON.stringify({
          builds: config.builds,
          env: { NODE_ENV: 'production' },
        })
      );
    } else if (mode === 'build-only') {
      await writeFile(join(cwd, '.env.build'), 'NODE_ENV=production\n');
    }
    config = await server.getVercelConfig();
    await scan();
    const expected = ['default', 'build-only', 'dotenv-over-process'].includes(
      mode
    )
      ? 'development'
      : 'production';
    expect(server.envConfigs.runEnv.NODE_ENV).toBe(expected);
    expect(server.envConfigs.runEnv.VERCEL_CLI_VERSION).toBe(pkg.version);
    expect(server.envConfigs.allEnv.NODE_ENV).toBe(
      mode === 'build-only' ? 'production' : expected
    );
    if (mode === 'default') {
      expect(server.envConfigs.runEnv.CLOUD_ONLY).toBe('retained');
      expect(server.envConfigs.buildEnv.NODE_ENV).toBeUndefined();
      expect(process.env.NODE_ENV).toBeUndefined();
    }
    if (mode === 'build-only')
      expect(server.envConfigs.buildEnv.NODE_ENV).toBe('production');

    await server.invokeDevFunction(entrypoint, request);
    expect(startDevServer).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          env: expect.objectContaining({
            NODE_ENV: expected,
            VERCEL_CLI_VERSION: pkg.version,
          }),
        }),
      })
    );

    // Exercise actual Lambda creation, replacing only worker IPC and fun.
    startDevServer.mockResolvedValue(null);
    const actual = await vi.importActual<
      typeof import('../../../../src/util/dev/builder')
    >('../../../../src/util/dev/builder');
    vi.mocked(executeBuild).mockImplementation(actual.executeBuild);
    const invoke = vi.fn().mockResolvedValue({ statusCode: 204, headers: {} });
    vi.mocked(createFunction).mockResolvedValue(invoke as never);
    const worker = Object.assign(new EventEmitter(), {
      send: vi.fn(() =>
        queueMicrotask(() =>
          worker.emit('message', {
            type: 'buildResult',
            result: {
              output: {
                type: 'Lambda',
                runtime: 'nodejs22.x',
                handler: 'index.handler',
                zipBuffer: { type: 'Buffer', data: [] },
              },
              routes: [],
              watch: [entrypoint],
            },
          })
        )
      ),
    });
    const match: BuildMatch = (server as any).buildMatches.get(entrypoint);
    match.buildProcess = worker as unknown as BuildMatch['buildProcess'];
    expect(await server.invokeDevFunction(entrypoint, request)).toEqual({
      ok: true,
      status: 204,
    });
    expect(createFunction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        Environment: {
          Variables: expect.objectContaining({
            NODE_ENV: expected,
            VERCEL_CLI_VERSION: pkg.version,
          }),
        },
      })
    );
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('builds and invokes only the selected scalar Lambda when startDevServer declines', async () => {
    startDevServer.mockResolvedValue(null);
    await scan();
    const invoke = vi.fn().mockResolvedValue({ statusCode: 204, headers: {} });
    const build = vi
      .spyOn(server, 'triggerBuild')
      .mockImplementation(async match => {
        match.buildOutput[entrypoint] = { type: 'Lambda', fn: invoke } as never;
        match.buildOutput['catchall.custom'] = {
          type: 'Lambda',
          fn: competitor,
        } as never;
      });
    const scheduleRequest = {
      ...request,
      headers: { ...request.headers, 'ce-type': 'com.vercel.schedule.v1beta' },
    };
    expect(await server.invokeDevFunction(entrypoint, scheduleRequest)).toEqual(
      { ok: true, status: 204 }
    );
    expect(build).toHaveBeenCalledOnce();
    expect(build.mock.calls[0][0].entrypoint).toBe(entrypoint);
    expect(build.mock.calls[0][1]).toBeNull();
    const payload = JSON.parse(invoke.mock.calls[0][0].body);
    expect(payload).toMatchObject({
      method: 'POST',
      path: '/api/jobs.custom',
      encoding: 'base64',
      body: request.body.toString('base64'),
      headers: scheduleRequest.headers,
    });
    expect(payload.headers['x-vercel-id']).toBeTruthy();
    await server.invokeDevFunction(entrypoint, request);
    expect(build).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(competitor).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
    expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
  });

  it('keeps deployment output, source, and scalar artifact identity distinct', async () => {
    const zeroConfig = { zeroConfig: true };
    // Use an explicit host snapshot to exercise the zero-config scalar mapping
    // with an arbitrary extension that the public API extension detector lacks.
    const fn = server.getDevFunction(entrypoint)!;
    Object.assign(fn.scope.build, { config: zeroConfig });
    Object.assign(fn, { outputPath: 'api/jobs' });
    (server as any).functionRegistry.functions = new Map([['api/jobs', fn]]);
    config.builds![0].config = zeroConfig;
    await scan();
    startDevServer.mockResolvedValue(null);
    const invoke = vi.fn().mockResolvedValue({ statusCode: 200 });
    vi.spyOn(server, 'triggerBuild').mockImplementation(async match => {
      match.buildOutput[entrypoint] = { type: 'Lambda', fn: invoke } as never;
    });
    expect(await server.invokeDevFunction('api/jobs', request)).toEqual({
      ok: true,
      status: 200,
    });
    expect(startDevServer.mock.calls[0][0]).toMatchObject({
      entrypoint,
      meta: { requestPath: 'api/jobs' },
    });
    expect(JSON.parse(invoke.mock.calls[0][0].body).path).toBe('/api/jobs');
  });

  it.each([
    { version: 2, wrapped: false, missing: false },
    { version: 3, wrapped: false, missing: false },
    { version: 2, wrapped: true, missing: false },
    { version: 3, wrapped: true, missing: false },
    { version: 2, wrapped: false, missing: true },
  ])('uses the effective VX result identity: %j', async ({
    version,
    wrapped,
    missing,
  }) => {
    await scan();
    startDevServer.mockResolvedValue(null);
    const fn = server.getDevFunction(entrypoint)!;
    const outputPath = 'tasks/jobs';
    Object.assign(fn, { outputPath });
    (server as any).functionRegistry.functions = new Map([[outputPath, fn]]);
    const match: BuildMatch = (server as any).buildMatches.get(entrypoint);
    match.builderWithPkg.builder.version = -1;
    const actual = await vi.importActual<
      typeof import('../../../../src/util/dev/builder')
    >('../../../../src/util/dev/builder');
    vi.mocked(executeBuild).mockImplementation(actual.executeBuild);
    const invoke = vi.fn().mockResolvedValue({ statusCode: 204, headers: {} });
    vi.mocked(createFunction).mockImplementation(
      async options =>
        (options.Handler === 'selected' ? invoke : competitor) as never
    );
    const lambda = {
      type: 'Lambda',
      runtime: 'nodejs22.x',
      handler: 'selected',
      zipBuffer: { type: 'Buffer', data: [] },
    };
    const result = {
      output:
        version === 3
          ? lambda
          : {
              ...(!missing ? { [outputPath]: lambda } : {}),
              [entrypoint]: { ...lambda, handler: 'competitor' },
            },
      routes: [],
      watch: [entrypoint],
    };
    const worker = Object.assign(new EventEmitter(), {
      send: vi.fn(() =>
        queueMicrotask(() =>
          worker.emit('message', {
            type: 'buildResult',
            result: wrapped ? { resultVersion: version, result } : result,
          })
        )
      ),
    });
    match.buildProcess = worker as unknown as BuildMatch['buildProcess'];
    const expected = { ok: !missing, status: missing ? 404 : 204 };
    expect(await server.invokeDevFunction(outputPath, request)).toEqual(
      expected
    );
    expect(match.buildResultVersion).toBe(version);
    if (!missing) {
      expect(JSON.parse(invoke.mock.calls[0][0].body).path).toBe(
        `/${outputPath}`
      );
      expect(await server.invokeDevFunction(outputPath, request)).toEqual(
        expected
      );
      expect(worker.send).toHaveBeenCalledOnce();
    } else {
      expect(invoke).not.toHaveBeenCalled();
    }
    expect(competitor).not.toHaveBeenCalled();
  });

  it('defers pending Queue deliveries until watcher reconciliation invalidates stale output', async () => {
    vi.useFakeTimers();
    const broker = new QueueBroker([], () => null);
    Object.assign(server, { queueBroker: broker });
    let release!: () => void;
    try {
      const authored = JSON.parse(
        await readFile(join(cwd, 'vercel.json'), 'utf8')
      );
      authored.builds[0].config = {
        functions: {
          [entrypoint]: {
            experimentalTriggers: [
              { type: 'queue/v2beta', consumer: 'worker', topic: 'jobs' },
            ],
          },
        },
      };
      await writeFile(join(cwd, 'vercel.json'), JSON.stringify(authored));
      config = await server.getVercelConfig();
      await scan();
      startDevServer.mockResolvedValue(null);
      const invocations = [
        vi.fn().mockResolvedValue({ statusCode: 201 }),
        vi.fn().mockResolvedValue({ statusCode: 202 }),
      ];
      vi.mocked(executeBuild).mockImplementation(
        async (_config, _server, _files, match, requestPath) => {
          const source = await readFile(join(cwd, entrypoint), 'utf8');
          const output = {
            [entrypoint]: {
              type: 'Lambda',
              fn: invocations[source === 'updated' ? 1 : 0],
            },
          } as unknown as BuildMatch['buildOutput'];
          match.buildResults.set(requestPath, {
            output,
            routes: [],
            watch: [entrypoint],
          });
          Object.assign(match.buildOutput, output);
        }
      );
      await server.invokeDevFunction(entrypoint, request);
      invocations[0].mockClear();
      Object.assign(server, { functionDispatchReady: false });
      broker.enqueue('jobs', request.body, 'application/json');
      // Make the retained message visible when registry publication activates it.
      vi.setSystemTime(Date.now() + 1000);
      const reconcile = server.updateBuildMatches.bind(server);
      const update = vi
        .spyOn(server, 'updateBuildMatches')
        .mockImplementationOnce(async next => {
          await new Promise<void>(resolve => {
            release = resolve;
          });
          await reconcile(next);
        });
      await writeFile(join(cwd, entrypoint), 'updated');
      Object.assign(server, { functionDispatchReady: true });
      const reload = server.handleFilesystemEvents([
        { type: 'change', path: join(cwd, entrypoint) },
      ]);
      await vi.waitFor(() => expect(update).toHaveBeenCalledOnce());
      expect(server.resolveDevFunction(entrypoint)).toBeNull();
      expect(await server.invokeDevFunction(entrypoint, request)).toBeNull();
      await vi.advanceTimersByTimeAsync(1000);
      expect(invocations[0]).not.toHaveBeenCalled();
      release();
      await reload;
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() => expect(invocations[1]).toHaveBeenCalledOnce());
      expect(invocations[0]).not.toHaveBeenCalled();
      const payload = JSON.parse(invocations[1].mock.calls[0][0].body);
      expect(payload.headers['ce-vqsdeliverycount']).toBe('1');
    } finally {
      release?.();
      broker.stop();
    }
  });

  it.each([
    'discovery',
    'matches',
  ])('restores entrypoint readiness after rejected %s reconciliation', async phase => {
    await scan();
    const original = server.getDevFunction(entrypoint);
    const method =
      phase === 'discovery' ? 'getVercelConfig' : 'updateBuildMatches';
    vi.spyOn(server, method).mockImplementationOnce(async () => {
      expect(server.resolveDevFunction(entrypoint)).toBeNull();
      throw new Error('Rejected reload');
    });
    await expect(
      server.handleFilesystemEvents([
        { type: 'change', path: join(cwd, entrypoint) },
      ])
    ).rejects.toThrow('Rejected reload');
    expect(server.getDevFunction(entrypoint)).toEqual(original);
    expect(await server.invokeDevFunction(entrypoint, request)).toEqual({
      ok: true,
      status: 200,
    });
  });

  it('keeps entrypoint dispatch gated until every overlapping watcher pass finishes', async () => {
    await scan();
    const releases: (() => void)[] = [];
    vi.spyOn(server, 'getVercelConfig').mockResolvedValue(config);
    vi.spyOn(server, 'updateBuildMatches').mockImplementation(
      () => new Promise<void>(resolve => releases.push(resolve))
    );
    const first = server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, entrypoint) },
    ]);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    const second = server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, entrypoint) },
    ]);
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases[0]();
    await first;
    expect(server.resolveDevFunction(entrypoint)).toBeNull();
    releases[1]();
    await second;
    expect(server.resolveDevFunction(entrypoint)).toBeTypeOf('function');
  });

  it('rebuilds direct Lambdas after source edits even when shouldServe rejects the output path', async () => {
    startDevServer.mockResolvedValue(null);
    await scan();
    let finishRebuild!: () => void;
    const rebuilding = new Promise<void>(resolve => {
      finishRebuild = resolve;
    });
    const invocations = [
      vi.fn().mockResolvedValue({ statusCode: 201, headers: {} }),
      vi.fn().mockResolvedValue({ statusCode: 202, headers: {} }),
    ];
    const build = vi
      .mocked(executeBuild)
      .mockImplementation(
        async (_config, _server, _files, match, requestPath) => {
          const source = await readFile(join(cwd, entrypoint), 'utf8');
          const updated = source === 'updated';
          if (updated) await rebuilding;
          const output = {
            [entrypoint]: {
              type: 'Lambda',
              fn: invocations[updated ? 1 : 0],
            },
          } as unknown as BuildMatch['buildOutput'];
          match.buildResults.set(requestPath, {
            output,
            routes: [],
            watch: [entrypoint],
          });
          Object.assign(match.buildOutput, output);
        }
      );
    const match: BuildMatch = (server as any).buildMatches.get(entrypoint);
    const shouldServe = vi
      .spyOn(match.builderWithPkg.builder, 'shouldServe')
      .mockResolvedValue(false);
    const triggerBuild = vi.spyOn(server, 'triggerBuild');

    expect(await server.invokeDevFunction(entrypoint, request)).toEqual({
      ok: true,
      status: 201,
    });
    await writeFile(join(cwd, entrypoint), 'updated');
    await server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, entrypoint) },
    ]);
    expect(build).toHaveBeenCalledTimes(2);
    expect(match.buildOutput[entrypoint]).toBeUndefined();

    const pending = server.invokeDevFunction(entrypoint, request);
    await vi.waitFor(() => expect(triggerBuild).toHaveBeenCalledTimes(3));
    // The invocation joins the watcher's unconditional rebuild, rather than
    // creating a second build or serving the old Lambda.
    expect(build).toHaveBeenCalledTimes(2);
    expect(
      triggerBuild.mock.calls.map(([, requestPath]) => requestPath)
    ).toEqual([null, null, null]);
    finishRebuild();
    expect(await pending).toEqual({ ok: true, status: 202 });
    expect(invocations[0]).toHaveBeenCalledOnce();
    expect(invocations[1]).toHaveBeenCalledOnce();
    expect(shouldServe).not.toHaveBeenCalled();
    expect(competitor).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
    expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
  });

  it.each([
    'before public build',
    'after public build',
    'during public rebuild',
  ])('joins a public-first watch rebuild after registration %s', async registration => {
    startDevServer.mockResolvedValue(null);
    await scan();
    // Control discovery timing without changing the builder or its input.
    vi.spyOn(server, 'getVercelConfig').mockResolvedValue(config);
    const functions = (server as any).functionRegistry.functions;
    const fn = server.getDevFunction(entrypoint)!;
    if (registration !== 'before public build') functions.delete(entrypoint);
    const match: BuildMatch = (server as any).buildMatches.get(entrypoint);
    const shouldServe = vi.spyOn(match.builderWithPkg.builder, 'shouldServe');
    const calls: string[] = [];
    let finishRebuild!: () => void;
    const rebuilding = new Promise<void>(resolve => {
      finishRebuild = resolve;
    });
    const build = vi
      .mocked(executeBuild)
      .mockImplementation(
        async (_config, _server, _files, match, requestPath) => {
          const source = await readFile(join(cwd, entrypoint), 'utf8');
          if (source === 'updated') await rebuilding;
          const output = {
            [entrypoint]: {
              type: 'Lambda',
              fn: vi.fn(async ({ body }: { body: string }) => {
                const payload = JSON.parse(body);
                calls.push(
                  `${source}:${Buffer.from(payload.body, 'base64').toString()}`
                );
                return {
                  statusCode: source === 'updated' ? 202 : 201,
                  headers: { 'content-type': 'text/plain' },
                  body: source,
                };
              }),
            },
          } as unknown as BuildMatch['buildOutput'];
          match.buildResults.set(requestPath, {
            output,
            routes: [],
            watch: [entrypoint],
          });
          Object.assign(match.buildOutput, output);
        }
      );
    const triggerBuild = vi.spyOn(server, 'triggerBuild');
    async function publicRequest() {
      const req = new IncomingMessage(new Socket());
      req.method = 'POST';
      req.url = '/public-jobs';
      req.headers = { host: 'localhost:3000', ...request.headers };
      req.push(request.body);
      req.push(null);
      const res = new ServerResponse(req);
      const end = vi.spyOn(res, 'end');
      await server.serveProjectAsNowV2(req, res, 'public-id', {
        ...config,
        routes: [
          {
            src: '/public-jobs',
            dest: `/${entrypoint}`,
            headers: { 'x-public-route': 'preserved' },
          },
        ],
      });
      expect(res.getHeader('x-public-route')).toBe('preserved');
      return { status: res.statusCode, body: end.mock.calls[0]?.[0] };
    }

    expect(await publicRequest()).toEqual({ status: 201, body: 'selected' });
    expect(build).toHaveBeenCalledOnce();
    // Canonical caching must not change the request path passed to the builder.
    expect(build.mock.calls[0][4]).toBe(entrypoint);
    expect([...match.buildResults.keys()]).toEqual([
      registration === 'before public build' ? null : entrypoint,
    ]);
    if (registration === 'after public build') {
      functions.set(entrypoint, fn);
      shouldServe.mockResolvedValue(false);
    }
    shouldServe.mockClear();
    await writeFile(join(cwd, entrypoint), 'updated');
    await server.handleFilesystemEvents([
      { type: 'change', path: join(cwd, entrypoint) },
    ]);
    expect(build).toHaveBeenCalledTimes(2);
    expect(match.buildOutput[entrypoint]).toBeUndefined();
    expect(build.mock.calls[1][4]).toBe(
      registration === 'during public rebuild' ? entrypoint : null
    );
    if (registration === 'during public rebuild') {
      expect(shouldServe).toHaveBeenCalled();
      functions.set(entrypoint, fn);
    } else {
      expect(shouldServe).not.toHaveBeenCalled();
    }

    const pending = server.invokeDevFunction(entrypoint, request);
    await vi.waitFor(() => expect(triggerBuild).toHaveBeenCalledTimes(3));
    expect(build).toHaveBeenCalledTimes(2);
    expect([...(server as any).inProgressBuilds.get(match).keys()]).toEqual([
      null,
    ]);
    expect(calls).toEqual(['selected:{"job":42}']);
    finishRebuild();
    expect(await pending).toEqual({ ok: true, status: 202 });
    expect(calls).toEqual(['selected:{"job":42}', 'updated:{"job":42}']);
    expect([...match.buildResults.keys()]).toEqual([null]);
    expect((server as any).inProgressBuilds.size).toBe(0);
    // Only the explicit public request passed through public routing.
    expect(server.serveProjectAsNowV2).toHaveBeenCalledOnce();
    shouldServe.mockResolvedValue(true);
    expect(await publicRequest()).toEqual({ status: 202, body: 'updated' });
    expect(build).toHaveBeenCalledTimes(2);
    expect(directFetch).not.toHaveBeenCalled();
    expect(competitor).not.toHaveBeenCalled();
  });

  it('keeps path-specific build slots for builders without a registered entrypoint function', async () => {
    await scan();
    const match: BuildMatch = (server as any).buildMatches.get(
      'catchall.custom'
    );
    vi.mocked(executeBuild).mockImplementation(
      async (_config, _server, _files, match, requestPath) => {
        match.buildResults.set(requestPath, {
          output: {},
          routes: [],
          watch: [],
        });
      }
    );
    await server.triggerBuild(match, 'first', null, config);
    await server.triggerBuild(match, 'second', null, config);
    expect([...match.buildResults.keys()]).toEqual(['first', 'second']);
    expect(vi.mocked(executeBuild).mock.calls.map(call => call[4])).toEqual([
      'first',
      'second',
    ]);
    expect((server as any).inProgressBuilds.size).toBe(0);
  });

  it('never falls back to the framework server or another asset when the selected output is missing', async () => {
    startDevServer.mockResolvedValue(null);
    await scan();
    vi.spyOn(server, 'triggerBuild').mockImplementation(async match => {
      match.buildOutput['catchall.custom'] = {
        type: 'Lambda',
        fn: competitor,
      } as never;
    });
    expect(await server.invokeDevFunction(entrypoint, request)).toEqual({
      ok: false,
      status: 404,
    });
    expect(await server.invokeDevFunction('missing', request)).toBeNull();
    (server as any).buildMatches.clear();
    expect(server.resolveDevFunction(entrypoint)).toBeNull();
    expect(await server.invokeDevFunction(entrypoint, request)).toBeNull();
    expect(directFetch).not.toHaveBeenCalled();
    expect(competitor).not.toHaveBeenCalled();
    expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
  });

  it.each([
    'remove',
    'generation',
    'replace match',
  ])('does not deliver after %s during runtime startup and cleans up orphaned processes', async change => {
    await scan();
    let finish!: (result: StartDevServerResult) => void;
    startDevServer.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = server.invokeDevFunction(entrypoint, request);
    if (change === 'remove') (server as any).functionRegistry.functions.clear();
    else if (change === 'generation') (server as any).configGeneration++;
    else (server as any).buildMatches = new Map();
    finish({ port: 4567, pid: 12345, persistent: true });
    expect(await pending).toBeNull();
    expect((server as any).killBuilderDevServer).toHaveBeenCalledTimes(
      change === 'generation' ? 0 : 1
    );
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('does not invoke a stale Lambda after removal during a build', async () => {
    startDevServer.mockResolvedValue(null);
    await scan();
    const invoke = vi.fn();
    vi.spyOn(server, 'triggerBuild').mockImplementation(
      async (match: BuildMatch) => {
        match.buildOutput[entrypoint] = { type: 'Lambda', fn: invoke } as never;
        (server as any).functionRegistry.functions.clear();
      }
    );
    expect(await server.invokeDevFunction(entrypoint, request)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
  });

  it.each([
    'request',
    'startup',
  ] as const)('releases a pending Schedules HTTP invocation when stopped during function %s', async phase => {
    await scan();
    vi.mocked(server.killBuilderDevServer).mockRestore();
    const kill = vi.spyOn(server, 'killBuilderDevServer');
    const invoke = vi.spyOn(server, 'invokeDevFunction');
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const host = server as unknown as {
      scheduleBroker: ScheduleBroker;
      schedulesServer: Server;
      schedulesOrigin: string;
      shutdownCallbacks: Map<number, unknown>;
    };
    host.schedulesOrigin = (
      await listenOnDevResourcePort(host.schedulesServer, {
        name: 'Vercel Schedules',
        flag: '--schedules-port',
        defaultPort: 4784,
        port: 0,
      })
    ).origin;
    host.scheduleBroker.reconcileStatic([
      {
        name: 'pending',
        expression: { type: 'cron', cron: '0 * * * *' },
        target: { type: 'function', function: entrypoint },
      },
    ]);
    let entered!: () => void;
    const ready = new Promise<void>(resolve => {
      entered = resolve;
    });
    let finishStartup: ((result: StartDevServerResult) => void) | undefined;
    const runtime = { port: 4567, pid: 12345, shutdown, persistent: true };
    if (phase === 'startup') {
      startDevServer.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishStartup = resolve;
            entered();
          })
      );
    } else {
      startDevServer.mockResolvedValueOnce(runtime);
      vi.mocked(directFetch).mockImplementationOnce(
        (_url, options) =>
          new Promise((_, reject) => {
            const signal = options!.signal!;
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
            entered();
          })
      );
    }
    try {
      const response = fetch(
        `${host.schedulesOrigin}/v1/schedules/pending/invoke`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${DEV_RESOURCE_TOKEN}`,
            connection: 'close',
          },
        }
      );
      await ready;
      expect(invoke).toHaveBeenCalledOnce();
      const signal = invoke.mock.calls[0][1].signal!;
      expect(signal.aborted).toBe(false);
      const invocation = invoke.mock.results[0].value as ReturnType<
        DevServer['invokeDevFunction']
      >;
      const completed =
        phase === 'startup'
          ? expect(invocation).resolves.toBeNull()
          : expect(invocation).rejects.toMatchObject({ name: 'AbortError' });

      await server.stop();
      expect(signal.aborted).toBe(true);
      const result = await response;
      expect(result.status).toBe(204);
      expect(await result.text()).toBe('');
      expect(host.schedulesServer.listening).toBe(false);
      if (phase === 'startup') {
        expect(kill).not.toHaveBeenCalled();
        expect(shutdown).not.toHaveBeenCalled();
        finishStartup!(runtime);
      }
      await completed;
      expect(kill).toHaveBeenCalledExactlyOnceWith(runtime.pid);
      expect(shutdown).toHaveBeenCalledOnce();
      expect(host.shutdownCallbacks.size).toBe(0);
      expect(directFetch).toHaveBeenCalledTimes(phase === 'startup' ? 0 : 1);
      expect(competitor).not.toHaveBeenCalled();
      expect(server.serveProjectAsNowV2).not.toHaveBeenCalled();
    } finally {
      finishStartup?.(runtime);
      await server.stop();
    }
  });

  it('shuts down a persistent runtime once when startup completes after stop', async () => {
    await scan();
    vi.mocked(server.killBuilderDevServer).mockRestore();
    const kill = vi.spyOn(server, 'killBuilderDevServer');
    const shutdown = vi.fn().mockResolvedValue(undefined);
    let finish!: (result: StartDevServerResult) => void;
    startDevServer.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = server.invokeDevFunction(entrypoint, request);
    expect(startDevServer).toHaveBeenCalledOnce();
    await server.stop();
    expect(kill).not.toHaveBeenCalled();
    expect((server as any).shutdownCallbacks.size).toBe(0);
    expect(server.getDevFunction(entrypoint)).toBeDefined();
    expect((server as any).buildMatches.has(entrypoint)).toBe(true);

    finish({ port: 4567, pid: 12345, shutdown, persistent: true });
    expect(await pending).toBeNull();
    await server.stop();
    expect(kill).toHaveBeenCalledExactlyOnceWith(12345);
    expect(shutdown).toHaveBeenCalledOnce();
    expect((server as any).shutdownCallbacks.size).toBe(0);
    expect(directFetch).not.toHaveBeenCalled();
    expect(competitor).not.toHaveBeenCalled();
  });
});
