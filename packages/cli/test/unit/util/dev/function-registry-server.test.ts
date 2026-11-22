import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import minimatch from 'minimatch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sanitizeConsumerName,
  type GetDevManifest,
  type DevManifest,
} from '@vercel/build-utils';
import DevServer from '../../../../src/util/dev/server';
import { QueueBroker } from '../../../../src/util/dev/queue-broker';
import { directFetch } from '../../../../src/util/fetch';
import type { VercelConfig } from '../../../../src/util/dev/types';
import {
  importBuilders,
  type BuilderWithPkg,
} from '../../../../src/builders/import-builders';
import output from '../../../../src/output-manager';

vi.mock('../../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    debug: vi.fn(),
    debugEnabled: false,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    prettyError: vi.fn(),
    time: vi.fn((_label: string, promise: Promise<unknown>) => promise),
  },
}));
vi.mock('../../../../src/util/fetch', () => ({
  directFetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(0),
  }),
}));
vi.mock('../../../../src/builders/import-builders', () => ({
  importBuilders: vi.fn(),
}));

const mockFetch = vi.mocked(directFetch);
const source = 'app/api/jobs/route.ts';
const trigger = { type: 'queue/v2beta' as const, topic: 'orders' };
const nativeCallback = {
  outputPath: 'native-task',
  invocation: { type: 'http' as const, pathname: '/arbitrary/native-callback' },
  experimentalTriggers: [
    {
      type: 'queue/v2beta' as const,
      consumer: 'native',
      topic: 'native-topic',
    },
  ],
};
const nativeSnapshot = {
  functions: [nativeCallback],
  matchedFunctionPatterns: [],
};

