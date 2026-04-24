import { resolveServiceEnvVars } from '../src';
import type { Service } from '../src';
import { describe, expect, it } from 'vitest';

const createService = (overrides: Partial<Service>): Service => ({
  name: 'test',
  type: 'web',
  workspace: '.',
  routePrefix: '/',
  builder: { use: '@vercel/static-build', src: 'package.json' },
  ...overrides,
});

describe('resolveServiceEnvVars', () => {
  it('returns empty when the consumer has no envVars', () => {
    const services = [
      createService({ name: 'frontend', routePrefix: '/' }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });

  it('emits absolute URLs by default', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        envVars: {
          API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('emits the route prefix when relative is true', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        envVars: {
          NEXT_PUBLIC_API_BASE_URL: {
            ref: { service: 'api' },
            relative: true,
          },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      NEXT_PUBLIC_API_BASE_URL: '/api',
    });
  });

  it('lets a single service declare both absolute and relative forms explicitly', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        envVars: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: {
            ref: { service: 'api' },
            relative: true,
          },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
      NEXT_PUBLIC_API_BASE_URL: '/api',
    });
  });

  it('treats relative: false the same as omitting the flag', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          API_BASE_URL: { ref: { service: 'api' }, relative: false },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('resolves to "/" and the bare URL for a root-mounted target service', () => {
    const services = [
      createService({
        name: 'admin',
        routePrefix: '/admin',
        envVars: {
          SITE_URL: { ref: { service: 'site' } },
          SITE_PATH: { ref: { service: 'site' }, relative: true },
        },
      }),
      createService({ name: 'site', routePrefix: '/' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      SITE_URL: 'https://my-app.vercel.app',
      SITE_PATH: '/',
    });
  });

  it('user-set names override the resolved values', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: {
            ref: { service: 'api' },
            relative: true,
          },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
      currentEnv: {
        NEXT_PUBLIC_API_BASE_URL: 'https://user-override.example',
      },
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('uses origin in dev mode', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: {
            ref: { service: 'api' },
            relative: true,
          },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      origin: 'http://localhost:3000',
    });
    expect(result).toEqual({
      API_BASE_URL: 'http://localhost:3000/api',
      NEXT_PUBLIC_API_BASE_URL: '/api',
    });
  });

  it('returns empty when neither origin nor deploymentUrl is provided', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          API_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
    });
    expect(result).toEqual({});
  });

  it('defensively skips unknown refs (validation happens upstream)', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          API_URL: { ref: { service: 'missing' } },
        },
      }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });

  it('defensively skips non-web refs', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        envVars: {
          WORKER_URL: { ref: { service: 'worker' } },
        },
      }),
      createService({ name: 'worker', type: 'worker', routePrefix: undefined }),
    ];
    const result = resolveServiceEnvVars({
      targetService: services[0],
      services,
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });
});
