import { getServiceUrlEnvVars, getExperimentalServiceUrlEnvVars } from '../src';
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
      requestedEnv: {},
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
          NEXT_PUBLIC_API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          API_BASE_URL: { type: 'service-ref', service: 'api' },
          NEXT_PUBLIC_API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          DASHBOARD_URL: { type: 'service-ref', service: 'frontend' },
          NEXT_PUBLIC_DASHBOARD_URL: {
            type: 'service-ref',
            service: 'frontend',
          },
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
          API_URL: { type: 'service-ref', service: 'api' },
          NEXT_PUBLIC_API_URL: { type: 'service-ref', service: 'api' },
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
          VITE_API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          NEXT_PUBLIC_: { type: 'service-ref', service: 'api' },
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
          SITE_URL: { type: 'service-ref', service: 'site' },
          VITE_SITE_URL: { type: 'service-ref', service: 'site' },
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
          API_BASE_URL: { type: 'service-ref', service: 'api' },
          NEXT_PUBLIC_API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          API_BASE_URL: { type: 'service-ref', service: 'api' },
          NEXT_PUBLIC_API_BASE_URL: { type: 'service-ref', service: 'api' },
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
          API_URL: { type: 'service-ref', service: 'api' },
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
          API_URL: { type: 'service-ref', service: 'missing' },
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
          WORKER_URL: { type: 'service-ref', service: 'worker' },
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

describe('getExperimentalServiceUrlEnvVars', () => {
  it('generates service URLs for web services', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'frontend',
          type: 'web',
          routePrefix: '/',
          framework: 'vite',
        }),
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
        }),
      ],
      frameworkList: [VITE],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      FRONTEND_URL: 'https://my-app.vercel.app',
      BACKEND_URL: 'https://my-app.vercel.app/_/backend',
      // Framework-prefixed vars use relative paths to avoid CORS issues
      VITE_FRONTEND_URL: '/',
      VITE_BACKEND_URL: '/_/backend',
    });
  });

  it('converts service names with hyphens to underscores', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'api-users',
          type: 'web',
          routePrefix: '/_/api-users',
        }),
      ],
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      API_USERS_URL: 'https://my-app.vercel.app/_/api-users',
    });
  });

  it('generates prefixed env vars for all frontend frameworks in deployment', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'web',
          type: 'web',
          routePrefix: '/',
          framework: 'nextjs',
        }),
        createService({
          name: 'admin',
          type: 'web',
          routePrefix: '/admin',
          framework: 'vite',
        }),
        createService({
          name: 'api',
          type: 'web',
          routePrefix: '/_/api',
        }),
      ],
      frameworkList: [NEXTJS, VITE],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      WEB_URL: 'https://my-app.vercel.app',
      ADMIN_URL: 'https://my-app.vercel.app/admin',
      API_URL: 'https://my-app.vercel.app/_/api',
      // Framework-prefixed vars use relative paths to avoid CORS issues
      NEXT_PUBLIC_WEB_URL: '/',
      NEXT_PUBLIC_ADMIN_URL: '/admin',
      NEXT_PUBLIC_API_URL: '/_/api',
      VITE_WEB_URL: '/',
      VITE_ADMIN_URL: '/admin',
      VITE_API_URL: '/_/api',
    });
  });

  it('does not overwrite existing env vars', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
          framework: 'vite',
        }),
      ],
      frameworkList: [VITE],
      currentEnv: {
        BACKEND_URL: 'https://custom-backend.com',
      },
      deploymentUrl: 'my-app.vercel.app',
    });

    // BACKEND_URL is not in result because it already exists.
    // Framework-prefixed var uses relative path.
    expect(result).toEqual({
      VITE_BACKEND_URL: '/_/backend',
    });
  });

  it('does not overwrite existing prefixed env vars', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
          framework: 'vite',
        }),
      ],
      frameworkList: [VITE],
      currentEnv: {
        VITE_BACKEND_URL: 'https://custom-backend.com',
      },
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      BACKEND_URL: 'https://my-app.vercel.app/_/backend',
    });
  });

  it('skips non-web services', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'web',
          type: 'web',
          routePrefix: '/',
        }),
        createService({
          name: 'worker',
          type: 'worker',
          routePrefix: undefined,
        }),
      ],
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      WEB_URL: 'https://my-app.vercel.app',
    });
  });

  it('returns empty object when no deploymentUrl or origin is provided', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
        }),
      ],
      frameworkList: [],
    });

    expect(result).toEqual({});
  });

  it('returns empty object when no services are provided', () => {
    const result = getExperimentalServiceUrlEnvVars({
      services: [],
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({});
  });

  describe('origin mode', () => {
    it('generates absolute URLs using origin', () => {
      const result = getExperimentalServiceUrlEnvVars({
        services: [
          createService({
            name: 'frontend',
            type: 'web',
            routePrefix: '/',
          }),
          createService({
            name: 'backend',
            type: 'web',
            routePrefix: '/_/backend',
          }),
        ],
        frameworkList: [],
        origin: 'http://localhost:3000',
      });

      expect(result).toEqual({
        FRONTEND_URL: 'http://localhost:3000',
        BACKEND_URL: 'http://localhost:3000/_/backend',
      });
    });

    it('generates framework-prefixed vars with relative paths', () => {
      const result = getExperimentalServiceUrlEnvVars({
        services: [
          createService({
            name: 'frontend',
            type: 'web',
            routePrefix: '/',
            framework: 'nextjs',
          }),
          createService({
            name: 'api',
            type: 'web',
            routePrefix: '/_/api',
          }),
        ],
        frameworkList: [NEXTJS],
        origin: 'http://localhost:3000',
      });

      expect(result).toEqual({
        FRONTEND_URL: 'http://localhost:3000',
        API_URL: 'http://localhost:3000/_/api',
        NEXT_PUBLIC_FRONTEND_URL: '/',
        NEXT_PUBLIC_API_URL: '/_/api',
      });
    });

    it('does not overwrite existing env vars', () => {
      const result = getExperimentalServiceUrlEnvVars({
        services: [
          createService({
            name: 'backend',
            type: 'web',
            routePrefix: '/_/backend',
            framework: 'vite',
          }),
        ],
        frameworkList: [VITE],
        currentEnv: {
          BACKEND_URL: 'https://custom-backend.com',
        },
        origin: 'http://localhost:3000',
      });

      expect(result).toEqual({
        VITE_BACKEND_URL: '/_/backend',
      });
    });
  });
});
