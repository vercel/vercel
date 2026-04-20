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
      // Framework-prefixed vars use relative paths to avoid CORS issues
      VITE_FRONTEND_URL: '/',
      VITE_BACKEND_URL: '/_/backend',
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

  it('uses preview subdomain prefixes for custom preview suffixes', () => {
    const result = getServiceUrlEnvVars({
      services: [
        createService({
          name: 'api',
          type: 'web',
          routePrefix: '/_/api',
          subdomain: 'api',
        }),
      ],
      frameworkList: [{ slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' }],
      deploymentUrl: 'project-git-main.preview.example.com',
    });

    expect(result).toEqual({
      API_URL: 'https://api---project-git-main.preview.example.com',
    });
  });

  it('keeps backing-path URLs on public preview suffixes', () => {
    const result = getServiceUrlEnvVars({
      services: [
        createService({
          name: 'api',
          type: 'web',
          routePrefix: '/_/api',
          subdomain: 'api',
        }),
      ],
      frameworkList: [{ slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' }],
      deploymentUrl: 'project-git-main.vercel.app',
    });

    expect(result).toEqual({
      API_URL: 'https://project-git-main.vercel.app/_/api',
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
    // Framework-prefixed var uses relative path
    expect(result).toEqual({
      VITE_BACKEND_URL: '/_/backend',
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

  describe('origin mode', () => {
    it('generates absolute URLs using origin', () => {
      const result = getServiceUrlEnvVars({
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
      const result = getServiceUrlEnvVars({
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
        frameworkList: [{ slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' }],
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
        origin: 'http://localhost:3000',
      });

      expect(result).toEqual({
        VITE_BACKEND_URL: '/_/backend',
      });
    });

    it('returns empty object when neither origin nor deploymentUrl provided', () => {
      const result = getServiceUrlEnvVars({
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
  });

  describe('envPrefix', () => {
    it('prefixes all generated env vars for services when envPrefix is set', () => {
      const result = getServiceUrlEnvVars({
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
        frameworkList: [{ slug: 'nextjs', envPrefix: 'NEXT_PUBLIC_' }],
        deploymentUrl: 'my-app.vercel.app',
        envPrefix: 'TEST_',
      });

      expect(result).toEqual({
        TEST_FRONTEND_URL: 'https://my-app.vercel.app',
        TEST_API_URL: 'https://my-app.vercel.app/_/api',
        NEXT_PUBLIC_TEST_FRONTEND_URL: '/',
        NEXT_PUBLIC_TEST_API_URL: '/_/api',
      });
    });

    it('does not prefix when envPrefix is not set', () => {
      const result = getServiceUrlEnvVars({
        services: [
          createService({
            name: 'frontend',
            type: 'web',
            routePrefix: '/',
          }),
        ],
        frameworkList: [],
        deploymentUrl: 'my-app.vercel.app',
      });

      expect(result).toEqual({
        FRONTEND_URL: 'https://my-app.vercel.app',
      });
    });

    it('respects currentEnv with prefixed names', () => {
      const result = getServiceUrlEnvVars({
        services: [
          createService({
            name: 'frontend',
            type: 'web',
            routePrefix: '/',
          }),
        ],
        frameworkList: [],
        origin: 'http://localhost:3000',
        currentEnv: {
          TEST_FRONTEND_URL: 'https://custom.com',
        },
        envPrefix: 'TEST_',
      });

      expect(result).toEqual({});
    });

    it('works with origin mode', () => {
      const result = getServiceUrlEnvVars({
        services: [
          createService({
            name: 'backend',
            type: 'web',
            routePrefix: '/_/backend',
          }),
        ],
        frameworkList: [],
        origin: 'http://localhost:3000',
        envPrefix: 'TEST_',
      });

      expect(result).toEqual({
        TEST_BACKEND_URL: 'http://localhost:3000/_/backend',
      });
    });
  });
});
