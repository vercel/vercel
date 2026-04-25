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
      expect(result.source).toBe('auto-detected');
      expect(result.resolved).not.toBeNull();
      expect(result.resolved?.source).toBe('auto-detected');
      expect(result.inferred).toBeNull();
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
      expect(result.resolved).not.toBeNull();
      expect(result.resolved?.services).toHaveLength(2);
      expect(result.inferred).toMatchObject({
        source: 'layout',
        config: {
          frontend: { framework: 'nextjs', routePrefix: '/' },
          backend: {
            entrypoint: 'backend',
            routePrefix: '/_/backend',
          },
        },
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
        'src/index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.source).toBe('configured');
      expect(result.resolved).not.toBeNull();
      expect(result.resolved?.source).toBe('configured');
      expect(result.inferred).toBeNull();
      expect(result.services[0]).toMatchObject({
        name: 'api',
        type: 'web',
        workspace: '.',
        entrypoint: 'src/index.ts',
        routePrefix: '/',
      });
      expect(result.errors).toEqual([]);
      // Node runtime now resolves to @vercel/backends, which owns routing.
      expect(result.routes.rewrites).toHaveLength(0);
      expect(result.routes.defaults).toHaveLength(0);
    });

    it('should support mount string as a routePrefix alias', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'src/index.ts',
              mount: '/api',
            },
          },
        }),
        'src/index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        routePrefix: '/api',
        routePrefixSource: 'configured',
      });
    });

    it('should support mount object as routePrefix/subdomain alias', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.go',
              mount: {
                path: '/internal-api',
                subdomain: 'api',
              },
            },
          },
        }),
        'api/index.go': 'package main',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        routePrefix: '/internal-api',
        routePrefixSource: 'configured',
        subdomain: 'api',
      });
      expect(result.routes.hostRewrites).toContainEqual({
        src: '^/$',
        dest: '/internal-api',
        has: [{ type: 'host', value: { pre: 'api.' } }],
        missing: [
          { type: 'host', value: { suf: '.vercel.app' } },
          { type: 'host', value: { suf: '.vercel.dev' } },
        ],
        check: true,
      });
    });

    it('should support mount object with subdomain only', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            docs: {
              entrypoint: 'docs/index.ts',
              mount: {
                subdomain: 'docs',
              },
            },
          },
        }),
        'docs/index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'docs',
        routePrefix: '/_/docs',
        routePrefixSource: 'generated',
        subdomain: 'docs',
      });
    });

    it('should resolve file entrypoint paths without explicit workspace', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'my-api': {
              entrypoint: 'api/api/handler.go',
              routePrefix: '/api',
            },
          },
        }),
        'api/api/handler.go': 'package main',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.errors).toEqual([]);
      expect(result.services[0].builder.src).toBe('api/api/handler.go');
    });

    it('should detect multiple services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'apps/web',
              framework: 'nextjs',
              routePrefix: '/',
            },
            api: {
              entrypoint: 'apps/api/src/server.ts',
              routePrefix: '/api',
            },
            admin: {
              entrypoint: 'apps/admin/src/index.ts',
              routePrefix: '/admin',
            },
          },
        }),
        'apps/web/package.json': JSON.stringify({ name: 'web' }),
        'apps/api/package.json': JSON.stringify({ name: 'api' }),
        'apps/api/src/server.ts': 'export default {}',
        'apps/admin/package.json': JSON.stringify({ name: 'admin' }),
        'apps/admin/src/index.ts': 'export default {}',
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

      // All services in this fixture use route-owning builders (Next.js and
      // @vercel/backends), so no synthetic routes are generated.
      expect(result.routes.rewrites).toHaveLength(0);
      expect(result.routes.defaults).toHaveLength(0);
    });

    it('should auto-detect FastAPI for backend file entrypoint in configured services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'frontend',
              routePrefix: '/',
              framework: 'nextjs',
            },
            backend: {
              entrypoint: 'backend/main.py',
              routePrefix: '/svc/api',
            },
          },
        }),
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '15.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.source).toBe('configured');
      expect(result.services).toHaveLength(2);

      const frontend = result.services.find(s => s.name === 'frontend');
      expect(frontend).toMatchObject({
        name: 'frontend',
        framework: 'nextjs',
        workspace: 'frontend',
        routePrefix: '/',
        routePrefixSource: 'configured',
      });
      expect(frontend?.builder.use).toBe('@vercel/next');

      const backend = result.services.find(s => s.name === 'backend');
      expect(backend).toMatchObject({
        name: 'backend',
        framework: 'fastapi',
        runtime: 'python',
        workspace: 'backend',
        entrypoint: 'main.py',
        routePrefix: '/svc/api',
        routePrefixSource: 'configured',
      });
      expect(backend?.builder).toMatchObject({
        src: 'backend/main.py',
        use: '@vercel/python',
        config: {
          zeroConfig: true,
          routePrefix: 'svc/api',
          workspace: 'backend',
          framework: 'fastapi',
        },
      });

      expect(result.routes.rewrites).toContainEqual({
        src: '^(?=/svc/api(?:/|$))(?:/svc/api(?:/.*)?$)',
        dest: '/_svc/backend/index',
        check: true,
      });
      expect(result.routes.defaults).toEqual([]);
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
        'index.ts': 'export default {}',
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
        'index.ts': 'export default {}',
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
    ])('should infer Python workspace from nearest %s when workspace is omitted', async (manifestFilename, manifestContents) => {
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
    });

    it('should auto-detect framework for Python file entrypoint when omitted', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'backend/main.py',
              routePrefix: '/api',
            },
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        framework: 'fastapi',
        runtime: 'python',
        workspace: 'backend',
        entrypoint: 'main.py',
        routePrefix: '/api',
      });
      expect(result.services[0].builder.use).toBe('@vercel/python');
    });

    it('should keep runtime-only resolution when file entrypoint framework detection is ambiguous', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'backend/main.py',
              routePrefix: '/api',
            },
          },
        }),
        'backend/requirements.txt': 'fastapi\nflask\n',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        runtime: 'python',
        workspace: 'backend',
        entrypoint: 'main.py',
        routePrefix: '/api',
      });
      expect(result.services[0].framework).toBeUndefined();
      expect(result.services[0].builder.use).toBe('@vercel/python');
    });

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

    it('should use directory entrypoint as service workspace', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'apps/api',
              framework: 'fastapi',
              routePrefix: '/api',
            },
          },
        }),
        'apps/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
        // Should be ignored because directory entrypoint sets workspace directly.
        'services/fastapi-api/pyproject.toml':
          '[project]\nname = "fastapi-api"\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        workspace: 'apps/api',
        entrypoint: undefined,
      });
      expect(result.services[0].builder.src).toBe('apps/api/<detect>');
    });

    it('should auto-detect framework for directory entrypoint when omitted', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'apps/api',
              routePrefix: '/api',
            },
          },
        }),
        'apps/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        framework: 'fastapi',
        workspace: 'apps/api',
        entrypoint: undefined,
      });
      expect(result.services[0].builder.use).toBe('@vercel/python');
      expect(result.services[0].builder.src).toBe('apps/api/<detect>');
    });

    it('should treat existing dotted directory entrypoint as a directory', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            web: {
              entrypoint: 'apps/web.v2',
              routePrefix: '/',
            },
          },
        }),
        'apps/web.v2/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        framework: 'nextjs',
        workspace: 'apps/web.v2',
        entrypoint: undefined,
      });
      expect(result.services[0].builder.src).toBe('apps/web.v2/package.json');
    });

    it('should treat existing extensionless entrypoint as a file', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/server',
              runtime: 'node',
              routePrefix: '/api',
            },
          },
        }),
        'api/server': 'export default function handler() {}',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        runtime: 'node',
        workspace: '.',
        entrypoint: 'api/server',
      });
      expect(result.services[0].builder.use).toBe('@vercel/backends');
      expect(result.services[0].builder.src).toBe('api/server');
    });

    it('should error when directory entrypoint has multiple detected frameworks', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            web: {
              entrypoint: 'apps/web',
              routePrefix: '/',
            },
          },
        }),
        'apps/web/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
            gatsby: '5.0.0',
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_SERVICE');
      expect(result.errors[0].serviceName).toBe('web');
      expect(result.errors[0].message).toContain('apps/web/');
    });

    it('should error when directory entrypoint has no detectable framework', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            web: {
              entrypoint: 'apps/web',
              routePrefix: '/',
            },
          },
        }),
        'apps/web/README.md': '# app',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_SERVICE_FRAMEWORK');
      expect(result.errors[0].serviceName).toBe('web');
      expect(result.errors[0].message).toContain('apps/web');
    });

    it('should error when directory entrypoint with runtime has no detectable framework', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'apps/api',
              runtime: 'python',
              routePrefix: '/api',
            },
          },
        }),
        'apps/api/main.py': 'print("ok")',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_SERVICE_FRAMEWORK');
      expect(result.errors[0].serviceName).toBe('api');
    });

    it('should auto-detect framework for directory entrypoint with explicit runtime', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'apps/api',
              runtime: 'python',
              routePrefix: '/api',
            },
          },
        }),
        'apps/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        framework: 'fastapi',
        workspace: 'apps/api',
        entrypoint: undefined,
      });
      expect(result.services[0].builder.use).toBe('@vercel/python');
      expect(result.services[0].builder.src).toBe('apps/api/<detect>');
    });

    it('should auto-detect framework for file entrypoint and keep node backend builder', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            jsApi: {
              entrypoint: 'services/js-api/index.js',
              routePrefix: '/api/js',
            },
          },
        }),
        'services/js-api/package.json': JSON.stringify({
          dependencies: {
            express: 'latest',
          },
        }),
        'services/js-api/index.js': 'const express = require("express");',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'jsApi',
        type: 'web',
        framework: 'express',
        workspace: 'services/js-api',
        entrypoint: 'index.js',
        routePrefix: '/api/js',
      });
      expect(result.services[0].builder.use).toBe('@vercel/backends');
      expect(result.services[0].builder.config?.framework).toBe('express');
    });

    it('should preserve explicit node builder when framework is auto-detected', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            jsApi: {
              builder: '@vercel/node',
              entrypoint: 'services/js-api/index.js',
              routePrefix: '/api/js',
            },
          },
        }),
        'services/js-api/package.json': JSON.stringify({
          dependencies: {
            express: 'latest',
          },
        }),
        'services/js-api/index.js': 'const express = require("express");',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'jsApi',
        type: 'web',
        framework: 'express',
        workspace: 'services/js-api',
        entrypoint: 'index.js',
        routePrefix: '/api/js',
      });
      expect(result.services[0].builder.use).toBe('@vercel/node');
      expect(result.services[0].builder.src).toBe('services/js-api/index.js');
      expect(result.services[0].builder.config?.framework).toBe('express');
    });

    it('should force backend framework to backends builder when explicit', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            jsApi: {
              framework: 'express',
              entrypoint: 'services/js-api/index.js',
              routePrefix: '/api/js',
            },
          },
        }),
        'services/js-api/package.json': JSON.stringify({
          dependencies: {
            express: 'latest',
          },
        }),
        'services/js-api/index.js': 'const express = require("express");',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'jsApi',
        type: 'web',
        framework: 'express',
        workspace: 'services/js-api',
        entrypoint: 'index.js',
        routePrefix: '/api/js',
      });
      expect(result.services[0].builder.use).toBe('@vercel/backends');
      expect(result.services[0].builder.src).toBe('services/js-api/index.js');
      expect(result.services[0].builder.config?.framework).toBe('express');
    });

    it('should force backend framework to backends builder for directory entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            jsApi: {
              framework: 'express',
              entrypoint: 'services/js-api',
              routePrefix: '/api/js',
            },
          },
        }),
        'services/js-api/package.json': JSON.stringify({
          dependencies: {
            express: 'latest',
          },
        }),
        'services/js-api/index.js': 'const express = require("express");',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'jsApi',
        type: 'web',
        framework: 'express',
        workspace: 'services/js-api',
        entrypoint: undefined,
        routePrefix: '/api/js',
      });
      expect(result.services[0].builder.use).toBe('@vercel/backends');
      expect(result.services[0].builder.src).toBe('services/js-api/index.js');
      expect(result.services[0].builder.config?.framework).toBe('express');
    });

    it('should default topics to ["default"] for workers', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            worker: {
              type: 'worker',
              entrypoint: 'worker.py',
            },
          },
        }),
        'worker.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.services[0]).toMatchObject({
        type: 'worker',
        topics: ['default'],
      });
    });

    it('should pass through topics array for workers', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            worker: {
              type: 'worker',
              entrypoint: 'worker.py',
              topics: ['orders', 'events'],
            },
          },
        }),
        'worker.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.services[0]).toMatchObject({
        type: 'worker',
        topics: ['orders', 'events'],
      });
    });

    it('should not set topics defaults for non-workers', async () => {
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
        'index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.services[0].topics).toBeUndefined();
    });

    it.each([
      '1api',
      'my service',
      'my.service',
      'api_',
      'api-',
    ])('should reject invalid service name "%s"', async name => {
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
    });

    it.each([
      'api',
      'my-api',
      'my_service',
      'MyService',
    ])('should accept valid service name "%s"', async name => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            [name]: { entrypoint: 'index.ts', routePrefix: '/' },
          },
        }),
        'index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.errors).toEqual([]);
    });

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

    it('should error when mount is mixed with legacy routing keys', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.ts',
              mount: '/api',
              routePrefix: '/legacy-api',
            },
          },
        }),
        'api/index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'CONFLICTING_MOUNT_CONFIG',
        serviceName: 'api',
      });
    });

    it('should derive routePrefix from subdomain using /_/serviceName', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.ts',
              subdomain: 'api',
            },
          },
        }),
        'api/index.ts': 'export default {}',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        routePrefix: '/_/api',
        routePrefixSource: 'generated',
        subdomain: 'api',
      });
    });

    it('should error when non-web service defines subdomain routing', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'cron/cleanup.py',
              schedule: '0 0 * * *',
              subdomain: 'jobs',
            },
          },
        }),
        'cron/cleanup.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_HOST_ROUTING_CONFIG',
        serviceName: 'cleanup',
      });
    });

    it.each([
      '/_svc',
      '/_svc/api',
    ])('should error when web service uses reserved internal routePrefix "%s"', async routePrefix => {
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
    });

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
        'api/index.ts': 'export default {}',
        'api/alt.ts': 'export default {}',
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
        'api/index.ts': 'export default {}',
        'api/fastapi/main.py': 'from fastapi import FastAPI',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);
    });

    describe('with root', () => {
      it('should resolve file entrypoint relative to root', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: 'packages/api',
                entrypoint: 'src/handler.ts',
                routePrefix: '/api',
              },
            },
          }),
          'packages/api/package.json': JSON.stringify({ name: 'api' }),
          'packages/api/src/handler.ts': 'export default {}',
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'api',
          type: 'web',
          workspace: 'packages/api',
          entrypoint: 'src/handler.ts',
          routePrefix: '/api',
        });
        expect(result.services[0].builder.src).toBe(
          'packages/api/src/handler.ts'
        );
      });

      it('should resolve directory entrypoint relative to root', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              web: {
                root: 'packages/web',
                entrypoint: '.',
                framework: 'nextjs',
                routePrefix: '/',
              },
            },
          }),
          'packages/web/package.json': JSON.stringify({
            dependencies: { next: '15.0.0' },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'web',
          type: 'web',
          workspace: 'packages/web',
          framework: 'nextjs',
          routePrefix: '/',
        });
      });

      it('should resolve framework-only service with root (no entrypoint)', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              web: {
                root: 'packages/web',
                framework: 'nextjs',
                routePrefix: '/',
              },
            },
          }),
          'packages/web/package.json': JSON.stringify({
            dependencies: { next: '15.0.0' },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'web',
          workspace: 'packages/web',
          framework: 'nextjs',
        });
        expect(result.services[0].builder.src).toBe(
          'packages/web/package.json'
        );
      });

      it('should resolve nested manifest within root', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: 'mono',
                entrypoint: 'apps/api/src/index.ts',
                routePrefix: '/api',
              },
            },
          }),
          'mono/apps/api/package.json': JSON.stringify({ name: 'api' }),
          'mono/apps/api/src/index.ts': 'export default {}',
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'api',
          workspace: 'mono/apps/api',
          entrypoint: 'src/index.ts',
        });
        expect(result.services[0].builder.src).toBe(
          'mono/apps/api/src/index.ts'
        );
      });

      it('should not find manifest above root (scoped fs bounds the walk)', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: 'packages/api',
                entrypoint: 'src/handler.ts',
                routePrefix: '/api',
              },
            },
          }),
          // Manifest is at project root, NOT inside root
          'package.json': JSON.stringify({ name: 'root' }),
          'packages/api/src/handler.ts': 'export default {}',
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        // Workspace should be the root itself (no manifest found within),
        // not '.' (project root manifest should not be found)
        expect(result.services[0].workspace).toBe('packages/api');
      });

      it('should behave identically without root (no regression)', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                entrypoint: 'src/index.ts',
                routePrefix: '/',
              },
            },
          }),
          'src/index.ts': 'export default {}',
        });
        const result = await detectServices({ fs });

        expect(result.errors).toEqual([]);
        expect(result.services).toHaveLength(1);
        expect(result.services[0]).toMatchObject({
          name: 'api',
          workspace: '.',
          entrypoint: 'src/index.ts',
          routePrefix: '/',
        });
      });

      it('should error when root does not exist', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: 'nonexistent',
                entrypoint: 'src/index.ts',
                routePrefix: '/api',
              },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('ROOT_NOT_FOUND');
      });

      it('should error when root is a file', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: 'some-file.txt',
                entrypoint: 'src/index.ts',
                routePrefix: '/api',
              },
            },
          }),
          'some-file.txt': 'hello',
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('ROOT_NOT_DIRECTORY');
      });

      it('should error when root is an absolute path', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: '/absolute/path',
                entrypoint: 'src/index.ts',
                routePrefix: '/api',
              },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_ROOT');
      });

      it('should error when root contains .. traversal', async () => {
        const fs = new VirtualFilesystem({
          'vercel.json': JSON.stringify({
            experimentalServices: {
              api: {
                root: '../escape',
                entrypoint: 'src/index.ts',
                routePrefix: '/api',
              },
            },
          }),
        });
        const result = await detectServices({ fs });

        expect(result.services).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_ROOT');
      });
    });
  });

  describe('schedule-triggered job services', () => {
    it('should detect a legacy cron service and treat it as a schedule-triggered job', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'cron',
              entrypoint: 'cron/cleanup.py',
              schedule: '0 0 * * *',
            },
          },
        }),
        'cron/cleanup.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'cleanup',
        type: 'cron',
        trigger: 'schedule',
        entrypoint: 'cron/cleanup.py',
        schedule: '0 0 * * *',
      });
      expect(result.routes.crons).toHaveLength(1);
    });

    it('should return error for legacy cron service without schedule', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'cron',
              entrypoint: 'cron/cleanup.py',
            },
          },
        }),
        'cron/cleanup.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_CRON_SCHEDULE',
        serviceName: 'cleanup',
      });
    });

    it('should detect a schedule-triggered job service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'cron/cleanup.py',
              schedule: '0 0 * * *',
            },
          },
        }),
        'cron/cleanup.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'cleanup',
        type: 'job',
        trigger: 'schedule',
        entrypoint: 'cron/cleanup.py',
        schedule: '0 0 * * *',
      });
      expect(result.routes.crons).toHaveLength(1);
    });

    it('should generate internal callback routes for schedule-triggered jobs', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'cron/cleanup.py',
              schedule: '0 0 * * *',
            },
          },
        }),
        'cron/cleanup.py': 'def main(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.routes.crons).toHaveLength(1);
      expect(result.routes.crons[0]).toMatchObject({
        src: '^/_svc/cleanup/crons/.*$',
        dest: '/_svc/cleanup/index',
        check: true,
      });
    });

    it('should return error for a schedule-triggered job without schedule', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'cron/cleanup.py',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_JOB_SCHEDULE',
        serviceName: 'cleanup',
      });
    });

    it('should error if a schedule-triggered job has routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'cron/cleanup.py',
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

    it('should detect a schedule-triggered job with module:function entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'sync-cleanup': {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'jobs.cleanup:sync_handler',
              schedule: '0 0 * * *',
            },
            'async-cleanup': {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'jobs.cleanup:async_handler',
              schedule: '0 6 * * *',
            },
          },
        }),
        'jobs/cleanup.py':
          'def sync_handler(): pass\nasync def async_handler(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(2);
      expect(result.services[0]).toMatchObject({
        name: 'sync-cleanup',
        type: 'job',
        trigger: 'schedule',
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'sync_handler',
        schedule: '0 0 * * *',
      });
      expect(result.services[1]).toMatchObject({
        name: 'async-cleanup',
        type: 'job',
        trigger: 'schedule',
        entrypoint: 'jobs/cleanup.py',
        handlerFunction: 'async_handler',
        schedule: '0 6 * * *',
      });
    });

    it('should generate schedule job routes with function name as handler', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'sync-cleanup': {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'jobs.cleanup:sync_handler',
              schedule: '0 0 * * *',
            },
          },
        }),
        'jobs/cleanup.py': 'def sync_handler(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.routes.crons).toHaveLength(1);
      expect(result.routes.crons[0]).toMatchObject({
        src: '^/_svc/sync-cleanup/crons/.*$',
        dest: '/_svc/sync-cleanup/index',
        check: true,
      });
    });

    it('should parse module:function entrypoint for web services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              type: 'web',
              entrypoint: 'jobs.cleanup:handler',
              routePrefix: '/api',
            },
          },
        }),
        'jobs/cleanup.py': 'def handler(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toHaveLength(0);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'api',
        type: 'web',
        entrypoint: 'jobs/cleanup.py',
      });
    });

    it('should parse module:function entrypoint for worker services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            processor: {
              type: 'worker',
              entrypoint: 'jobs.cleanup:handler',
              topics: ['jobs'],
            },
          },
        }),
        'jobs/cleanup.py': 'def handler(): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toHaveLength(0);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'processor',
        type: 'worker',
        entrypoint: 'jobs/cleanup.py',
      });
    });

    it('should error for module:function entrypoint when file does not exist', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            cleanup: {
              type: 'job',
              trigger: 'schedule',
              entrypoint: 'nonexistent.module:handler',
              schedule: '0 0 * * *',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'ENTRYPOINT_NOT_FOUND',
        serviceName: 'cleanup',
      });
    });
  });

  describe('worker services', () => {
    it('should not generate public routes for worker services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            processor: {
              type: 'worker',
              entrypoint: 'worker/processor.py',
              topics: ['jobs'],
            },
          },
        }),
        'worker/processor.py': 'def handler(event): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.routes.workers).toHaveLength(0);
    });

    it('should error if worker service has routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            processor: {
              type: 'worker',
              entrypoint: 'worker/processor.ts',
              topics: ['jobs'],
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

  describe('job services', () => {
    it('should detect a queue-triggered job service with topic objects', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            processor: {
              type: 'job',
              trigger: 'queue',
              entrypoint: 'worker/processor.py',
              topics: [
                {
                  topic: 'jobs',
                  retryAfterSeconds: 30,
                  initialDelaySeconds: 5,
                },
              ],
            },
          },
        }),
        'worker/processor.py': 'def handler(event): pass',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'processor',
        type: 'job',
        trigger: 'queue',
        topics: [
          {
            topic: 'jobs',
            retryAfterSeconds: 30,
            initialDelaySeconds: 5,
          },
        ],
      });
      // Queue-triggered services use private path routing; no synthetic worker routes.
      expect(result.routes.workers).toHaveLength(0);
    });

    it('should detect a workflow-triggered job service without synthetic routes', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            orchestrator: {
              type: 'job',
              trigger: 'workflow',
              entrypoint: 'workflow/index.ts',
            },
          },
        }),
        'workflow/index.ts': 'export const workflow = {};',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'orchestrator',
        type: 'job',
        trigger: 'workflow',
      });
      expect(result.routes.crons).toHaveLength(0);
      expect(result.routes.workers).toHaveLength(0);
      expect(result.routes.rewrites).toHaveLength(0);
      expect(result.routes.defaults).toHaveLength(0);
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
        'apps/web/src/index.ts': 'export default {}',
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
              entrypoint: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
          },
        }),
        'apps/admin/package.json': JSON.stringify({ name: 'admin' }),
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
        'services/dashboard-api/index.go': 'package main',
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
              entrypoint: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
          },
        }),
        'apps/admin/package.json': JSON.stringify({ name: 'admin' }),
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
              entrypoint: 'packages/web',
              framework: 'vite',
              routePrefix: '/',
            },
          },
        }),
        'packages/web/package.json': JSON.stringify({ name: 'web' }),
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
              entrypoint: 'apps/admin',
              framework: 'vite',
              routePrefix: '/admin',
            },
            'gin-api': {
              entrypoint: 'api/index.go',
              routePrefix: '/api',
            },
          },
        }),
        'apps/admin/package.json': JSON.stringify({ name: 'admin' }),
        'api/index.go': 'package main',
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

    it('should generate host-based rewrites for subdomain-mounted service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'api/index.go',
              subdomain: 'api',
            },
          },
        }),
        'api/index.go': 'package main',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services[0]).toMatchObject({
        routePrefix: '/_/api',
        routePrefixSource: 'generated',
        subdomain: 'api',
      });

      expect(result.routes.hostRewrites).toContainEqual({
        src: '^/$',
        dest: '/_/api',
        has: [{ type: 'host', value: { pre: 'api.' } }],
        missing: [
          { type: 'host', value: { suf: '.vercel.app' } },
          { type: 'host', value: { suf: '.vercel.dev' } },
        ],
        check: true,
      });
      expect(result.routes.hostRewrites).toContainEqual({
        src: '^/(?!_/api(?:/|$))(.*)$',
        dest: '/_/api/$1',
        has: [{ type: 'host', value: { pre: 'api.' } }],
        missing: [
          { type: 'host', value: { suf: '.vercel.app' } },
          { type: 'host', value: { suf: '.vercel.dev' } },
        ],
        check: true,
      });
    });

    it('should preserve explicit service prefixes on another service subdomain', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            web: {
              framework: 'nextjs',
              entrypoint: 'apps/web',
              routePrefix: '/',
            },
            docs: {
              framework: 'vite',
              entrypoint: 'apps/docs',
              routePrefix: '/__docs__',
              subdomain: 'docs',
            },
            dashboard: {
              framework: 'nextjs',
              entrypoint: 'apps/dashboard',
              routePrefix: '/__app__',
              subdomain: 'app',
            },
            api: {
              entrypoint: 'services/api/index.go',
              subdomain: 'api',
            },
          },
        }),
        'apps/web/package.json': JSON.stringify({
          dependencies: { next: '15.0.0' },
        }),
        'apps/docs/package.json': JSON.stringify({
          dependencies: { vite: '6.0.0' },
        }),
        'apps/dashboard/package.json': JSON.stringify({
          dependencies: { next: '15.0.0' },
        }),
        'services/api/index.go': 'package main',
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.routes.hostRewrites).toContainEqual({
        src: '^/(?!(?:__docs__|__app__|_/api)(?:/|$))(.*)$',
        dest: '/__app__/$1',
        has: [{ type: 'host', value: { pre: 'app.' } }],
        missing: [
          { type: 'host', value: { suf: '.vercel.app' } },
          { type: 'host', value: { suf: '.vercel.dev' } },
        ],
        check: true,
      });
    });

    it('should generate host-based rewrites for route-owning builders', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              framework: 'nextjs',
              entrypoint: 'apps/web',
              subdomain: 'app',
            },
          },
        }),
        'apps/web/package.json': JSON.stringify({
          dependencies: { next: '15.0.0' },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services[0]).toMatchObject({
        routePrefix: '/_/frontend',
        routePrefixSource: 'generated',
        subdomain: 'app',
      });
      // Route-owning services still need host routing, but should not get
      // synthetic path-based rewrites/defaults from service detection.
      expect(result.routes.rewrites).toEqual([]);
      expect(result.routes.defaults).toEqual([]);
      expect(result.routes.hostRewrites).toContainEqual({
        src: '^/$',
        dest: '/_/frontend',
        has: [{ type: 'host', value: { pre: 'app.' } }],
        missing: [
          { type: 'host', value: { suf: '.vercel.app' } },
          { type: 'host', value: { suf: '.vercel.dev' } },
        ],
        check: true,
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
        entrypoint: 'apps/web',
        framework: 'nextjs',
        routePrefix: '/',
      },
      admin: {
        entrypoint: 'apps/admin',
        framework: 'vite',
        routePrefix: '/admin',
      },
      dashboard: {
        entrypoint: 'apps/dashboard',
        framework: 'nextjs',
        routePrefix: '/dashboard',
      },
      docs: {
        entrypoint: 'apps/docs',
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
        'apps/web/package.json': JSON.stringify({ name: 'web' }),
        'apps/admin/package.json': JSON.stringify({ name: 'admin' }),
        'apps/dashboard/package.json': JSON.stringify({ name: 'dashboard' }),
        'apps/docs/package.json': JSON.stringify({ name: 'docs' }),
        'services/gin-api/index.go': 'package main',
        'services/fastapi-api/main.py': 'from fastapi import FastAPI',
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
      it.each([
        '/',
        '/about',
        '/contact',
        '/dashboard',
        '/dashboard/settings',
      ])('should NOT match "%s" to any synthetic rewrite (owned by Next.js)', pathname => {
        const match = findMatchingRoute(rewrites, pathname);
        expect(match).toBeUndefined();
      });

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
