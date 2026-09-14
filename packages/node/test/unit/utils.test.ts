import { describe, expect, test } from 'vitest';
import {
  entrypointToOutputPath,
  MIDDLEWARE_NODEJS_DEFAULT_ENV,
  MIDDLEWARE_NODEJS_DEFAULT_SINCE,
  resolveMiddlewareRuntime,
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
