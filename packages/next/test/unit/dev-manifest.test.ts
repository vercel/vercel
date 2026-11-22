import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sanitizeConsumerName,
  type Config,
  type GetDevManifestOptions,
} from '@vercel/build-utils';
import { join } from 'path';
import { getDevManifest } from '../../src/dev-manifest';
import { loadNextDevRoutingConfig } from '../../src/next-dev-config';

vi.mock('../../src/next-dev-config', () => ({
  loadNextDevRoutingConfig: vi.fn(),
}));

const trigger = { type: 'queue/v2beta' as const, topic: 'orders' };
const workPath = join(__dirname, 'project');
const env = { RESOURCE_TOKEN: 'resource-token' };
const loadConfig = vi.mocked(loadNextDevRoutingConfig);

function discover(
  files: string[],
  functions?: Config['functions'],
  options: Partial<GetDevManifestOptions> = {}
) {
  return getDevManifest({
    workPath,
    build: { src: 'package.json', use: '@vercel/next' },
    files,
    config: { functions },
    env,
    ...options,
  });
}

beforeEach(() => {
  loadConfig.mockReset().mockResolvedValue({
    basePath: '',
    pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  });
});

describe('getDevManifest', () => {
  it.each([
    ['pages/api/jobs.ts', 'api/jobs', '/api/jobs'],
    ['pages/api.ts', 'api', '/api'],
    ['pages/api/index.ts', 'api', '/api'],
    ['app/route.ts', 'index', '/'],
    ['src/pages/api/jobs/index.ts', 'api/jobs', '/api/jobs'],
    ['app/api/jobs/route.ts', 'api/jobs', '/api/jobs'],
    ['src/app/(internal)/api/jobs/route.js', 'api/jobs', '/api/jobs'],
    ['app/(internal)/(queue)/route.ts', 'index', '/'],
    ['app/.well-known/jobs/route.ts', '.well-known/jobs', '/.well-known/jobs'],
    ['app/api/index/route.ts', 'api/index', '/api/index'],
    ['app/index/route.ts', 'index', '/index'],
  ])('maps %s to deployment and HTTP identities with or without triggers', async (sourceFile, outputPath, pathname) => {
    const fn = {
      sourceFile,
      outputPath,
      invocation: { type: 'http', pathname },
    };
    expect(await discover([sourceFile])).toEqual({
      functions: [fn],
      matchedFunctionPatterns: [],
    });
    const configuredTrigger = {
      ...trigger,
      maxDeliveries: 3,
      initialDelaySeconds: 2,
      retryAfterSeconds: 4,
      maxConcurrency: 5,
    };
    expect(
      await discover([sourceFile], {
        [sourceFile]: { experimentalTriggers: [configuredTrigger] },
      })
    ).toEqual({
      functions: [
        {
          ...fn,
          experimentalTriggers: [
            {
              ...configuredTrigger,
              consumer: sanitizeConsumerName(sourceFile),
            },
          ],
        },
      ],
      matchedFunctionPatterns: [sourceFile],
    });
    expect(loadConfig).toHaveBeenCalledWith(workPath, env, [sourceFile]);
    expect(loadConfig).toHaveBeenCalledTimes(2);
  });

  it('uses the authored pattern and service name for normalized Queue identity', async () => {
    const pattern = 'app/api/jobs/route.{js,ts}';
    const functions = { [pattern]: { experimentalTriggers: [trigger] } };
    expect(
      await discover(
        ['app/api/jobs/route.ts', 'app/api/jobs/util.ts'],
        functions,
        { config: { functions, serviceName: 'web' } }
      )
    ).toMatchObject({
      functions: [
        {
          outputPath: 'api/jobs',
          experimentalTriggers: [
            { ...trigger, consumer: sanitizeConsumerName(`web~${pattern}`) },
          ],
        },
      ],
      matchedFunctionPatterns: [pattern],
    });
  });

  it('applies globs to entries, not colocated helpers or unrelated sources', async () => {
    const pattern = '**/*.ts';
    const result = await discover(
      [
        'api/standalone.ts',
        'src/routes/other.ts',
        'app/api/jobs/schema.ts',
        'app/api/jobs/route.ts',
        'app/api/jobs/util.ts',
        'app/layout.ts',
        'next.config.ts',
      ],
      { [pattern]: { experimentalTriggers: [trigger] } }
    );
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].sourceFile).toBe('app/api/jobs/route.ts');
    expect(result.matchedFunctionPatterns).toEqual([pattern]);
  });

  it('leaves missing, shadowed, and helper-only patterns unmatched', async () => {
    expect(
      await discover(['app/api/jobs/schema.ts', 'app/api/other/route.ts'], {
        'app/api/other/*': { memory: 1024 },
        'app/api/other/route.ts': { experimentalTriggers: [trigger] },
        'app/api/jobs/**/*.ts': { experimentalTriggers: [trigger] },
        'app/api/missing/route.ts': { experimentalTriggers: [trigger] },
      })
    ).toEqual({
      functions: [
        {
          sourceFile: 'app/api/other/route.ts',
          outputPath: 'api/other',
          invocation: { type: 'http', pathname: '/api/other' },
        },
      ],
      matchedFunctionPatterns: ['app/api/other/*'],
    });
  });

  it('uses the first functions match, including entries without triggers', async () => {
    const source = 'pages/api/jobs.ts';
    const result = await discover([source], {
      'pages/api/*.ts': { memory: 1024 },
      [source]: { experimentalTriggers: [trigger] },
    });
    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]).not.toHaveProperty('experimentalTriggers');
    expect(result.matchedFunctionPatterns).toEqual(['pages/api/*.ts']);
    expect(
      await discover([source], {
        'pages/api/*.ts': { experimentalTriggers: [trigger] },
        [source]: { experimentalTriggers: [{ ...trigger, topic: 'other' }] },
      })
    ).toMatchObject({
      functions: [
        {
          experimentalTriggers: [
            { ...trigger, consumer: sanitizeConsumerName('pages/api/*.ts') },
          ],
        },
      ],
      matchedFunctionPatterns: ['pages/api/*.ts'],
    });
  });

  it('preserves Schedule and v1beta Queue metadata without inventing schedules', async () => {
    const schedule = { type: 'schedule/v1beta' as const };
    const oldQueue = {
      type: 'queue/v1beta' as const,
      topic: 'orders',
      consumer: 'old',
    };
    const result = await discover(
      ['pages/api/schedule.ts', 'pages/api/old.ts'],
      {
        'pages/api/missing.ts': { experimentalTriggers: [trigger] },
        'pages/api/schedule.ts': { experimentalTriggers: [schedule] },
        'pages/api/old.ts': { experimentalTriggers: [oldQueue, schedule] },
      }
    );
    expect(result).toEqual({
      functions: [
        {
          sourceFile: 'pages/api/schedule.ts',
          outputPath: 'api/schedule',
          invocation: { type: 'http', pathname: '/api/schedule' },
          experimentalTriggers: [schedule],
        },
        {
          sourceFile: 'pages/api/old.ts',
          outputPath: 'api/old',
          invocation: { type: 'http', pathname: '/api/old' },
          experimentalTriggers: [oldQueue, schedule],
        },
      ],
      matchedFunctionPatterns: ['pages/api/schedule.ts', 'pages/api/old.ts'],
    });
    expect(result).not.toHaveProperty('schedules');
    expect(result).not.toHaveProperty('subscriptions');
  });

  it('ignores other builders without loading Next or validating their triggers', async () => {
    const files = ['api/jobs.ts', 'api/jobs.py', 'src/routes/api/jobs.ts'];
    expect(
      await discover(
        files,
        Object.fromEntries(
          files.map(file => [
            file,
            { experimentalTriggers: [trigger, trigger] },
          ])
        )
      )
    ).toEqual({ functions: [], matchedFunctionPatterns: [] });
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it('leaves Queue registration and shared-consumer validation to the host', async () => {
    const result = await discover(['pages/api/a.ts', 'pages/api/b.ts'], {
      'pages/api/*.ts': { experimentalTriggers: [trigger] },
    });
    expect(result.functions.map(fn => fn.outputPath)).toEqual([
      'api/a',
      'api/b',
    ]);
    expect(result.functions[0].experimentalTriggers).toEqual(
      result.functions[1].experimentalTriggers
    );
    expect(result.matchedFunctionPatterns).toEqual(['pages/api/*.ts']);
    expect(result).not.toHaveProperty('schedules');
  });

  it('deduplicates repeated source files only', async () => {
    expect(
      (await discover(['pages/api/jobs.ts', 'pages/api/jobs.ts'])).functions
    ).toHaveLength(1);
    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['pages/api/jobs.ts', 'pages/api/jobs/index.ts'],
    ['pages/api/jobs.ts', 'pages/api/jobs.js'],
    ['app/(a)/api/jobs/route.ts', 'app/(b)/api/jobs/route.ts'],
    ['app/api/jobs/route.ts', 'pages/api/jobs.ts'],
    ['app/route.ts', 'app/index/route.ts'],
  ])('rejects output identity collisions between %s and %s without triggers', async (first, second) => {
    await expect(discover([first, second])).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_FUNCTION_COLLISION',
      message: expect.stringContaining(`"${first}" and "${second}"`),
    });
  });

  it('rejects output collisions even with different consumers and topics', async () => {
    const first = 'pages/api/jobs.ts';
    const second = 'app/api/jobs/route.ts';
    await expect(
      discover([first, second], {
        [first]: { experimentalTriggers: [trigger] },
        [second]: { experimentalTriggers: [{ ...trigger, topic: 'other' }] },
      })
    ).rejects.toMatchObject({ code: 'NEXT_DEV_MANIFEST_FUNCTION_COLLISION' });
  });

  it.each([
    'pages/api/[id].ts',
    'app/api/[...slug]/route.ts',
    'app/api/[[...slug]]/route.ts',
    'app/@slot/api/jobs/route.ts',
    'app/_private/api/jobs/route.ts',
    'app/(.)api/jobs/route.ts',
    'app/(..)api/jobs/route.ts',
    'app/api/jobs/page.tsx',
    'pages/jobs.tsx',
    'app/api/jobs/schema.ts',
    'app/api/../route.ts',
  ])('skips ordinary unsupported %s but diagnoses targeted triggers', async source => {
    expect(await discover([source])).toEqual({
      functions: [],
      matchedFunctionPatterns: [],
    });
    expect(await discover([source], { [source]: { memory: 1024 } })).toEqual({
      functions: [],
      matchedFunctionPatterns: [],
    });
    for (const experimentalTriggers of [
      [trigger],
      [{ type: 'schedule/v1beta' as const }],
    ]) {
      await expect(
        discover([source], { [source]: { experimentalTriggers } })
      ).rejects.toMatchObject({
        code: 'NEXT_DEV_MANIFEST_FUNCTION_UNSUPPORTED',
        message: expect.stringContaining('matching pageExtensions'),
      });
    }
  });

  it.each([
    'app/api/[id]/route.ts',
    'app/api/jobs/page.ts',
    'pages/jobs.ts',
  ])('diagnoses unsupported entries matched by a trigger glob: %s', async source => {
    await expect(
      discover([source], { '**/*.ts': { experimentalTriggers: [trigger] } })
    ).rejects.toMatchObject({ code: 'NEXT_DEV_MANIFEST_FUNCTION_UNSUPPORTED' });
  });

  it('does not diagnose triggers shadowed by an earlier non-trigger pattern', async () => {
    const source = 'pages/api/[id].ts';
    expect(
      await discover([source], {
        'pages/api/*.ts': { memory: 1024 },
        [source]: { experimentalTriggers: [trigger] },
      })
    ).toEqual({ functions: [], matchedFunctionPatterns: [] });
  });

  it.each([
    ['app/api/jobs/route.api.ts', 'prefix/api/jobs', '/prefix/api/jobs'],
    ['src/pages/api/jobs/index.api.ts', 'prefix/api/jobs', '/prefix/api/jobs'],
    ['app/route.api.ts', 'prefix/index', '/prefix'],
    ['app/api/index/route.api.ts', 'prefix/api/index', '/prefix/api/index'],
  ])('uses basePath and longest multipart pageExtensions for %s', async (source, outputPath, pathname) => {
    loadConfig.mockResolvedValue({
      basePath: '/prefix',
      pageExtensions: ['ts', 'api.ts'],
    });
    expect(await discover([source])).toEqual({
      functions: [
        {
          sourceFile: source,
          outputPath,
          invocation: { type: 'http', pathname },
        },
      ],
      matchedFunctionPatterns: [],
    });
  });

  it.each([
    ['app/api/jobs/route.ts', '', 'api/jobs', '/api/jobs/'],
    ['pages/api/jobs.ts', '', 'api/jobs', '/api/jobs/'],
    [
      'src/pages/api/jobs/index.ts',
      '/docs',
      'docs/api/jobs',
      '/docs/api/jobs/',
    ],
    ['app/route.ts', '', 'index', '/'],
    ['app/route.ts', '/docs', 'docs/index', '/docs/'],
    ['app/route.ts', '/docs.v1', 'docs.v1/index', '/docs.v1/'],
    ['app/route.ts', '/.well-known', '.well-known/index', '/.well-known/'],
    [
      'app/api/jobs.json/route.ts',
      '/docs',
      'docs/api/jobs.json',
      '/docs/api/jobs.json',
    ],
    ['pages/api/jobs.json.ts', '', 'api/jobs.json', '/api/jobs.json'],
    [
      'app/api/jobs.data-file/route.ts',
      '',
      'api/jobs.data-file',
      '/api/jobs.data-file',
    ],
    ['app/api/jobs./route.ts', '', 'api/jobs.', '/api/jobs.'],
    ['app/.hidden/route.ts', '', '.hidden', '/.hidden'],
    ['app/v1.0/jobs/route.ts', '', 'v1.0/jobs', '/v1.0/jobs/'],
    [
      'app/.well-known/jobs/route.ts',
      '',
      '.well-known/jobs',
      '/.well-known/jobs',
    ],
    [
      'app/.WELL-KNOWN/jobs/route.ts',
      '',
      '.WELL-KNOWN/jobs',
      '/.WELL-KNOWN/jobs',
    ],
    [
      'app/.well-known-other/jobs/route.ts',
      '',
      '.well-known-other/jobs',
      '/.well-known-other/jobs',
    ],
    [
      'app/.well-known/jobs/route.ts',
      '/docs',
      'docs/.well-known/jobs',
      '/docs/.well-known/jobs/',
    ],
    [
      'app/jobs/route.ts',
      '/.well-known',
      '.well-known/jobs',
      '/.well-known/jobs',
    ],
  ])('canonicalizes %s under basePath %s without changing output identity', async (sourceFile, basePath, outputPath, canonicalPathname) => {
    const slashlessPathname =
      canonicalPathname === '/' ? '/' : canonicalPathname.replace(/\/$/, '');
    for (const [trailingSlash, skipTrailingSlashRedirect] of [
      [true, false],
      [false, false],
      [true, true],
      [false, true],
    ]) {
      loadConfig.mockResolvedValue({
        basePath,
        pageExtensions: ['ts'],
        trailingSlash,
        skipTrailingSlashRedirect,
      });
      const manifest = await discover([sourceFile], {
        [sourceFile]: { experimentalTriggers: [trigger] },
      });
      expect(manifest).toEqual({
        functions: [
          {
            sourceFile,
            outputPath,
            invocation: {
              type: 'http',
              pathname:
                trailingSlash && !skipTrailingSlashRedirect
                  ? canonicalPathname
                  : slashlessPathname,
            },
            experimentalTriggers: [
              { ...trigger, consumer: sanitizeConsumerName(sourceFile) },
            ],
          },
        ],
        matchedFunctionPatterns: [sourceFile],
      });
    }
  });

  it('honors case-sensitive matching of the .well-known redirect exception', async () => {
    loadConfig.mockResolvedValue({
      basePath: '',
      pageExtensions: ['ts'],
      trailingSlash: true,
      caseSensitiveRoutes: true,
    });
    expect(await discover(['app/.WELL-KNOWN/jobs/route.ts'])).toMatchObject({
      functions: [
        {
          outputPath: '.WELL-KNOWN/jobs',
          invocation: { type: 'http', pathname: '/.WELL-KNOWN/jobs/' },
        },
      ],
    });
  });

  it('keeps Edge output normalization separate from trailing-slash invocation', async () => {
    loadConfig.mockResolvedValue({
      basePath: '/docs',
      pageExtensions: ['ts'],
      trailingSlash: true,
      edgeRuntimeFiles: ['app/jobs/index/route.ts'],
    });
    expect(await discover(['app/jobs/index/route.ts'])).toMatchObject({
      functions: [
        {
          outputPath: 'docs/jobs',
          invocation: { type: 'http', pathname: '/docs/jobs/index/' },
        },
      ],
    });
  });

  it('diagnoses excluded extensions only when exactly targeted by triggers', async () => {
    loadConfig.mockResolvedValue({ basePath: '', pageExtensions: ['api.ts'] });
    const source = 'app/api/jobs/route.ts';
    await expect(
      discover([source], { [source]: { experimentalTriggers: [trigger] } })
    ).rejects.toThrow('matching pageExtensions');
    expect(
      await discover([source], {
        '**/*.ts': { experimentalTriggers: [trigger] },
      })
    ).toEqual({ functions: [], matchedFunctionPatterns: [] });
    expect(await discover([source])).toEqual({
      functions: [],
      matchedFunctionPatterns: [],
    });
  });

  it.each([
    'app',
    'pages',
  ])('skips src/%s shadowed by the root router unless targeted', async router => {
    const source =
      router === 'app' ? 'src/app/api/jobs/route.ts' : 'src/pages/api/jobs.ts';
    const files = [source, `${router}/index.tsx`];
    expect(await discover(files)).toEqual({
      functions: [],
      matchedFunctionPatterns: [],
    });
    await expect(
      discover(files, { [source]: { experimentalTriggers: [trigger] } })
    ).rejects.toThrow(`root ${router} directory instead of src/${router}`);
  });

  it('prioritizes each router independently', async () => {
    expect(
      await discover(['src/app/api/jobs/route.ts', 'pages/index.tsx'])
    ).toMatchObject({ functions: [{ outputPath: 'api/jobs' }] });
  });

  it.each([
    ['src/app/api/jobs/route.ts', 'api/jobs', '/api/jobs'],
    ['app/route.ts', 'index', '/'],
    ['pages/api/jobs/index.ts', 'api/jobs', '/api/jobs'],
  ])('scopes sources, configuration, and deployment outputs to nested builds: %s', async (file, output, pathname) => {
    const source = `apps/web/${file}`;
    const pattern = 'apps/web/**/*.ts';
    expect(
      await discover(
        [source, 'app/page.ts', 'apps/other/pages/api/jobs.ts', 'api/jobs.ts'],
        { [pattern]: { experimentalTriggers: [trigger] } },
        { build: { src: 'apps/web/package.json', use: '@vercel/next' } }
      )
    ).toMatchObject({
      functions: [
        {
          sourceFile: source,
          outputPath: `apps/web/${output}`,
          invocation: { type: 'http', pathname },
          experimentalTriggers: [
            { ...trigger, consumer: sanitizeConsumerName(pattern) },
          ],
        },
      ],
      matchedFunctionPatterns: [pattern],
    });
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith(
      join(workPath, 'apps/web'),
      env,
      [file]
    );
  });

  it('rejects basePath with a nested build just like deployment', async () => {
    loadConfig.mockResolvedValue({
      basePath: '/prefix',
      pageExtensions: ['ts'],
    });
    await expect(
      discover(
        ['apps/web/app/route.ts'],
        {},
        {
          build: { src: 'apps/web/package.json', use: '@vercel/next' },
        }
      )
    ).rejects.toMatchObject({ code: 'NEXT_BASEPATH_LEGACY_BUILDS' });
  });

  it.each([
    ['app/route.ts', '.', '/prefix', 'prefix', '/prefix'],
    [
      'app/nested/index/route.ts',
      '.',
      '/prefix',
      'prefix/nested',
      '/prefix/nested/index',
    ],
    ['app/route.ts', 'apps/web', '', 'index', '/'],
    ['pages/api/jobs.ts', 'apps/web', '', 'api/jobs', '/api/jobs'],
    [
      'app/nested/index/route.ts',
      'apps/web',
      '',
      'nested/index',
      '/nested/index',
    ],
  ])('uses Edge artifact naming for %s in %s with basePath %s', async (file, root, basePath, outputPath, pathname) => {
    loadConfig.mockResolvedValue({
      basePath,
      pageExtensions: ['ts'],
      edgeRuntimeFiles: [file],
    });
    const sourceFile = root === '.' ? file : `${root}/${file}`;
    expect(
      await discover([sourceFile], undefined, {
        build: { src: `${root}/package.json`, use: '@vercel/next' },
      })
    ).toEqual({
      functions: [
        { sourceFile, outputPath, invocation: { type: 'http', pathname } },
      ],
      matchedFunctionPatterns: [],
    });
  });

  it('rejects Node/Edge collisions introduced by deployment normalization', async () => {
    loadConfig.mockResolvedValue({
      basePath: '/docs',
      pageExtensions: ['ts'],
      edgeRuntimeFiles: ['app/jobs/index/route.ts'],
    });
    await expect(
      discover(['app/jobs/route.ts', 'app/jobs/index/route.ts'])
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_FUNCTION_COLLISION',
      message: expect.stringContaining('"docs/jobs"'),
    });
  });

  it('uses the service root when the original build has no src', async () => {
    expect(
      await discover(['app/route.ts'], undefined, {
        build: { use: '@vercel/next' },
      })
    ).toMatchObject({
      functions: [
        { outputPath: 'index', invocation: { type: 'http', pathname: '/' } },
      ],
    });
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith(workPath, env, [
      'app/route.ts',
    ]);
  });

  it('preserves deployment trigger normalization validation', async () => {
    await expect(
      discover(['app/route.ts'], {
        'app/route.ts': { experimentalTriggers: [trigger, trigger] },
      })
    ).rejects.toThrow('can only have one item for queue/v2beta');
  });

  it('propagates config errors even for functions without triggers', async () => {
    loadConfig.mockRejectedValue(new Error('config failed'));
    await expect(discover(['app/route.ts'])).rejects.toThrow('config failed');
  });

  it('reloads each snapshot, respects empty scoped config, and does not mutate inputs', async () => {
    const source = 'app/route.ts';
    const files = [source];
    Object.freeze(files);
    const triggers = [Object.freeze(trigger)];
    Object.freeze(triggers);
    const functions = Object.freeze({
      [source]: Object.freeze({ experimentalTriggers: triggers }),
    });
    Object.freeze(env);
    await discover(files, functions);
    loadConfig.mockResolvedValue({ basePath: '/new', pageExtensions: ['ts'] });
    expect(await discover(files, functions)).toMatchObject({
      functions: [
        {
          outputPath: 'new/index',
          invocation: { type: 'http', pathname: '/new' },
        },
      ],
    });
    expect(await discover([], functions)).toEqual({
      functions: [],
      matchedFunctionPatterns: [],
    });
    expect(await discover(files, {})).toEqual({
      functions: [
        {
          sourceFile: source,
          outputPath: 'new/index',
          invocation: { type: 'http', pathname: '/new' },
        },
      ],
      matchedFunctionPatterns: [],
    });
    expect(loadConfig).toHaveBeenCalledTimes(3);
    expect(functions[source].experimentalTriggers).toEqual([trigger]);
  });
});
