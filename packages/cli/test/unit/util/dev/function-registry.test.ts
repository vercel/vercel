import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sanitizeConsumerName,
  type Builder,
  type DevFunction,
  type GetDevManifest,
} from '@vercel/build-utils';
import {
  importBuilders,
  type BuilderWithPkg,
} from '../../../../src/builders/import-builders';
import {
  collectDevFunctions,
  deriveQueueSubscriptions,
} from '../../../../src/util/dev/function-registry';

vi.mock('../../../../src/builders/import-builders', () => ({
  importBuilders: vi.fn(),
}));

const build: Builder = { use: 'unknown-runtime', src: 'custom/**/*' };
const queue = {
  type: 'queue/v2beta' as const,
  consumer: 'native-consumer',
  topic: 'jobs',
  retryAfterSeconds: 3,
  initialDelaySeconds: 2,
  maxDeliveries: 4,
};
const fn: DevFunction = {
  outputPath: 'tasks/native',
  invocation: { type: 'http', pathname: '/custom/@worker;v=1/' },
  experimentalTriggers: [queue],
};
const options = {
  scopes: [{ build, target: 'builder' as const }],
  workPath: '/project',
  files: ['custom/entry.example', 'package.json'],
  config: {},
  env: { VERCEL_ENV: 'development', CUSTOM_SETTING: 'value' },
};
function runtime(getDevManifest?: GetDevManifest, version = 3): BuilderWithPkg {
  return {
    builder: { version, build: vi.fn(), getDevManifest },
  } as unknown as BuilderWithPkg;
}

