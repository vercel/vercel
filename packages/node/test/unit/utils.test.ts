import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  entrypointToOutputPath,
  MIDDLEWARE_NODEJS_DEFAULT_ENV,
  MIDDLEWARE_NODEJS_DEFAULT_SINCE,
  resolveMiddlewareRuntime,
  resolvePublicFilePath,
} from '../../src/utils';

describe('entrypointToOutputPath()', () => {
  test.each([
    { entrypoint: 'api/foo.js', zeroConfig: false, expected: 'api/foo.js' },
    { entrypoint: 'api/foo.ts', zeroConfig: false, expected: 'api/foo.ts' },
    { entrypoint: 'api/foo.tsx', zeroConfig: false, expected: 'api/foo.tsx' },
    { entrypoint: 'api/foo.mts', zeroConfig: false, expected: 'api/foo.mts' },
    { entrypoint: 'api/foo.js', zeroConfig: true, expected: 'api/foo' },
    { entrypoint: 'api/foo.ts', zeroConfig: true, expected: 'api/foo' },
    { entrypoint: 'api/foo.tsx', zeroConfig: true, expected: 'api/foo' },
    { entrypoint: 'api/foo.mts', zeroConfig: true, expected: 'api/foo' },
  ])('entrypoint="$entrypoint" zeroConfig=$zeroConfig -> $expected', ({
    entrypoint,
    zeroConfig,
    expected,
  }) => {
    expect(entrypointToOutputPath(entrypoint, zeroConfig)).toEqual(expected);
  });
});

describe('resolveMiddlewareRuntime()', () => {
  const after = MIDDLEWARE_NODEJS_DEFAULT_SINCE.getTime();
  const before = after - 1;

  test.each([
    { name: 'no signals', expected: 'edge', reason: 'default' },
    {
      name: 'new project, flag off',
      projectCreatedAt: after,
      expected: 'edge',
      reason: 'default',
    },
    {
      name: 'new project, flag on',
      projectCreatedAt: after,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      expected: 'nodejs',
      reason: 'project creation date',
    },
    {
      name: 'existing project, flag on',
      projectCreatedAt: before,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      expected: 'edge',
      reason: 'default',
    },
    {
      name: 'new project in dev, no flag',
      projectCreatedAt: after,
      isDev: true,
      expected: 'nodejs',
      reason: 'project creation date',
    },
    {
      name: 'existing project in dev',
      projectCreatedAt: before,
      isDev: true,
      expected: 'edge',
      reason: 'default',
    },
    {
      name: 'unlinked project in dev',
      isDev: true,
      expected: 'edge',
      reason: 'default',
    },
    {
      name: 'opt out via env var',
      projectCreatedAt: after,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '0' },
      expected: 'edge',
      reason: `${MIDDLEWARE_NODEJS_DEFAULT_ENV}=0`,
    },
    {
      name: 'opt out via env var in dev',
      projectCreatedAt: after,
      isDev: true,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '0' },
      expected: 'edge',
      reason: `${MIDDLEWARE_NODEJS_DEFAULT_ENV}=0`,
    },
    {
      name: 'explicit "edge" beats the default',
      configuredRuntime: 'edge',
      projectCreatedAt: after,
      isDev: true,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      expected: 'edge',
      reason: 'config.runtime',
    },
    {
      name: 'explicit "experimental-edge" beats the default',
      configuredRuntime: 'experimental-edge',
      projectCreatedAt: after,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      expected: 'edge',
      reason: 'config.runtime',
    },
    {
      name: 'explicit "nodejs" on an existing project',
      configuredRuntime: 'nodejs',
      projectCreatedAt: before,
      expected: 'nodejs',
      reason: 'config.runtime',
    },
    {
      name: 'proxy entrypoint on an existing project',
      middlewareRuntime: 'nodejs' as const,
      projectCreatedAt: before,
      expected: 'nodejs',
      reason: 'proxy entrypoint',
    },
  ])('$name -> $expected', ({
    configuredRuntime,
    middlewareRuntime,
    projectCreatedAt,
    isDev,
    env = {},
    expected,
    reason,
  }) => {
    expect(
      resolveMiddlewareRuntime({
        configuredRuntime,
        middlewareRuntime,
        projectCreatedAt,
        isDev,
        env,
      })
    ).toEqual({ runtime: expected, reason });
  });
});

describe('resolvePublicFilePath()', () => {
  const rootDir = realpathSync(
    mkdtempSync(join(tmpdir(), 'vercel-node-public-'))
  );
  const publicDir = join(rootDir, 'public');
  mkdirSync(join(publicDir, 'nested'), { recursive: true });
  writeFileSync(join(publicDir, 'hello.txt'), 'hello');
  writeFileSync(join(publicDir, 'my file.txt'), 'spaced');
  writeFileSync(join(publicDir, 'nested', 'app.js'), 'console.log(1);');
  writeFileSync(join(rootDir, 'secret.txt'), 'top-secret');
  symlinkSync(join(rootDir, 'secret.txt'), join(publicDir, 'leak.txt'));

  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test('resolves a regular file inside publicDir', async () => {
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/hello.txt')
    ).resolves.toBe(join(publicDir, 'hello.txt'));
  });

  test('strips query strings and decodes URL-encoded characters', async () => {
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/hello.txt?v=123')
    ).resolves.toBe(join(publicDir, 'hello.txt'));

    await expect(
      resolvePublicFilePath(rootDir, 'public', '/my%20file.txt?dl=1')
    ).resolves.toBe(join(publicDir, 'my file.txt'));
  });

  test('blocks path traversal attempts', async () => {
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/../secret.txt')
    ).resolves.toBeNull();

    await expect(
      resolvePublicFilePath(rootDir, 'public', '/%2e%2e/secret.txt')
    ).resolves.toBeNull();

    await expect(
      resolvePublicFilePath(rootDir, 'public', '/nested/../../secret.txt')
    ).resolves.toBeNull();
  });

  test('blocks symlink escapes outside publicDir', async () => {
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/leak.txt')
    ).resolves.toBeNull();
  });

  test('returns null for directories, root, missing files, and null bytes', async () => {
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/')
    ).resolves.toBeNull();
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/nested')
    ).resolves.toBeNull();
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/missing.txt')
    ).resolves.toBeNull();
    await expect(
      resolvePublicFilePath(rootDir, 'public', '/hello.txt%00.png')
    ).resolves.toBeNull();
  });
});
