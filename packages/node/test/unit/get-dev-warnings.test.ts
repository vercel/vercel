import { afterEach, describe, expect, test, vi } from 'vitest';
import { getDevWarnings } from '../../src/get-dev-warnings';
import {
  MIDDLEWARE_NODEJS_DEFAULT_ENV,
  MIDDLEWARE_NODEJS_DEFAULT_SINCE,
} from '../../src/utils';
import { prepareFilesystem } from './test-utils';

afterEach(() => vi.unstubAllEnvs());

describe('getDevWarnings', () => {
  const newProject = MIDDLEWARE_NODEJS_DEFAULT_SINCE.getTime();

  test.each([
    { name: 'default edge middleware', warns: true },
    { name: 'explicit edge middleware', runtime: 'edge', warns: true },
    { name: 'Node.js middleware', runtime: 'nodejs', warns: false },
    {
      name: 'new project defaults to Node.js',
      projectCreatedAt: newProject,
      warns: false,
    },
    {
      name: 'explicit proxy entrypoint',
      middlewareRuntime: 'nodejs' as const,
      warns: false,
    },
    {
      name: 'shell environment opts a new project into edge',
      projectCreatedAt: newProject,
      shellEnv: '0',
      warns: true,
    },
    {
      name: 'runtime environment overrides the shell environment',
      projectCreatedAt: newProject,
      shellEnv: '0',
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      warns: false,
    },
    {
      name: 'build environment overrides the runtime environment',
      projectCreatedAt: newProject,
      env: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '1' },
      buildEnv: { [MIDDLEWARE_NODEJS_DEFAULT_ENV]: '0' },
      warns: true,
    },
  ])('$name warns: $warns', async ({
    runtime,
    middlewareRuntime,
    projectCreatedAt,
    shellEnv,
    env,
    buildEnv,
    warns,
  }) => {
    vi.stubEnv(MIDDLEWARE_NODEJS_DEFAULT_ENV, shellEnv);
    const filesystem = await prepareFilesystem({
      'middleware.js': `
        ${runtime ? `export const config = { runtime: '${runtime}' };` : ''}
        throw new Error('Middleware must not execute during startup');
        export default () => new Response('middleware');
      `,
    });

    const warnings = await getDevWarnings({
      ...filesystem,
      entrypoint: 'middleware.js',
      config: {
        middleware: true,
        middlewareRuntime,
        projectSettings: { createdAt: projectCreatedAt },
      },
      meta: { env, buildEnv },
    });

    expect(warnings).toHaveLength(warns ? 1 : 0);
    if (warns) {
      expect(warnings[0]).toMatch(
        /^middleware\.js uses the deprecated "edge" runtime\./
      );
      expect(warnings[0]).toContain("const config = { runtime: 'nodejs' }");
      expect(warnings[0]).not.toContain('\x1b');
    }
  });

  test('skips ordinary functions without reading their entrypoint', async () => {
    expect(
      await getDevWarnings({
        files: {},
        workPath: process.cwd(),
        entrypoint: 'nonexistent-function.js',
        config: {},
      })
    ).toEqual([]);
  });

  test('rejects an unsupported runtime without returning a warning', async () => {
    const filesystem = await prepareFilesystem({
      'middleware.js': `export const config = { runtime: 'invalid' };`,
    });

    await expect(
      getDevWarnings({
        ...filesystem,
        entrypoint: 'middleware.js',
        config: { middleware: true },
      })
    ).rejects.toThrow('unsupported "runtime" value');
  });
});
