import { describe, expect, it } from 'vitest';
import type { Service } from '../src';
import { getServiceUrlEnvVars } from '../src';

const createService = (overrides: Partial<Service>): Service => ({
  name: 'test',
  type: 'web',
  workspace: '.',
  routePrefix: '/',
  builder: { use: '@vercel/static-build', src: 'package.json' },
  ...overrides,
});

describe('getServiceUrlEnvVars', () => {
  it('generates service URLs for web services', () => {
    const result = getServiceUrlEnvVars({
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
      frameworkList: [{ slug: 'vite', envPrefix: 'VITE_' }],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      FRONTEND_URL: 'https://my-app.vercel.app',
      BACKEND_URL: 'https://my-app.vercel.app/_/backend',
      VITE_FRONTEND_URL: 'https://my-app.vercel.app',
      VITE_BACKEND_URL: 'https://my-app.vercel.app/_/backend',
    });
  });

  it('converts service names with hyphens to underscores', () => {
    const result = getServiceUrlEnvVars({
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
    const result = getServiceUrlEnvVars({
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
      frameworkList: [
        { slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' },
        { slug: 'vite', envPrefix: 'VITE_' },
      ],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      WEB_URL: 'https://my-app.vercel.app',
      ADMIN_URL: 'https://my-app.vercel.app/admin',
      API_URL: 'https://my-app.vercel.app/_/api',
      // Both prefixes applied to all services
      NEXT_PUBLIC_WEB_URL: 'https://my-app.vercel.app',
      NEXT_PUBLIC_ADMIN_URL: 'https://my-app.vercel.app/admin',
      NEXT_PUBLIC_API_URL: 'https://my-app.vercel.app/_/api',
      VITE_WEB_URL: 'https://my-app.vercel.app',
      VITE_ADMIN_URL: 'https://my-app.vercel.app/admin',
      VITE_API_URL: 'https://my-app.vercel.app/_/api',
    });
  });

  it('does not overwrite existing env vars', () => {
    const result = getServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
          framework: 'vite',
        }),
      ],
      frameworkList: [{ slug: 'vite', envPrefix: 'VITE_' }],
      currentEnv: {
        BACKEND_URL: 'https://custom-backend.com',
      },
      deploymentUrl: 'my-app.vercel.app',
    });

    // BACKEND_URL is not in result because it already exists
    expect(result).toEqual({
      VITE_BACKEND_URL: 'https://my-app.vercel.app/_/backend',
    });
  });

  it('does not overwrite existing prefixed env vars', () => {
    const result = getServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
          framework: 'vite',
        }),
      ],
      frameworkList: [{ slug: 'vite', envPrefix: 'VITE_' }],
      currentEnv: {
        VITE_BACKEND_URL: 'https://custom-backend.com',
      },
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({
      BACKEND_URL: 'https://my-app.vercel.app/_/backend',
    });
  });

  it('returns empty object when no deploymentUrl provided', () => {
    const result = getServiceUrlEnvVars({
      services: [
        createService({
          name: 'backend',
          type: 'web',
          routePrefix: '/_/backend',
        }),
      ],
      frameworkList: [],
      deploymentUrl: undefined,
    });

    expect(result).toEqual({});
  });

  it('returns empty object when no services provided', () => {
    const result = getServiceUrlEnvVars({
      services: [],
      frameworkList: [],
      deploymentUrl: 'my-app.vercel.app',
    });

    expect(result).toEqual({});
  });
});
