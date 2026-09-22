import { join } from 'path';
import { expect, test } from 'vitest';
import { detectBuildersWithServices } from '../../src/detect-builders-with-services';

const workPath = join(__dirname, '../fixtures/services-python-cron');

test('builds V1 services with their builders and routes', async () => {
  const { builders, defaultRoutes, errors, rewriteRoutes, services } =
    await detectBuildersWithServices([], undefined, {
      experimentalServices: {
        web: {
          framework: 'fastapi',
          entrypoint: 'server.py',
          routePrefix: '/',
        },
        cleanup: {
          type: 'job',
          trigger: 'schedule',
          entrypoint: 'jobs/cleanup.py',
          schedule: '0 0 * * *',
        },
      },
      projectSettings: { framework: null },
      workPath,
    });

  expect(errors).toBeNull();
  expect(services).toHaveLength(2);
  expect(builders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: 'server.py', use: '@vercel/python' }),
      expect.objectContaining({
        src: 'jobs/cleanup.py',
        use: '@vercel/python',
      }),
    ])
  );
  expect(defaultRoutes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ dest: '/_svc/web/index', check: true }),
    ])
  );
  expect(rewriteRoutes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '^/_svc/cleanup/crons/.*$',
        dest: '/_svc/cleanup/index',
        check: true,
      }),
    ])
  );
});

test('preserves disabled implicit environment injection for canonical services', async () => {
  const { errors, useImplicitEnvInjection } = await detectBuildersWithServices(
    [],
    undefined,
    {
      services: {
        web: {
          root: '.',
          runtime: 'python',
          entrypoint: 'server.py',
          rewrites: [{ source: '/(.*)', destination: '/$1' }],
        },
      },
      projectSettings: { framework: null },
      workPath,
    }
  );

  expect(errors).toBeNull();
  expect(useImplicitEnvInjection).toBe(false);
});

test('returns MISSING_SERVICES when the services framework has no configuration', async () => {
  const { builders, errors } = await detectBuildersWithServices(
    ['package.json'],
    undefined,
    { projectSettings: { framework: 'services' } }
  );

  expect(builders).toBeNull();
  expect(errors).toEqual([
    expect.objectContaining({ code: 'MISSING_SERVICES' }),
  ]);
});

test('prepends the proxy builder to service builders', async () => {
  const { builders, errors } = await detectBuildersWithServices(
    ['proxy.ts'],
    undefined,
    {
      services: {
        web: { root: '.', runtime: 'python', entrypoint: 'server.py' },
      },
      proxy: { entrypoint: 'proxy.ts' },
      projectSettings: { framework: 'services' },
      workPath,
    }
  );

  expect(errors).toBeNull();
  expect(builders?.[0]).toEqual({
    src: 'proxy.ts',
    use: '@vercel/node',
    config: {
      zeroConfig: true,
      middleware: true,
      middlewareRuntime: 'nodejs',
    },
  });
});

test('builds services configured through the V2 alias', async () => {
  const { builders, errors, services } = await detectBuildersWithServices(
    [],
    undefined,
    {
      experimentalServicesV2: {
        web: { root: '.', runtime: 'python', entrypoint: 'server.py' },
      },
      projectSettings: { framework: null },
      workPath,
    }
  );

  expect(errors).toBeNull();
  expect(services).toEqual([
    expect.objectContaining({
      name: 'web',
      schema: 'experimentalServicesV2',
    }),
  ]);
  expect(builders).toEqual([
    expect.objectContaining({ src: 'server.py', use: '@vercel/python' }),
  ]);
});

test('warns when api files are not covered by a service', async () => {
  const { warnings } = await detectBuildersWithServices(
    ['api/index.py'],
    undefined,
    {
      experimentalServices: {
        web: {
          framework: 'fastapi',
          entrypoint: 'server.py',
          routePrefix: '/',
        },
      },
      projectSettings: { framework: null },
      workPath,
    }
  );

  expect(warnings).toEqual([
    expect.objectContaining({ code: 'api_dir_ignored' }),
  ]);
});

test('does not warn when a service covers the api directory', async () => {
  const { warnings } = await detectBuildersWithServices(
    ['api/index.py'],
    undefined,
    {
      experimentalServices: {
        api: { entrypoint: 'api/index.py', routePrefix: '/api' },
      },
      projectSettings: { framework: null },
      workPath,
    }
  );

  expect(warnings.every(warning => warning.code !== 'api_dir_ignored')).toBe(
    true
  );
});
