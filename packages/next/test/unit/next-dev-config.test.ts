import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { loadNextDevRoutingConfig } from '../../src/next-dev-config';
import type { GetDevManifest } from '@vercel/build-utils';

describe('loadNextDevRoutingConfig', () => {
  let root: string;
  let cwd: string;

  async function write(file: string, contents: string) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'next-dev-config-'));
    cwd = join(root, 'apps/web');
    await write(join(cwd, 'package.json'), '{"type":"module"}');
    // Model the installed Next module contract, including workspace hoisting.
    await write(
      join(root, 'node_modules/next/package.json'),
      '{"name":"next"}'
    );
    await write(
      join(root, 'node_modules/next/constants.js'),
      'exports.PHASE_DEVELOPMENT_SERVER = "phase-development-server";'
    );
    await write(
      join(root, 'node_modules/next/dist/server/config.js'),
      `
      const { pathToFileURL } = require('url');
      const { join } = require('path');
      exports.default = async (phase, dir, ...options) => {
        if (phase !== 'phase-development-server' || dir !== process.cwd() || options.length) throw new Error('wrong loader arguments');
        const { default: config } = await import(pathToFileURL(join(dir, 'next.config.mjs')).href);
        return { basePath: '', pageExtensions: ['tsx', 'ts', 'jsx', 'js'], ...await (typeof config === 'function' ? config(phase) : config) };
      };
    `
    );
    await write(
      join(
        root,
        'node_modules/next/dist/build/analysis/get-page-static-info.js'
      ),
      `exports.getPageStaticInfo = async () => ({});`
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true, maxRetries: 10 });
  });

  it('uses the project runtime, development phase, cwd, and effective environment', async () => {
    await write(
      join(cwd, 'next.config.mjs'),
      `
      console.log('config output does not corrupt IPC');
      export default async phase => {
        await Promise.resolve();
        return { basePath: phase === 'phase-development-server' && process.env.NODE_ENV === 'development' ? process.env.TEST_BASE_PATH : '/wrong', pageExtensions: ['api.ts'] };
      };
    `
    );
    const env = Object.freeze({
      ...process.env,
      NODE_ENV: undefined,
      TEST_BASE_PATH: '/docs',
    });
    expect(await loadNextDevRoutingConfig(cwd, env)).toEqual({
      basePath: '/docs',
      pageExtensions: ['api.ts'],
      trailingSlash: false,
      skipTrailingSlashRedirect: false,
      caseSensitiveRoutes: false,
    });
    expect(env.NODE_ENV).toBeUndefined();
  });

  it('uses defaults returned by Next for an empty config', async () => {
    await write(join(cwd, 'next.config.mjs'), 'export default {};');
    expect(await loadNextDevRoutingConfig(cwd, process.env)).toEqual({
      basePath: '',
      pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
      trailingSlash: false,
      skipTrailingSlashRedirect: false,
      caseSensitiveRoutes: false,
    });
  });

  it.each([
    [{}, false, false, false],
    [{ trailingSlash: true }, true, false, false],
    [{ trailingSlash: false }, false, false, false],
    [
      { trailingSlash: true, skipTrailingSlashRedirect: true },
      true,
      true,
      false,
    ],
    [
      { trailingSlash: false, skipTrailingSlashRedirect: true },
      false,
      true,
      false,
    ],
    [
      { trailingSlash: null, skipTrailingSlashRedirect: 'true' },
      false,
      false,
      false,
    ],
    [
      { trailingSlash: true, experimental: { caseSensitiveRoutes: true } },
      true,
      false,
      true,
    ],
  ])('returns normalized redirect flags for installed Next config %j', async (config, trailingSlash, skipTrailingSlashRedirect, caseSensitiveRoutes) => {
    await write(
      join(cwd, 'next.config.mjs'),
      `export default ${JSON.stringify(config)};`
    );
    expect(await loadNextDevRoutingConfig(cwd, process.env)).toMatchObject({
      trailingSlash,
      skipTrailingSlashRedirect,
      caseSensitiveRoutes,
    });
  });

  it('uses installed Next static runtime analysis without importing handlers', async () => {
    await write(
      join(cwd, 'next.config.mjs'),
      'export default { pageExtensions: ["api.ts"] };'
    );
    await write(
      join(cwd, 'app/jobs/route.api.ts'),
      'throw new Error("must not execute handler");'
    );
    await write(
      join(
        root,
        'node_modules/next/dist/build/analysis/get-page-static-info.js'
      ),
      `
      const { join } = require('path');
      exports.getPageStaticInfo = async ({ pageFilePath, nextConfig, isDev, pageType, page }) => {
        if (pageFilePath !== join(process.cwd(), 'app/jobs/route.api.ts') || !isDev || pageType !== 'app' || page !== '/jobs/route' || nextConfig.pageExtensions[0] !== 'api.ts') throw new Error('wrong static analysis arguments');
        return { runtime: process.env.ROUTE_RUNTIME };
      };
      `
    );
    const files = [
      'app/jobs/route.api.ts',
      'app/jobs/helper.api.ts',
      'app/page.api.ts',
      'app/[id]/route.api.ts',
      'app/@slot/route.api.ts',
      'app/(.)intercepted/route.api.ts',
      'src/app/shadowed/route.api.ts',
      'api/other.api.ts',
      'app/excluded/route.ts',
    ];
    expect(
      await loadNextDevRoutingConfig(cwd, { ROUTE_RUNTIME: 'edge' }, files)
    ).toEqual({
      basePath: '',
      pageExtensions: ['api.ts'],
      trailingSlash: false,
      skipTrailingSlashRedirect: false,
      caseSensitiveRoutes: false,
      edgeRuntimeFiles: ['app/jobs/route.api.ts'],
    });
    expect(
      (await loadNextDevRoutingConfig(cwd, { ROUTE_RUNTIME: 'nodejs' }, files))
        .edgeRuntimeFiles
    ).toEqual([]);
  });

  it.each([
    'mjs',
    'cjs',
  ])('reloads %s config dependencies without leaking environment to the host', async extension => {
    await write(
      join(cwd, `settings.${extension}`),
      `${extension === 'mjs' ? 'export default' : 'module.exports ='} '/first';`
    );
    await write(
      join(cwd, 'next.config.mjs'),
      `import basePath from './settings.${extension}'; process.env.VC_NEXT_CONFIG_TEST_LEAK = 'child'; export default { basePath };`
    );
    const previous = process.env.VC_NEXT_CONFIG_TEST_LEAK;
    expect((await loadNextDevRoutingConfig(cwd, process.env)).basePath).toBe(
      '/first'
    );
    await write(
      join(cwd, `settings.${extension}`),
      `${extension === 'mjs' ? 'export default' : 'module.exports ='} '/second';`
    );
    expect((await loadNextDevRoutingConfig(cwd, process.env)).basePath).toBe(
      '/second'
    );
    expect(process.env.VC_NEXT_CONFIG_TEST_LEAK).toBe(previous);
  });

  it('reloads environment inputs and preserves an explicit NODE_ENV', async () => {
    await write(
      join(cwd, 'next.config.mjs'),
      'export default { basePath: "/" + process.env.NODE_ENV + "/" + process.env.RESOURCE };'
    );
    expect(
      (
        await loadNextDevRoutingConfig(cwd, {
          NODE_ENV: 'test',
          RESOURCE: 'first',
        })
      ).basePath
    ).toBe('/test/first');
    expect(
      (
        await loadNextDevRoutingConfig(cwd, {
          NODE_ENV: 'test',
          RESOURCE: 'second',
        })
      ).basePath
    ).toBe('/test/second');
  });

  it('does not guess another loader export or directly import the config', async () => {
    await write(join(cwd, 'next.config.mjs'), 'export default {};');
    await write(
      join(root, 'node_modules/next/dist/server/config.js'),
      'module.exports = async () => ({basePath: "", pageExtensions: ["ts"]});'
    );
    await expect(
      loadNextDevRoutingConfig(cwd, process.env)
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_CONFIG',
    });
  });

  it.each([
    'throw new Error("secret credential");',
    'export default { basePath: false };',
    'export default { pageExtensions: [] };',
    'export default { pageExtensions: [123] };',
    'export default { pageExtensions: [""] };',
  ])('fails clearly without leaking config output: %s', async config => {
    await write(join(cwd, 'next.config.mjs'), config);
    await expect(
      loadNextDevRoutingConfig(cwd, process.env)
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_CONFIG',
      message: expect.stringContaining('next dev can load next.config.*'),
    });
    await expect(
      loadNextDevRoutingConfig(cwd, process.env)
    ).rejects.not.toThrow('secret credential');
  });

  it('requires a project-installed Next runtime', async () => {
    await rm(join(root, 'node_modules'), { recursive: true, maxRetries: 10 });
    await expect(
      // pnpm's Vitest launcher adds workspace dependencies to NODE_PATH.
      loadNextDevRoutingConfig(cwd, { ...process.env, NODE_PATH: undefined })
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_CONFIG',
    });
  });

  it('diagnoses Node spawn failures', async () => {
    vi.stubEnv('VERCEL_NODE_EXEC_PATH', join(root, 'missing-node'));
    await expect(
      loadNextDevRoutingConfig(cwd, process.env)
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_CONFIG',
    });
  });

  it('bounds configuration loading time', async () => {
    await write(
      join(cwd, 'next.config.mjs'),
      'export default new Promise(() => { setInterval(() => {}, 1000); });'
    );
    vi.useFakeTimers();
    const result = expect(
      loadNextDevRoutingConfig(cwd, process.env)
    ).rejects.toMatchObject({
      code: 'NEXT_DEV_MANIFEST_CONFIG',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it('exports a working bundled hook using the native host Node execution contract', async () => {
    const builder = require('../../dist');
    const { getDevManifest } = builder as {
      getDevManifest: GetDevManifest;
    };
    expect(getDevManifest).toBeTypeOf('function');
    expect(builder).not.toHaveProperty('getDevQueueSubscriptions');
    expect(builder).not.toHaveProperty('getDevSchedules');
    vi.stubEnv('VERCEL_VC_NATIVE', '1');
    vi.stubEnv('VERCEL_NODE_EXEC_PATH', process.execPath);
    await write(
      join(cwd, 'next.config.mjs'),
      'export default { basePath: process.env.BASE_PATH, pageExtensions: ["api.ts"], trailingSlash: true };'
    );
    const pattern = 'app/api/jobs/route.*';
    expect(
      await getDevManifest({
        workPath: cwd,
        build: { src: 'package.json', use: '@vercel/next' },
        files: ['app/api/jobs/route.api.ts'],
        config: {
          functions: {
            [pattern]: {
              experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
            },
          },
        },
        env: { BASE_PATH: '/built' },
      })
    ).toMatchObject({
      functions: [
        {
          outputPath: 'built/api/jobs',
          sourceFile: 'app/api/jobs/route.api.ts',
          invocation: { type: 'http', pathname: '/built/api/jobs/' },
          experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
        },
      ],
      matchedFunctionPatterns: [pattern],
    });
  });
});
