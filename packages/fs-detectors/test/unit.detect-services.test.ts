import { detectServices, isStaticBuild, isRouteOwningBuilder } from '../src';
import type { Route } from '@vercel/routing-utils';
import VirtualFilesystem from './virtual-file-system';

/**
 * Simplified route matcher for testing services-generated routes.
 *
 * The real routing engine (dev server `devRouter`) uses PCRE with
 * case-insensitive matching and handle phases. This simplified version
 * is correct for the patterns produced by `generateServicesRoutes`
 * (e.g., `^/admin(?:/.*)?$`) which are plain regex without PCRE
 * extensions, named captures, or `has`/`missing` conditions.
 */
function findMatchingRoute(
  routes: Route[],
  pathname: string
): (Route & { src: string; dest: string }) | undefined {
  for (const route of routes) {
    if ('src' in route && typeof route.src === 'string') {
      const regex = new RegExp(route.src);
      if (regex.test(pathname)) {
        return route as Route & { src: string; dest: string };
      }
    }
  }
  return undefined;
}

describe('detectServices', () => {
  describe('with no vercel.json', () => {
    it('should return auto-detection error when no service found', async () => {
      const fs = new VirtualFilesystem({});
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_CONFIGURED');
    });

    it('should auto-detect a Ruby backend service in backend/', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '15.0.0',
          },
        }),
        'backend/Gemfile': 'source "https://rubygems.org"',
        'backend/config.ru': 'run Sinatra::Application',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(2);

      const backend = result.services.find(s => s.name === 'backend');
      expect(backend).toMatchObject({
        name: 'backend',
        workspace: 'backend',
        framework: 'ruby',
        runtime: 'ruby',
        routePrefix: '/_/backend',
        routePrefixSource: 'generated',
      });

      const backendRoute = findMatchingRoute(
        result.routes.rewrites,
        '/_/backend/ping'
      );
      expect(backendRoute).toMatchObject({
        dest: '/_svc/backend/index',
      });
    });
  });

  describe('with vercel.json without experimentalServices', () => {
    it('should return auto-detection error when no service found', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          buildCommand: 'npm run build',
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_CONFIGURED');
    });
  });

  describe('with experimentalServices', () => {
    it('should detect a single web service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'src/index.ts',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        type: 'web',
        workspace: '.',
        entrypoint: 'src/index.ts',
        routePrefix: '/',
      });
      expect(result.errors).toEqual([]);
      // Routes should be generated for configured services
      expect(result.routes.defaults).toHaveLength(1);
    });

    it('should not confuse entrypoint with workspace when paths share a prefix', async () => {
      // Edge case: workspace is "api" and entrypoint is "api/handler.go"
      // (meaning the file lives at api/api/handler.go in the repo).
      // The entrypoint must always be treated as workspace-relative.
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'my-api': {
              workspace: 'api',
              entrypoint: 'api/handler.go',
              routePrefix: '/api',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.errors).toEqual([]);
      // builder.src should be "api/api/handler.go" (workspace + entrypoint)
      expect(result.services[0].builder.src).toBe('api/api/handler.go');
    });

    it('should detect multiple services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              workspace: 'apps/web',
              framework: 'nextjs',
              routePrefix: '/',
            },
            api: {
              workspace: 'apps/api',
              entrypoint: 'src/server.ts',
              routePrefix: '/api',
            },
            admin: {
              workspace: 'apps/admin',
              entrypoint: 'src/index.ts',
              routePrefix: '/admin',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(3);
      expect(result.errors).toEqual([]);

      const frontend = result.services.find(s => s.name === 'frontend');
      expect(frontend).toMatchObject({
        name: 'frontend',
        type: 'web',
        workspace: 'apps/web',
        framework: 'nextjs',
        routePrefix: '/',
      });

      const api = result.services.find(s => s.name === 'api');
      expect(api).toMatchObject({
        name: 'api',
        type: 'web',
        workspace: 'apps/api',
        entrypoint: 'src/server.ts',
        routePrefix: '/api',
      });

      const admin = result.services.find(s => s.name === 'admin');
      expect(admin).toMatchObject({
        name: 'admin',
        type: 'web',
        workspace: 'apps/admin',
        entrypoint: 'src/index.ts',
        routePrefix: '/admin',
      });

      // Non-root runtime services generate rewrites.
      // The root Next.js service is a route-owning builder — it produces its
      // own route table, so no synthetic routes are generated for it.
      expect(result.routes.rewrites).toHaveLength(2);
      expect(result.routes.defaults).toHaveLength(0);
    });

    it('should default type to web', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            app: {
              entrypoint: 'index.ts',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services[0].type).toBe('web');
    });

    it('should default workspace to "."', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            app: {
              entrypoint: 'index.ts',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services[0].workspace).toBe('.');
    });

    it('should infer Go workspace from nearest go.mod when workspace is omitted', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'go-api': {
              entrypoint: 'services/go-api/main.go',
              routePrefix: '/go-api',
            },
          },
        }),
        'services/go-api/go.mod': 'module go-api',
        'services/go-api/main.go': 'package main',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'go-api',
        workspace: 'services/go-api',
        entrypoint: 'main.go',
      });
      expect(result.services[0].builder.src).toBe('services/go-api/main.go');
      expect(result.services[0].builder.config).toMatchObject({
        workspace: 'services/go-api',
      });
    });

    it.each([
      ['pyproject.toml', '[project]\nname = "fastapi-api"\n'],
      ['requirements.txt', 'fastapi\n'],
      ['Pipfile', '[packages]\nfastapi = "*"\n'],
      ['pylock.yml', 'lock-version: "1.0"\n'],
      ['uv.lock', 'version = 1\n'],
    ])(
      'should infer Python workspace from nearest %s when workspace is omitted',
      async (manifestFilename, manifestContents) => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              'fastapi-api': {
                framework: 'fastapi',
                entrypoint: 'services/fastapi-api/main.py',
                routePrefix: '/fastapi-api',
              },
            },
          }),
          [`services/fastapi-api/${manifestFilename}`]: manifestContents,
          'services/fastapi-api/main.py': 'from fastapi import FastAPI',
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'fastapi-api',
          workspace: 'services/fastapi-api',
          entrypoint: 'main.py',
        });
        expect(result.services[0].builder.src).toBe(
          'services/fastapi-api/main.py'
        );
        expect(result.services[0].builder.config).toMatchObject({
          workspace: 'services/fastapi-api',
        });
      }
    );

    it('should infer Ruby workspace from nearest Gemfile when workspace is omitted', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'ruby-api': {
              entrypoint: 'services/ruby-api/config.ru',
              routePrefix: '/ruby-api',
            },
          },
        }),
        'services/ruby-api/Gemfile': 'source "https://rubygems.org"',
        'services/ruby-api/config.ru': 'run Sinatra::Application',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'ruby-api',
        workspace: 'services/ruby-api',
        entrypoint: 'config.ru',
      });
      expect(result.services[0].builder.src).toBe(
        'services/ruby-api/config.ru'
      );
      expect(result.services[0].builder.config).toMatchObject({
        workspace: 'services/ruby-api',
      });
    });

    it('should infer Rust workspace from nearest Cargo.toml when workspace is omitted', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'rust-api': {
              entrypoint: 'services/rust-api/src/main.rs',
              routePrefix: '/rust-api',
            },
          },
        }),
        'services/rust-api/Cargo.toml':
          '[package]\nname = "rust-api"\nversion = "0.1.0"\n',
        'services/rust-api/src/main.rs': 'fn main() {}',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'rust-api',
        workspace: 'services/rust-api',
        entrypoint: 'src/main.rs',
      });
      expect(result.services[0].builder.src).toBe(
        'services/rust-api/src/main.rs'
      );
      expect(result.services[0].builder.config).toMatchObject({
        workspace: 'services/rust-api',
      });
    });

    it('should prefer explicitly configured workspace over inferred manifest workspace', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              workspace: 'apps/api',
              entrypoint: 'src/main.py',
              framework: 'fastapi',
              routePrefix: '/api',
            },
          },
        }),
        // Should be ignored because workspace is explicitly configured.
        'services/fastapi-api/pyproject.toml':
          '[project]\nname = "fastapi-api"\n',
        'apps/api/src/main.py': 'from fastapi import FastAPI',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        workspace: 'apps/api',
        entrypoint: 'src/main.py',
      });
      expect(result.services[0].builder.src).toBe('apps/api/src/main.py');
    });

    it('should default topic and consumer to "default" for workers', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            worker: {
              type: 'worker',
              entrypoint: 'worker.py',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services[0]).toMatchObject({
        type: 'worker',
        topic: 'default',
        consumer: 'default',
      });
    });

    it('should not set topic/consumer defaults for non-workers', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            web: {
              type: 'web',
              entrypoint: 'index.ts',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services[0].topic).toBeUndefined();
      expect(result.services[0].consumer).toBeUndefined();
    });

    it.each(['1api', 'my service', 'my.service', 'api_', 'api-'])(
      'should reject invalid service name "%s"',
      async name => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              [name]: { entrypoint: 'index.ts', routePrefix: '/' },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors[0].code).toBe('INVALID_SERVICE_NAME');
      }
    );

    it.each(['api', 'my-api', 'my_service', 'MyService'])(
      'should accept valid service name "%s"',
      async name => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              [name]: { entrypoint: 'index.ts', routePrefix: '/' },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toHaveLength(1);
        expect(result.errors).toEqual([]);
      }
    );

    it('should error when web service is missing routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'index.ts',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_ROUTE_PREFIX');
      expect(result.errors[0].serviceName).toBe('api');
    });

    it.each(['/_svc', '/_svc/api'])(
      'should error when web service uses reserved internal routePrefix "%s"',
      async routePrefix => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                entrypoint: 'api/index.ts',
                routePrefix,
              },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
          code: 'RESERVED_ROUTE_PREFIX',
          serviceName: 'api',
        });
      }
    );

    it('should error when two web services share normalized routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.ts',
              routePrefix: '/api',
            },
            'api-trailing': {
              entrypoint: 'api/alt.ts',
              routePrefix: '/api/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'DUPLICATE_ROUTE_PREFIX',
        serviceName: 'api-trailing',
      });
    });

    it('should allow nested web routePrefix values', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.ts',
              routePrefix: '/api',
            },
            fastapi: {
              framework: 'fastapi',
              entrypoint: 'api/fastapi/main.py',
              routePrefix: '/api/fastapi',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);
    });
  });

  describe('cron services', () => {
    it('should detect a cron service with schedule', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'cron',
              entrypoint: 'cron/cleanup.ts',
              schedule: '0 0 * * *',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'cleanup',
        type: 'cron',
        schedule: '0 0 * * *',
      });
      expect(result.errors).toEqual([]);
    });

    it('should return error for cron without schedule', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'cron',
              entrypoint: 'cron/cleanup.ts',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_CRON_SCHEDULE',
        serviceName: 'cleanup',
      });
    });

    it('should error if cron service has routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'cron',
              entrypoint: 'cron/cleanup.ts',
              schedule: '0 0 * * *',
              routePrefix: '/cron',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_ROUTE_PREFIX',
        serviceName: 'cleanup',
      });
    });
  });

  describe('worker services', () => {
    it('should error if worker service has routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            processor: {
              type: 'worker',
              entrypoint: 'worker/processor.ts',
              topic: 'jobs',
              routePrefix: '/worker',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_ROUTE_PREFIX',
        serviceName: 'processor',
      });
    });
  });

  describe('with workPath', () => {
    it('should read vercel.json from workPath', async () => {
      const fs = new VirtualFilesystem({
        'apps/web/vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'src/index.ts',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs, workPath: 'apps/web' });

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('frontend');
    });
  });

  describe('invalid vercel.json', () => {
    it('should return error for invalid JSON', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': 'not valid json',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_VERCEL_JSON');
    });
  });

  describe('static/SPA service routing', () => {
    it('should generate SPA fallback for static service at root', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              framework: 'vite',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(isStaticBuild(result.services[0])).toBe(true);
      expect(result.errors).toEqual([]);

      // Root static service gets filesystem handler + SPA fallback in defaults
      expect(result.routes.defaults).toHaveLength(2);
      expect(result.routes.defaults[0]).toEqual({ handle: 'filesystem' });
      expect(result.routes.defaults[1]).toEqual({
        src: '/(.*)',
        dest: '/index.html',
      });
    });

    it('should generate SPA fallback for static service at prefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            admin: {
              workspace: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(isStaticBuild(result.services[0])).toBe(true);
      expect(result.errors).toEqual([]);

      // Prefixed static service gets SPA fallback in rewrites
      expect(result.routes.rewrites).toHaveLength(1);
      expect(result.routes.rewrites[0]).toEqual({
        src: '^(?=/admin(?:/|$))(?:/admin(?:/.*)?$)',
        dest: '/admin/index.html',
      });
    });

    it('should scope parent static fallback so descendant service prefixes are excluded', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            dashboard: {
              framework: 'vite',
              routePrefix: '/dashboard',
            },
            'dashboard-api': {
              entrypoint: 'services/dashboard-api/index.go',
              routePrefix: '/dashboard/api',
            },
          },
        }),
      });
      const result = await detectServices({ fs });
      expect(result.errors).toEqual([]);

      const staticRoute = result.routes.rewrites.find(
        (route): route is Route & { src: string; dest: string } =>
          'src' in route &&
          typeof route.src === 'string' &&
          'dest' in route &&
          route.dest === '/dashboard/index.html'
      );
      expect(staticRoute).toBeDefined();

      const staticRegex = new RegExp(staticRoute!.src);
      expect(staticRegex.test('/dashboard')).toBe(true);
      expect(staticRegex.test('/dashboard/settings')).toBe(true);
      expect(staticRegex.test('/dashboard/api')).toBe(false);
      expect(staticRegex.test('/dashboard/api/ping')).toBe(false);

      const apiRoute = findMatchingRoute(
        result.routes.rewrites,
        '/dashboard/api/ping'
      );
      expect(apiRoute).toBeDefined();
      expect(apiRoute!.dest).toBe('/_svc/dashboard-api/index');
      expect(apiRoute).toHaveProperty('check', true);
    });

    it('should pass routePrefix in builder config for static services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            admin: {
              workspace: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      // routePrefix is passed without leading slash for mountpoint
      expect(result.services[0].builder.config).toMatchObject({
        routePrefix: 'admin',
        framework: 'vite',
      });
    });

    it('should pass "." as routePrefix for root static services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              workspace: 'packages/web',
              framework: 'vite',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      // Root prefix uses '.' so it's truthy in static-build mountpoint logic
      expect(result.services[0].builder.config).toMatchObject({
        routePrefix: '.',
        framework: 'vite',
      });
    });

    it('should handle mixed static and function services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              framework: 'vite',
              routePrefix: '/',
            },
            'admin-panel': {
              workspace: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
            'gin-api': {
              entrypoint: 'api/index.go',
              routePrefix: '/api',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(3);
      expect(result.errors).toEqual([]);

      const frontend = result.services.find(s => s.name === 'frontend');
      const adminPanel = result.services.find(s => s.name === 'admin-panel');
      const ginApi = result.services.find(s => s.name === 'gin-api');

      // Vite services should be static builds
      expect(isStaticBuild(frontend!)).toBe(true);
      expect(isStaticBuild(adminPanel!)).toBe(true);
      // Go entrypoint should be a function
      expect(isStaticBuild(ginApi!)).toBe(false);

      // Function service and prefixed static service get rewrites
      expect(result.routes.rewrites).toHaveLength(2);
      expect(result.routes.rewrites).toContainEqual({
        src: '^(?=/api(?:/|$))(?:/api(?:/.*)?$)',
        dest: '/_svc/gin-api/index',
        check: true,
      });
      expect(result.routes.rewrites).toContainEqual({
        src: '^(?=/admin(?:/|$))(?:/admin(?:/.*)?$)',
        dest: '/admin/index.html',
      });

      // Root static service gets filesystem + SPA fallback in defaults.
      // The SPA catch-all excludes prefixes owned by other services
      // so they fall through to their own route tables (e.g. error phases).
      expect(result.routes.defaults).toHaveLength(2);
      expect(result.routes.defaults).toContainEqual({ handle: 'filesystem' });
      expect(result.routes.defaults).toContainEqual({
        src: '^(?!/admin(?:/|$))(?!/api(?:/|$))(?:/(.*))',
        dest: '/index.html',
      });
    });
  });

  describe('complex multi-service project routing', () => {
    //   web          → Next.js            at /               (route-owning)
    //   admin        → Vite               at /admin          (static/SPA)
    //   dashboard    → Next.js            at /dashboard      (route-owning)
    //   docs         → Docusaurus         at /docs           (static)
    //   gin-api      → @vercel/go         at /api/gin        (runtime)
    //   fastapi-api  → @vercel/python     at /api/fastapi    (runtime)
    const SERVICES_CONFIG = {
      web: {
        workspace: 'apps/web',
        framework: 'nextjs',
        routePrefix: '/',
      },
      admin: {
        workspace: 'apps/admin',
        framework: 'vite',
        routePrefix: '/admin',
      },
      dashboard: {
        workspace: 'apps/dashboard',
        framework: 'nextjs',
        routePrefix: '/dashboard',
      },
      docs: {
        workspace: 'apps/docs',
        framework: 'docusaurus-2',
        routePrefix: '/docs',
      },
      'gin-api': {
        entrypoint: 'services/gin-api/index.go',
        routePrefix: '/api/gin',
      },
      'fastapi-api': {
        framework: 'fastapi',
        entrypoint: 'services/fastapi-api/main.py',
        routePrefix: '/api/fastapi',
      },
    };

    let services: Awaited<ReturnType<typeof detectServices>>['services'];
    let rewrites: Route[];
    let defaults: Route[];

    beforeAll(async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: SERVICES_CONFIG,
        }),
      });
      const result = await detectServices({ fs });
      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(6);
      services = result.services;
      rewrites = result.routes.rewrites;
      defaults = result.routes.defaults;
    });

    // -- Builder category classification --

    it('should classify Next.js services as route-owning', () => {
      const web = services.find(s => s.name === 'web')!;
      const dashboard = services.find(s => s.name === 'dashboard')!;
      expect(isRouteOwningBuilder(web)).toBe(true);
      expect(isRouteOwningBuilder(dashboard)).toBe(true);
    });

    it('should classify Vite and Docusaurus as static builds', () => {
      const admin = services.find(s => s.name === 'admin')!;
      const docs = services.find(s => s.name === 'docs')!;
      expect(isStaticBuild(admin)).toBe(true);
      expect(isStaticBuild(docs)).toBe(true);
      expect(isRouteOwningBuilder(admin)).toBe(false);
      expect(isRouteOwningBuilder(docs)).toBe(false);
    });

    it('should classify entrypoint-based services as runtime (not route-owning, not static)', () => {
      const ginApi = services.find(s => s.name === 'gin-api')!;
      const fastapiApi = services.find(s => s.name === 'fastapi-api')!;
      expect(isStaticBuild(ginApi)).toBe(false);
      expect(isStaticBuild(fastapiApi)).toBe(false);
      expect(isRouteOwningBuilder(ginApi)).toBe(false);
      expect(isRouteOwningBuilder(fastapiApi)).toBe(false);
    });

    // -- Synthetic route generation --

    it('should NOT generate synthetic routes for route-owning builders', () => {
      // Next.js services (web at /, dashboard at /dashboard) should have
      // no synthetic rewrites or defaults generated for them.
      const allRoutes = [...rewrites, ...defaults];
      for (const route of allRoutes) {
        if ('dest' in route && typeof route.dest === 'string') {
          // No route should point to Next.js builder sources
          expect(route.dest).not.toContain('apps/web');
          expect(route.dest).not.toContain('apps/dashboard');
        }
      }
    });

    it('should generate rewrite routes for non-root static and runtime services', () => {
      // admin (static), docs (static), gin-api (runtime), fastapi-api (runtime)
      // All are non-root, so they get rewrites (not defaults).
      expect(rewrites.length).toBe(4);
    });

    it('should generate no default routes (root is route-owning Next.js)', () => {
      // The root service is Next.js (route-owning), so no defaults are generated.
      expect(defaults).toHaveLength(0);
    });

    // -- Synthetic route regex matching --

    describe('rewrite route matching', () => {
      it.each([
        ['/admin', 'admin'],
        ['/admin/', 'admin'],
        ['/admin/settings', 'admin'],
        ['/admin/users/123', 'admin'],
      ])('should match "%s" to admin service SPA fallback', pathname => {
        const match = findMatchingRoute(rewrites, pathname);
        expect(match).toBeDefined();
        expect(match!.dest).toBe('/admin/index.html');
        expect(match).not.toHaveProperty('check');
      });

      it.each([
        ['/docs', 'docs'],
        ['/docs/', 'docs'],
        ['/docs/getting-started', 'docs'],
        ['/docs/architecture/api-services', 'docs'],
      ])('should match "%s" to docs service SPA fallback', pathname => {
        const match = findMatchingRoute(rewrites, pathname);
        expect(match).toBeDefined();
        expect(match!.dest).toBe('/docs/index.html');
        expect(match).not.toHaveProperty('check');
      });

      it.each([
        ['/api/gin', 'gin-api'],
        ['/api/gin/', 'gin-api'],
        ['/api/gin/users', 'gin-api'],
        ['/api/gin/users/123/posts', 'gin-api'],
      ])('should match "%s" to gin-api function rewrite', pathname => {
        const match = findMatchingRoute(rewrites, pathname);
        expect(match).toBeDefined();
        expect(match!.dest).toBe('/_svc/gin-api/index');
        expect(match!).toHaveProperty('check', true);
      });

      it.each([
        ['/api/fastapi', 'fastapi-api'],
        ['/api/fastapi/', 'fastapi-api'],
        ['/api/fastapi/users', 'fastapi-api'],
        ['/api/fastapi/items/42', 'fastapi-api'],
      ])('should match "%s" to fastapi-api function rewrite', pathname => {
        const match = findMatchingRoute(rewrites, pathname);
        expect(match).toBeDefined();
        expect(match!.dest).toBe('/_svc/fastapi-api/index');
        expect(match!).toHaveProperty('check', true);
      });
    });

    describe('route isolation (no cross-service matching)', () => {
      it.each(['/', '/about', '/contact', '/dashboard', '/dashboard/settings'])(
        'should NOT match "%s" to any synthetic rewrite (owned by Next.js)',
        pathname => {
          const match = findMatchingRoute(rewrites, pathname);
          expect(match).toBeUndefined();
        }
      );

      it('should not match /admin-panel to admin service', () => {
        // /admin-panel is NOT under /admin/ — it's a different path
        const match = findMatchingRoute(rewrites, '/admin-panel');
        expect(match).toBeUndefined();
      });

      it('should not match /api to any API service', () => {
        // /api is not under /api/gin or /api/fastapi
        const match = findMatchingRoute(rewrites, '/api');
        expect(match).toBeUndefined();
      });

      it('should not match /api/other to gin or fastapi service', () => {
        const match = findMatchingRoute(rewrites, '/api/other');
        expect(match).toBeUndefined();
      });
    });

    describe('rewrite ordering (longest prefix first)', () => {
      it('should order rewrites with most specific prefixes first', () => {
        // /api/gin and /api/fastapi (length 8-12) should come
        // before /admin and /docs (length 6 and 5)
        const prefixLengths = rewrites
          .filter(
            (r): r is Route & { src: string } =>
              'src' in r && typeof r.src === 'string'
          )
          .map(r => r.src.length);

        for (let i = 1; i < prefixLengths.length; i++) {
          expect(prefixLengths[i - 1]).toBeGreaterThanOrEqual(prefixLengths[i]);
        }
      });
    });
  });
});
