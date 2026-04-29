import { getServiceUrlEnvVars } from '../src';
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

const NEXTJS = { slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' };
const VITE = { slug: 'vite', envPrefix: 'VITE_' };
const FASTAPI = { slug: 'fastapi' };

describe('getServiceUrlEnvVars', () => {
  it('returns empty when the consumer has no env', () => {
    const services = [
      createService({ name: 'frontend', routePrefix: '/' }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS, FASTAPI],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });

  it('emits relative paths for names that match the consumer framework prefix', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          NEXT_PUBLIC_API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      NEXT_PUBLIC_API_BASE_URL: '/api',
    });
  });

  it('emits absolute URLs for names without the consumer framework prefix', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('lets a single consumer mix prefixed and unprefixed declarations', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_BASE_URL: 'https://my-app.vercel.app/api',
      NEXT_PUBLIC_API_BASE_URL: '/api',
    });
  });

  it('emits absolute URLs for consumer frameworks without a public prefix', () => {
    const services = [
      createService({
        name: 'api',
        routePrefix: '/api',
        framework: 'fastapi',
        env: {
          DASHBOARD_URL: { ref: { service: 'frontend' } },
          NEXT_PUBLIC_DASHBOARD_URL: { ref: { service: 'frontend' } },
        },
      }),
      createService({ name: 'frontend', routePrefix: '/' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [FASTAPI, NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    // Backend services have no envPrefix, so EVERY name resolves to the
    // absolute URL regardless of how it's spelled.
    expect(result).toEqual({
      DASHBOARD_URL: 'https://my-app.vercel.app',
      NEXT_PUBLIC_DASHBOARD_URL: 'https://my-app.vercel.app',
    });
  });

  it('emits absolute URLs when the consumer service has no framework', () => {
    const services = [
      createService({
        name: 'consumer',
        routePrefix: '/svc',
        env: {
          API_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      API_URL: 'https://my-app.vercel.app/api',
      NEXT_PUBLIC_API_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('only matches the consumer framework prefix, not other framework prefixes', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          // Different framework's prefix — should NOT trigger relative
          // resolution in a Next.js consumer.
          VITE_API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS, VITE],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      VITE_API_BASE_URL: 'https://my-app.vercel.app/api',
    });
  });

  it('treats a name equal to the prefix itself as not matching (no useful suffix)', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          NEXT_PUBLIC_: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      NEXT_PUBLIC_: 'https://my-app.vercel.app/api',
    });
  });

  it('resolves to "/" and the bare URL for a root-mounted target service', () => {
    const services = [
      createService({
        name: 'admin',
        routePrefix: '/admin',
        framework: 'vite',
        env: {
          SITE_URL: { ref: { service: 'site' } },
          VITE_SITE_URL: { ref: { service: 'site' } },
        },
      }),
      createService({ name: 'site', routePrefix: '/' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [VITE],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({
      SITE_URL: 'https://my-app.vercel.app',
      VITE_SITE_URL: '/',
    });
  });

  it('user-set names override the resolved values', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        framework: 'nextjs',
        env: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
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
        framework: 'nextjs',
        env: {
          API_BASE_URL: { ref: { service: 'api' } },
          NEXT_PUBLIC_API_BASE_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [NEXTJS],
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
        env: {
          API_URL: { ref: { service: 'api' } },
        },
      }),
      createService({ name: 'api', routePrefix: '/api' }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [],
    });
    expect(result).toEqual({});
  });

  it('defensively skips unknown refs (validation happens upstream)', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        env: {
          API_URL: { ref: { service: 'missing' } },
        },
      }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });

  it('defensively skips non-web refs', () => {
    const services = [
      createService({
        name: 'frontend',
        routePrefix: '/',
        env: {
          WORKER_URL: { ref: { service: 'worker' } },
        },
      }),
      createService({ name: 'worker', type: 'worker', routePrefix: undefined }),
    ];
    const result = getServiceUrlEnvVars({
      requestedEnv: services[0].env ?? {},
      consumerService: services[0],
      services,
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });
    expect(result).toEqual({});
  });
});