describe('DevServer function registry lifecycle', () => {
  let cwd: string;
  let server: DevServer;
  let broker: QueueBroker;
  const hook = vi.fn<GetDevManifest>();
  const nativeHook = vi.fn<GetDevManifest>();

  async function write(name: string, content: string) {
    const file = join(cwd, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  async function configure(config: VercelConfig) {
    await write('vercel.json', JSON.stringify(config));
  }
  async function changed(name: string, type = 'change') {
    await server.handleFilesystemEvents([{ type, path: join(cwd, name) }]);
  }
  function enqueue(topic = 'orders') {
    return broker.enqueue(topic, Buffer.from('{}'), 'application/json');
  }
  function acknowledge(
    messageId: string,
    consumer = sanitizeConsumerName(source)
  ) {
    const headers = mockFetch.mock.calls.at(-1)![1]?.headers as Record<
      string,
      string
    >;
    broker.acknowledge(messageId, consumer, headers['ce-vqsreceipthandle']);
  }

  beforeEach(async () => {
    hook.mockReset().mockImplementation(async ({ config, files, env }) => {
      const functions = [];
      const matchedFunctionPatterns = [];
      for (const [pattern, fn] of Object.entries(config.functions ?? {})) {
        const queue = fn.experimentalTriggers?.find(
          t => t.type === 'queue/v2beta'
        );
        if (!queue || !files.some(file => minimatch(file, pattern))) continue;
        matchedFunctionPatterns.push(pattern);
        functions.push({
          outputPath: 'api/jobs',
          invocation: {
            type: 'http' as const,
            pathname: `${env.BASE_PATH ?? ''}/provider/callback`,
          },
          experimentalTriggers: [
            { ...queue, consumer: sanitizeConsumerName(pattern) },
          ],
        });
      }
      return { functions, matchedFunctionPatterns };
    });
    nativeHook.mockReset().mockResolvedValue(nativeSnapshot);
    vi.mocked(importBuilders)
      .mockReset()
      .mockImplementation(
        async specs =>
          new Map(
            [...specs].map(use => [
              use,
              {
                builder: {
                  version: 3,
                  build: vi.fn(),
                  getDevManifest:
                    use === 'unknown-runtime'
                      ? nativeHook
                      : /^@vercel\/next(@|$)/.test(use)
                        ? hook
                        : undefined,
                },
              } as unknown as BuilderWithPkg,
            ])
          )
      );
    cwd = await mkdtemp(join(tmpdir(), 'vc-function-queues-'));
    await write(
      'package.json',
      JSON.stringify({ dependencies: { next: '15.3.0' } })
    );
    await write(source, 'export function POST() {}');
    await configure({
      framework: 'nextjs',
      functions: { [source]: { experimentalTriggers: [trigger] } },
    });
    server = new DevServer(cwd, {});
    broker = new QueueBroker([], () => null);
    Object.assign(server, {
      _address: new URL('http://localhost:3000'),
      sidecars: [],
      queueBroker: broker,
      devProcessOrigin: 'http://localhost:4000',
      exit: vi.fn(() => {
        throw new Error('Unexpected dev exit');
      }),
    });
    vi.spyOn(server, 'updateBuildMatches').mockResolvedValue(undefined);
    mockFetch.mockClear();
    vi.mocked(output.warn).mockClear();
  });

  afterEach(async () => {
    broker.stop();
    await (server as any).scheduleBroker.close();
    await rm(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('calls the original Next builder after filtering, with authored config and real sources', async () => {
    const { messageId } = enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
    const config = await server.getVercelConfig();
    expect(config.functions).toBeUndefined();
    expect(config.builds).toEqual([]);
    expect(server.files).toEqual({});
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0][0]).toMatchObject({
      workPath: cwd,
      build: { use: '@vercel/next@latest', src: 'package.json' },
      files: expect.arrayContaining([source, 'package.json']),
      config: { functions: { [source]: { experimentalTriggers: [trigger] } } },
      env: { VERCEL_ENV: 'development' },
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/provider/callback'
    );
    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      'ce-vqsconsumergroup': sanitizeConsumerName(source),
      'ce-vqsmessageid': messageId,
    });
  });

  it('caches complete discovery across repeated reads and preserves ACKs across config changes', async () => {
    await server.getVercelConfig();
    const { messageId } = enqueue();
    acknowledge(messageId);
    await server.getVercelConfig();
    await server.getVercelConfig();
    expect(hook).toHaveBeenCalledOnce();
    expect(importBuilders).toHaveBeenCalledOnce();
    await configure({
      framework: 'nextjs',
      functions: {
        [source]: {
          experimentalTriggers: [{ ...trigger, retryAfterSeconds: 2 }],
        },
      },
    });
    await server.getVercelConfig();
    expect(hook).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(
      broker.receiveById('orders', messageId, sanitizeConsumerName(source))
    ).toBeNull();
  });

  it('replaces topic configuration and removes callbacks when authored functions are deleted', async () => {
    await server.getVercelConfig();
    await configure({
      framework: 'nextjs',
      functions: {
        [source]: { experimentalTriggers: [{ ...trigger, topic: 'other' }] },
      },
    });
    await changed('vercel.json');
    enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
    const { messageId } = enqueue('other');
    acknowledge(messageId);
    await configure({ framework: 'nextjs' });
    await server.getVercelConfig();
    enqueue('other');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(hook).toHaveBeenCalledTimes(3);
  });

  it('reconciles source removal and addition without using synthetic aliases', async () => {
    const pattern = 'app/api/jobs/route.{js,ts}';
    await configure({
      framework: 'nextjs',
      functions: { [pattern]: { experimentalTriggers: [trigger] } },
    });
    server.files['synthetic-alias.ts'] = {} as never;
    await server.getVercelConfig();
    expect(hook.mock.calls[0][0].files).not.toContain('synthetic-alias.ts');
    await rm(join(cwd, source));
    await changed(source, 'unlink');
    enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
    await write('app/api/jobs/route.js', 'export function POST() {}');
    await changed('app/api/jobs/route.js', 'add');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      'ce-vqsconsumergroup': sanitizeConsumerName(pattern),
    });
  });

  it('reconciles a removed standalone queue function while retaining the real detector build plan', async () => {
    await write('package.json', '{}');
    await write('api/jobs.ts', 'export default function handler() {}');
    await write('api/status.ts', 'export default function handler() {}');
    await configure({
      functions: { 'api/jobs.ts': { experimentalTriggers: [trigger] } },
    });
    // Runtime dispatch is exercised separately; this test covers detector and
    // registry removal while preserving broker delivery state.
    vi.spyOn(server, 'resolveDevFunction').mockImplementation(outputPath =>
      server.getDevFunction(outputPath)
        ? request => directFetch(`http://localhost:4000/${outputPath}`, request)
        : null
    );
    const initial = await server.getVercelConfig();
    expect(initial.builds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'api/jobs.ts',
          use: '@vercel/node@latest',
        }),
        expect.objectContaining({
          src: 'api/status.ts',
          use: '@vercel/node@latest',
        }),
      ])
    );
    const { messageId } = enqueue();
    acknowledge(messageId, sanitizeConsumerName('api/jobs.ts'));

    await rm(join(cwd, 'api/jobs.ts'));
    await changed('api/jobs.ts', 'unlink');
    const config = await server.getVercelConfig();
    expect(server.exit).not.toHaveBeenCalled();
    expect(config.builds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'api/status.ts',
          use: '@vercel/node@latest',
        }),
      ])
    );
    expect(config.builds?.some(build => build.src === 'api/jobs.ts')).toBe(
      false
    );
    expect(config.routes).toEqual(initial.routes);
    expect(output.warn).toHaveBeenCalledOnce();
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[DEV_QUEUE_FUNCTION_UNMATCHED] No local queue endpoint matches functions["api/jobs.ts"]'
      )
    );
    enqueue();
    expect(mockFetch).toHaveBeenCalledOnce();

    await write('api/jobs.ts', 'export default function handler() {}');
    await changed('api/jobs.ts', 'add');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(
      broker.receiveById(
        'orders',
        messageId,
        sanitizeConsumerName('api/jobs.ts')
      )
    ).toBeNull();
  });

  it('keeps unrelated unused function errors fatal after retrying an unmatched queue declaration', async () => {
    await write('package.json', '{}');
    await write('api/status.ts', 'export default function handler() {}');
    await configure({
      functions: {
        'api/jobs.ts': { experimentalTriggers: [trigger] },
        'api/missing.ts': { memory: 256 },
      },
    });
    const report = vi
      .spyOn(server as any, 'reportError')
      .mockImplementation(() => {});
    await expect(server.getVercelConfig()).rejects.toThrow(
      'Unexpected dev exit'
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'unused_function',
        message: expect.stringContaining('api/missing.ts'),
      })
    );
  });

  it('does not suppress invalid settings on an unmatched queue declaration', async () => {
    await write('package.json', '{}');
    await write('api/status.ts', 'export default function handler() {}');
    await configure({
      functions: {
        'api/jobs.ts': {
          runtime: 'custom-runtime',
          experimentalTriggers: [trigger],
        },
      },
    });
    const report = vi
      .spyOn(server as any, 'reportError')
      .mockImplementation(() => {});
    await expect(server.getVercelConfig()).rejects.toThrow(
      'Unexpected dev exit'
    );
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid_function_runtime' })
    );
  });

  it.each([
    true,
    false,
  ])('uses actual detector function partitions in mixed providers (app-specific declaration: %s)', async appDeclaration => {
    await write('api/standalone.ts', 'export default function handler() {}');
    const functions = {
      '**/*.ts': { experimentalTriggers: [{ ...trigger, topic: 'node' }] },
      ...(appDeclaration
        ? {
            [source]: { experimentalTriggers: [{ ...trigger, topic: 'next' }] },
          }
        : {}),
    };
    await configure({ framework: 'nextjs', functions });
    const register = vi.spyOn(broker, 'setFunctionSubscriptions');
    await server.getVercelConfig();
    const inputs = hook.mock.calls.map(([input]) => input);
    const next = inputs.find(
      input => input.build.use === '@vercel/next@latest'
    )!;
    expect(
      server.getDevFunction('api/standalone')?.scope.build.config?.functions
    ).toEqual({ '**/*.ts': functions['**/*.ts'] });
    expect(next.config.functions).toEqual(
      appDeclaration ? { [source]: functions[source] } : {}
    );
    expect(next.config.zeroConfig).toBe(true);
    expect(register.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consumer: sanitizeConsumerName('**/*.ts'),
          topic: 'node',
          outputPath: 'api/standalone',
        }),
        ...(appDeclaration
          ? [
              expect.objectContaining({
                consumer: sanitizeConsumerName(source),
                topic: 'next',
                outputPath: 'api/jobs',
              }),
            ]
          : []),
      ])
    );
    expect(register.mock.calls[0][0]).toHaveLength(appDeclaration ? 2 : 1);
  });

  it.each([
    'invalid snapshot',
    'provider error',
    'invalid trigger',
  ])('retains settings, environment, and registrations after %s and retries after a fix', async failure => {
    await server.getVercelConfig();
    const previousSettings = (server as any).projectSettings;
    const previousEnv = server.envConfigs;
    const restart = vi
      .spyOn(server, 'runDevCommand')
      .mockResolvedValue(undefined);
    (server as any).initialDevCommandStarted = true;
    await configure({
      framework: 'nextjs',
      devCommand: 'different-command',
      env: { CHANGED: 'true' },
    });
    if (failure === 'provider error') {
      hook.mockRejectedValueOnce(new Error('Invalid provider configuration'));
    } else if (failure === 'invalid trigger') {
      hook.mockResolvedValueOnce({
        functions: [
          {
            ...nativeCallback,
            experimentalTriggers: [
              { type: 'queue/v2beta', consumer: '', topic: 'jobs' },
            ],
          },
        ],
        matchedFunctionPatterns: [],
      });
    } else {
      hook.mockResolvedValueOnce({
        functions: [
          {
            ...nativeCallback,
            invocation: { type: 'http', pathname: '/bad?query' },
          },
        ],
        matchedFunctionPatterns: [],
      });
    }
    await expect(changed('vercel.json')).rejects.toThrow();
    expect((server as any).projectSettings).toBe(previousSettings);
    expect(server.envConfigs).toBe(previousEnv);
    expect(restart).not.toHaveBeenCalled();
    enqueue();
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/provider/callback'
    );
    await server.getVercelConfig();
    expect(restart).toHaveBeenCalledOnce();
    expect(server.devCommand).toBe('different-command');
    expect(hook).toHaveBeenCalledTimes(3);
  });

  it('resolves Development Command origins lazily across startup, restarts, and shutdown', async () => {
    (server as any).devProcessOrigin = undefined;
    const register = vi.spyOn(broker, 'setFunctionSubscriptions');
    await server.getVercelConfig();
    const resolve = register.mock.calls[0][1];
    expect(resolve('api/jobs')).toBeNull();
    (server as any).devProcessOrigin = 'http://localhost:4001';
    expect(resolve('api/jobs')).toBeTypeOf('function');
    enqueue();
    expect(mockFetch.mock.calls.at(-1)?.[0]).toBe(
      'http://localhost:4001/provider/callback'
    );
    (server as any).devProcessOrigin = undefined;
    expect(resolve('api/jobs')).toBeNull();
    (server as any).devProcessOrigin = 'http://localhost:4002';
    expect(resolve('api/jobs')).toBeTypeOf('function');
    enqueue();
    expect(mockFetch.mock.calls.at(-1)?.[0]).toBe(
      'http://localhost:4002/provider/callback'
    );
    (server as any).stopping = true;
    expect(resolve('api/jobs')).toBeNull();
  });

  it('defers a retained builder until a selected build match is ready, without public routing', async () => {
    await write('package.json', '{}');
    await write('api/jobs.ts', 'export default function handler() {}');
    await configure({
      functions: { 'api/jobs.ts': { experimentalTriggers: [trigger] } },
    });
    const register = vi.spyOn(broker, 'setFunctionSubscriptions');
    await server.getVercelConfig();
    expect(register.mock.calls[0][0]).toMatchObject([
      { outputPath: 'api/jobs' },
    ]);
    const resolve = register.mock.calls[0][1];
    expect(resolve('api/jobs')).toBeNull();
    (server as any).functionDispatchReady = true;
    expect(resolve('api/jobs')).toBeNull();
    enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects service-hosted function triggers only when registering with the broker', async () => {
    await configure({
      services: {
        frontend: {
          root: '.',
          framework: 'nextjs',
          functions: { [source]: { experimentalTriggers: [trigger] } },
        },
      },
    });
    await expect(server.getVercelConfig()).rejects.toThrow(
      'service-hosted function queue triggers'
    );
    (server as any).queueBroker = undefined;
    (server as any).services = [{ name: 'frontend' }];
    await expect(server.getVercelConfig()).resolves.toBeDefined();
  });

  it('invalidates the complete snapshot on provider config and environment changes', async () => {
    await server.getVercelConfig();
    await server.getVercelConfig();
    expect(hook).toHaveBeenCalledOnce();
    await write('provider.config.mjs', 'export default {}');
    await changed('provider.config.mjs');
    expect(hook).toHaveBeenCalledTimes(2);
    await configure({
      framework: 'nextjs',
      env: { BASE_PATH: '/second' },
      functions: { [source]: { experimentalTriggers: [trigger] } },
    });
    await server.getVercelConfig();
    expect(hook).toHaveBeenCalledTimes(3);
    enqueue();
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/second/provider/callback'
    );
  });

  it('registers native schedules and exposes exact output lookup before timers start', async () => {
    const schedules = {
      daily: { schedule: '0 0 * * *', function: 'tasks/daily' },
    };
    hook.mockResolvedValue({
      functions: [
        {
          outputPath: 'tasks/daily',
          invocation: { type: 'http', pathname: '/internal/daily' },
          experimentalTriggers: [{ type: 'schedule/v1beta' }],
        },
        {
          outputPath: 'health',
          invocation: { type: 'http', pathname: '/health' },
        },
      ],
      schedules,
      matchedFunctionPatterns: [],
    });
    await server.getVercelConfig();
    expect(server.getDevSchedules()).toEqual([
      { name: 'daily', schedule: '0 0 * * *', function: 'tasks/daily' },
    ]);
    expect((server as any).scheduleBroker.get({ name: 'daily' })).toMatchObject(
      {
        source: 'static',
        target: { type: 'function', function: 'tasks/daily' },
      }
    );
    expect(server.getDevFunction(schedules.daily.function)).toMatchObject({
      experimentalTriggers: [{ type: 'schedule/v1beta' }],
    });
    expect(server.getDevFunction('health')).toBeDefined();
    expect(server.getDevFunction('/internal/daily')).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
    await server.invokeDevFunction('tasks/daily', {
      method: 'POST',
      body: Buffer.from('{}'),
      headers: { 'ce-type': 'com.vercel.schedule.v1beta' },
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/internal/daily'
    );
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      redirect: 'manual',
      headers: { 'ce-type': 'com.vercel.schedule.v1beta' },
    });
  });

  it('validates broker ownership before committing settings', async () => {
    await server.getVercelConfig();
    const previousSettings = (server as any).projectSettings;
    broker.updateServiceSubscriptions('worker', [
      { consumer: 'native', topic: 'native-topic' },
    ]);
    hook.mockResolvedValue(nativeSnapshot);
    await configure({ framework: 'nextjs', devCommand: 'different-command' });
    await expect(server.getVercelConfig()).rejects.toThrow(
      'configured more than once'
    );
    expect((server as any).projectSettings).toBe(previousSettings);
  });

  it('restarts the dev command only when its active environment changes', async () => {
    await configure({
      framework: 'nextjs',
      env: { BASE_PATH: '/first' },
      functions: { [source]: { experimentalTriggers: [trigger] } },
    });
    await server.getVercelConfig();
    (server as any).devCommandEnv = { ...server.envConfigs.allEnv };
    (server as any).initialDevCommandStarted = true;
    const restart = vi
      .spyOn(server, 'runDevCommand')
      .mockImplementation(async (force, options) => {
        if (force) (server as any).devCommandEnv = { ...options!.allEnv };
      });
    await server.getVercelConfig();
    await configure({
      framework: 'nextjs',
      env: { BASE_PATH: '/second' },
      functions: { [source]: { experimentalTriggers: [trigger] } },
    });
    await changed('vercel.json');
    await server.getVercelConfig();
    expect(restart.mock.calls.map(([force]) => force)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it.each([
    false,
    true,
  ])('discards superseded asynchronous snapshots (stale failure: %s)', async staleFailure => {
    let resolveFirst!: (value: DevManifest) => void;
    let rejectFirst!: (error: Error) => void;
    hook
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveFirst = resolve;
            rejectFirst = reject;
          })
      )
      .mockResolvedValue(nativeSnapshot);
    const register = vi.spyOn(broker, 'setFunctionSubscriptions');
    await write('provider.config.mjs', 'export default { revision: 1 }');
    const first = changed('provider.config.mjs');
    await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
    await write('provider.config.mjs', 'export default { revision: 2 }');
    const second = changed('provider.config.mjs');
    if (staleFailure) rejectFirst(new Error('superseded config'));
    else resolveFirst({ functions: [], matchedFunctionPatterns: [] });
    await Promise.all([first, second]);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledOnce();
    enqueue('native-topic');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/arbitrary/native-callback'
    );
  });

  it('does not invalidate snapshots for empty or generated-output-only watcher batches', async () => {
    await server.getVercelConfig();
    (server as any).buildMatches.set('generated', {
      buildResults: new Map([['output', { distPath: join(cwd, 'generated') }]]),
    });
    await server.handleFilesystemEvents([]);
    await changed('generated/output.js');
    await server.getVercelConfig();
    expect(hook).toHaveBeenCalledOnce();
  });

  it('warns once for unresolved declarations and clears diagnostics after resolution', async () => {
    await rm(join(cwd, source));
    await server.getVercelConfig();
    await server.getVercelConfig();
    expect(output.warn).toHaveBeenCalledOnce();
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `[DEV_QUEUE_FUNCTION_UNMATCHED] No local queue endpoint matches functions["${source}"]`
      )
    );
    await write(source, 'export function POST() {}');
    await changed(source, 'add');
    await rm(join(cwd, source));
    await changed(source, 'unlink');
    await server.getVercelConfig();
    expect(output.warn).toHaveBeenCalledTimes(2);
  });

  it.each([
    'empty snapshot',
    'deleted scope',
  ])('retains unrelated callbacks after an %s', async removal => {
    const builds = [
      { use: '@vercel/next', src: 'package.json' },
      { use: 'unknown-runtime', src: 'native.entry' },
    ];
    // Explicit legacy builds cannot be combined with functions, so both hooks
    // supply native registrations in this mixed-provider host test.
    hook.mockResolvedValue({
      functions: [
        {
          outputPath: 'first',
          invocation: { type: 'http', pathname: '/first' },
          experimentalTriggers: [
            { type: 'queue/v2beta', consumer: 'first', topic: 'first' },
          ],
        },
      ],
      matchedFunctionPatterns: [],
    });
    await configure({ builds });
    await server.getVercelConfig();
    expect(nativeHook).toHaveBeenCalledOnce();
    if (removal === 'empty snapshot') {
      hook.mockResolvedValue({
        functions: [],
        matchedFunctionPatterns: [],
      });
      await changed(source);
    } else {
      await configure({ builds: [builds[1]] });
      await server.getVercelConfig();
    }
    enqueue('first');
    expect(mockFetch).not.toHaveBeenCalled();
    const { messageId } = enqueue('native-topic');
    acknowledge(messageId, 'native');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/arbitrary/native-callback'
    );
    await server.getVercelConfig();
    enqueue('native-topic');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(nativeHook).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenCalledTimes(removal === 'empty snapshot' ? 2 : 1);
  });

  it('respects ignore rules and passes effective resource environment to providers', async () => {
    await write('.vercelignore', `${source}\n`);
    Object.assign(server, {
      queueOrigin: 'http://localhost:4010',
      runtimeCacheOrigin: 'http://localhost:4011',
    });
    await server.getVercelConfig();
    const input = hook.mock.calls[0][0];
    expect(input.files).not.toContain(source);
    expect(
      input.files.every(file => !file.startsWith('/') && !file.includes('\\'))
    ).toBe(true);
    expect(input.env).toMatchObject({
      VERCEL_QUEUE_BASE_URL: 'http://localhost:4010',
      RUNTIME_CACHE_ENDPOINT: expect.stringContaining('http://localhost:4011'),
    });
    enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps a no-hook builder operational and diagnoses unresolved declarations once', async () => {
    vi.mocked(importBuilders).mockImplementation(
      async specs =>
        new Map(
          [...specs].map(use => [
            use,
            {
              builder: { version: 3, build: vi.fn() },
            } as unknown as BuilderWithPkg,
          ])
        )
    );
    await server.getVercelConfig();
    await server.getVercelConfig();
    expect(hook).not.toHaveBeenCalled();
    expect(importBuilders).toHaveBeenCalledOnce();
    expect(output.warn).toHaveBeenCalledOnce();
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('getDevManifest')
    );
    enqueue();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects cross-provider identity collisions before registration', async () => {
    hook.mockResolvedValue({
      ...nativeSnapshot,
      functions: [{ ...nativeCallback, outputPath: 'other-native' }],
    });
    await configure({
      builds: [
        { use: '@vercel/next', src: 'package.json' },
        { use: 'unknown-runtime', src: 'native.entry' },
      ],
    });
    const register = vi.spyOn(broker, 'setFunctionSubscriptions');
    await expect(server.getVercelConfig()).rejects.toMatchObject({
      name: 'DEV_QUEUE_CONSUMER_DUPLICATE',
    });
    expect(register).not.toHaveBeenCalled();
  });
});