describe('development function registry', () => {
  const hook = vi.fn<GetDevManifest>();
  beforeEach(() => {
    hook
      .mockReset()
      .mockResolvedValue({ functions: [fn], matchedFunctionPatterns: [] });
    vi.mocked(importBuilders)
      .mockReset()
      .mockResolvedValue(new Map([[build.use, runtime(hook)]]));
  });

  it('collects an unknown provider and derives exactly its normalized Queue trigger', async () => {
    const result = await collectDevFunctions(options);
    expect(result.functions.get(fn.outputPath)).toEqual({
      ...fn,
      sourceFile: undefined,
      scope: options.scopes[0],
    });
    expect(deriveQueueSubscriptions(result)).toEqual([
      {
        outputPath: fn.outputPath,
        consumer: queue.consumer,
        topic: queue.topic,
        retryAfterSeconds: 3,
        initialDelaySeconds: 2,
        maxDeliveries: 4,
      },
    ]);
    expect(hook).toHaveBeenCalledWith({
      workPath: options.workPath,
      build,
      files: options.files,
      config: {},
      env: options.env,
    });
    expect(hook.mock.calls[0][0].build).toBe(build);
  });

  it('discovers unknown v3 source entrypoints without hooks or Queue triggers', async () => {
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime()]])
    );
    const result = await collectDevFunctions(options);
    expect([...result.functions.values()]).toMatchObject([
      {
        outputPath: 'custom/entry.example',
        sourceFile: 'custom/entry.example',
        invocation: { type: 'entrypoint', entrypoint: 'custom/entry.example' },
      },
    ]);
    expect(deriveQueueSubscriptions(result)).toEqual([]);
  });

  it.each([
    true,
    false,
  ])('uses scalar deployment naming (zeroConfig: %s), not index URL aliases', async zeroConfig => {
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime()]])
    );
    const functions = {
      'api/*': { experimentalTriggers: [{ type: 'schedule/v1beta' as const }] },
    };
    const result = await collectDevFunctions({
      ...options,
      files: ['api/index.foo', 'api/job.multi.foo'],
      scopes: [
        {
          build: { ...build, src: 'api/*', config: { zeroConfig, functions } },
          target: 'builder',
        },
      ],
    });
    expect([...result.functions.keys()]).toEqual(
      zeroConfig
        ? ['api/index', 'api/job.multi']
        : ['api/index.foo', 'api/job.multi.foo']
    );
    expect([...result.functions.values()][0].experimentalTriggers).toEqual([
      { type: 'schedule/v1beta' },
    ]);
  });

  it('uses source globs and existing consumer normalization, not the output identity', async () => {
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime()]])
    );
    const functions = {
      'custom/*': {
        experimentalTriggers: [
          { type: 'queue/v2beta' as const, topic: 'jobs' },
        ],
      },
    };
    const result = await collectDevFunctions({
      ...options,
      config: { functions },
      scopes: [
        {
          build: { ...build, config: { zeroConfig: true, functions } },
          target: 'builder',
        },
      ],
    });
    expect(deriveQueueSubscriptions(result)).toMatchObject([
      {
        outputPath: 'custom/entry',
        consumer: sanitizeConsumerName('custom/*'),
        topic: 'jobs',
      },
    ]);
    expect(result.unmatchedPatterns).toEqual([]);
  });

  it('supports bounded classic VX api functions with arbitrary extensions', async () => {
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime(undefined, -1)]])
    );
    const result = await collectDevFunctions({
      ...options,
      files: [
        'api/index.unusual',
        'api/nested/job.custom',
        'api/middleware.custom',
      ],
      scopes: [
        {
          build: { ...build, src: 'api/**', config: { zeroConfig: true } },
          target: 'builder',
        },
      ],
    });
    expect([...result.functions.keys()]).toEqual([
      'api/index',
      'api/nested/job',
      'api/middleware',
    ]);
  });

  it.each([
    { version: 2, src: 'custom/*', config: {} },
    { version: -1, src: 'custom/*', config: { zeroConfig: true } },
    { version: -1, src: 'api/*', config: {} },
    { version: 3, src: 'custom/*', config: { framework: 'other' } },
    { version: 3, src: 'custom/*', config: { middleware: true } },
    { version: 3, src: 'custom/*', config: { serviceName: 'worker' } },
    { version: 3, src: 'custom/*', config: { serviceType: 'queue' } },
    { version: 3, src: 'custom/*', config: { buildType: 'app' } },
    { version: 3, src: '<detect>', config: {} },
    { version: 3, src: 'package.json', config: {} },
  ])('does not guess unsupported modes: %j', async ({
    version,
    src,
    config,
  }) => {
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime(undefined, version)]])
    );
    const result = await collectDevFunctions({
      ...options,
      files: [...options.files, 'api/jobs.foo'],
      scopes: [{ build: { ...build, src, config }, target: 'builder' }],
    });
    expect(result.functions.size).toBe(0);
  });

  it.each([
    2, 3, -1,
  ])('treats a version %s hook as authoritative, including empty snapshots', async version => {
    hook.mockResolvedValue({ functions: [], matchedFunctionPatterns: [] });
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, runtime(hook, version)]])
    );
    expect((await collectDevFunctions(options)).functions.size).toBe(0);
    expect(hook).toHaveBeenCalledOnce();
  });

  it('names native schedules keyed by name', async () => {
    hook.mockResolvedValue({
      functions: [],
      schedules: {
        daily: { schedule: '0 0 * * *', topic: 'jobs' },
        hourly: { schedule: '0 * * * *', topic: 'jobs' },
      },
      matchedFunctionPatterns: [],
    });
    const result = await collectDevFunctions(options);
    expect(result.schedules).toEqual([
      { name: 'daily', schedule: '0 0 * * *', topic: 'jobs' },
      { name: 'hourly', schedule: '0 * * * *', topic: 'jobs' },
    ]);
  });

  it('retains native schedules and functions with no Queue subscriptions', async () => {
    const schedule = { schedule: '0 0 * * *', function: fn.outputPath };
    hook.mockResolvedValue({
      functions: [
        { ...fn, experimentalTriggers: [{ type: 'schedule/v1beta' }] },
        {
          outputPath: 'status',
          invocation: { type: 'http', pathname: '/status' },
        },
      ],
      schedules: { daily: schedule },
      matchedFunctionPatterns: [],
    });
    const result = await collectDevFunctions(options);
    expect(result.functions.has(schedule.function)).toBe(true);
    expect(result.functions.has('status')).toBe(true);
    expect(result.schedules).toEqual([{ name: 'daily', ...schedule }]);
    expect(result.functions.get(fn.outputPath)?.experimentalTriggers).toEqual([
      { type: 'schedule/v1beta' },
    ]);
    expect(deriveQueueSubscriptions(result)).toEqual([]);
  });

  it('honors empty scoped functions without restoring root patterns', async () => {
    const config = {
      functions: {
        'custom/*': {
          experimentalTriggers: [
            { type: 'queue/v2beta' as const, topic: 'jobs' },
          ],
        },
      },
      custom: { root: true },
    };
    const scopedBuild = {
      ...build,
      config: { functions: {}, outputDirectory: 'scope' },
    };
    hook.mockResolvedValue({ functions: [], matchedFunctionPatterns: [] });
    const result = await collectDevFunctions({
      ...options,
      config,
      scopes: [{ build: scopedBuild, target: 'builder' }],
    });
    expect(hook.mock.calls[0][0].config).toEqual({
      ...config,
      ...scopedBuild.config,
    });
    expect(hook.mock.calls[0][0].config.custom).not.toBe(config.custom);
    expect(result.unmatchedPatterns).toEqual(['custom/*']);
  });

  it.each([
    [{ name: 'job', schedule: '* * * * *', topic: 'jobs' }],
    null,
    'daily',
    { daily: null },
    { daily: { name: 'daily', schedule: '* * * * *', topic: 'jobs' } },
    { '-daily': { schedule: '* * * * *', topic: 'jobs' } },
    { 'missing-fields': {} },
    {
      job: {
        expression: { cron: '* * * * *' },
        target: { topic: 'jobs' },
      },
    },
    {
      job: {
        schedule: '* * * * *',
        jitter: 16,
        topic: 'jobs',
      },
    },
    {
      job: {
        schedule: '* * * * *',
        function: 'api/job',
        topic: 'jobs',
      },
    },
    {
      job: {
        schedule: '* * * * *',
        topic: 'jobs',
        namespace: 'custom',
      },
    },
    {
      job: {
        schedule: '* * * * *',
        topic: 'x'.repeat(257),
      },
    },
  ])('validates native schedules with the authored BOA schema: %j', async schedules => {
    hook.mockResolvedValue({
      functions: [],
      matchedFunctionPatterns: [],
      schedules,
    } as never);
    await expect(collectDevFunctions(options)).rejects.toThrow(/schedules/);
  });

  it('aggregates each original scope without expanding provider source patterns', async () => {
    const secondBuild = { ...build, src: 'other/*', config: { custom: true } };
    hook
      .mockResolvedValueOnce({
        functions: [fn],
        matchedFunctionPatterns: ['custom/*'],
      })
      .mockResolvedValueOnce({ functions: [], matchedFunctionPatterns: [] });
    const result = await collectDevFunctions({
      ...options,
      config: {
        functions: {
          'custom/*': {
            experimentalTriggers: [{ type: 'queue/v2beta', topic: 'jobs' }],
          },
          missing: {
            experimentalTriggers: [{ type: 'queue/v2beta', topic: 'jobs' }],
          },
        },
      },
      scopes: [...options.scopes, { build: secondBuild, target: 'framework' }],
    });
    expect(hook.mock.calls.map(([input]) => input.build)).toEqual([
      build,
      secondBuild,
    ]);
    expect(result.unmatchedPatterns).toEqual(['missing']);
  });

  it('rejects duplicate output identities even without triggers', async () => {
    hook.mockResolvedValue({
      functions: [
        { ...fn, experimentalTriggers: [] },
        { ...fn, experimentalTriggers: [] },
      ],
      matchedFunctionPatterns: [],
    });
    await expect(collectDevFunctions(options)).rejects.toMatchObject({
      name: 'DEV_FUNCTION_OUTPUT_DUPLICATE',
    });
  });

  it('rejects duplicate consumer identities on different outputs', async () => {
    hook.mockResolvedValue({
      functions: [fn, { ...fn, outputPath: 'other' }],
      matchedFunctionPatterns: [],
    });
    const registry = await collectDevFunctions(options);
    expect(() => deriveQueueSubscriptions(registry)).toThrow(
      'configured more than once'
    );
  });

  it.each([
    'https://elsewhere.test/jobs',
    '//elsewhere.test/jobs',
    'jobs',
    '/jobs?key=value',
    '/jobs#fragment',
    '/jobs\\other',
    '/a/../jobs',
    '/a/%2e%2e/jobs',
    '/a/%2Fjobs',
    '/a/%5Cjobs',
    '/a/%00jobs',
    '/jobs\n',
    '/bad%escape',
  ])('rejects unsafe HTTP paths: %j', async pathname => {
    hook.mockResolvedValue({
      functions: [{ ...fn, invocation: { type: 'http', pathname } }],
      matchedFunctionPatterns: [],
    });
    await expect(collectDevFunctions(options)).rejects.toMatchObject({
      name: 'DEV_FUNCTION_MANIFEST_INVALID',
    });
  });

  it.each([
    '/api/jobs',
    '../jobs',
    'api/../jobs',
    'api//jobs',
    'api/jobs.func',
    'api/jobs?query',
    'api/jobs#hash',
    'api/%2e%2e/jobs',
  ])('rejects invalid output identities: %j', async outputPath => {
    hook.mockResolvedValue({
      functions: [{ ...fn, outputPath }],
      matchedFunctionPatterns: [],
    });
    await expect(collectDevFunctions(options)).rejects.toMatchObject({
      name: 'DEV_FUNCTION_MANIFEST_INVALID',
    });
  });

  it.each([
    undefined,
    { functions: null, matchedFunctionPatterns: [] },
    { functions: [], matchedFunctionPatterns: [false] },
    { functions: [null], matchedFunctionPatterns: [] },
  ])('rejects malformed snapshots: %j', async snapshot => {
    hook.mockResolvedValue(snapshot as never);
    await expect(collectDevFunctions(options)).rejects.toMatchObject({
      name: 'DEV_FUNCTION_MANIFEST_INVALID',
    });
  });

  it.each([
    { ...queue, consumer: '' },
    { ...queue, retryAfterSeconds: -1 },
    { ...queue, retryAfterSeconds: 0 },
    { ...queue, retryAfterSeconds: NaN },
    { ...queue, retryAfterSeconds: Infinity },
    { ...queue, initialDelaySeconds: -1 },
    { ...queue, initialDelaySeconds: NaN },
    { ...queue, initialDelaySeconds: Infinity },
    { ...queue, maxDeliveries: 0 },
    { ...queue, maxDeliveries: -1 },
    { ...queue, maxDeliveries: 1.5 },
    { ...queue, maxDeliveries: NaN },
    { ...queue, maxDeliveries: Infinity },
  ])('rejects malformed normalized Queue triggers: %j', async trigger => {
    hook.mockResolvedValue({
      functions: [{ ...fn, experimentalTriggers: [trigger] }],
      matchedFunctionPatterns: [],
    });
    const registry = await collectDevFunctions(options);
    expect(() => deriveQueueSubscriptions(registry)).toThrow(
      'invalid development function manifest'
    );
  });

  it.each([
    { retryAfterSeconds: 0.5, initialDelaySeconds: 0, maxDeliveries: 1 },
    { retryAfterSeconds: 1, initialDelaySeconds: 0.5, maxDeliveries: 2 },
    {
      retryAfterSeconds: undefined,
      initialDelaySeconds: undefined,
      maxDeliveries: undefined,
    },
  ])('accepts valid Queue tuning boundaries: %j', async tuning => {
    hook.mockResolvedValue({
      functions: [{ ...fn, experimentalTriggers: [{ ...queue, ...tuning }] }],
      matchedFunctionPatterns: [],
    });
    const registry = await collectDevFunctions(options);
    expect(deriveQueueSubscriptions(registry)).toEqual([
      {
        outputPath: fn.outputPath,
        consumer: queue.consumer,
        topic: queue.topic,
        ...tuning,
      },
    ]);
  });

  it('reports missing imports and propagates provider errors', async () => {
    hook.mockRejectedValueOnce(new Error('Invalid provider configuration'));
    await expect(collectDevFunctions(options)).rejects.toThrow(
      'Invalid provider configuration'
    );
    vi.mocked(importBuilders).mockResolvedValue(new Map());
    await expect(collectDevFunctions(options)).rejects.toMatchObject({
      name: 'DEV_BUILDER_LOAD_FAILED',
    });
  });
});
