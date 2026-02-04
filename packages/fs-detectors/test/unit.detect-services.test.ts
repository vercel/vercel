import { detectServices, isStaticBuild } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectServices', () => {
  describe('with no vercel.json', () => {
    it('should return error when no services configured', async () => {
      const fs = new VirtualFilesystem({});
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_CONFIGURED');
    });
  });

  describe('with vercel.json without experimentalServices', () => {
    it('should return error when no services configured', async () => {
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

      // Non-root services generate rewrites, root service generates default
      expect(result.routes.rewrites).toHaveLength(2);
      expect(result.routes.defaults).toHaveLength(1);
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
        src: '^/admin(?:/.*)?$',
        dest: '/admin/index.html',
      });
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
            'express-api': {
              entrypoint: 'api/index.js',
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
      const expressApi = result.services.find(s => s.name === 'express-api');

      // Vite services should be static builds
      expect(isStaticBuild(frontend!)).toBe(true);
      expect(isStaticBuild(adminPanel!)).toBe(true);
      // Node entrypoint should be a function
      expect(isStaticBuild(expressApi!)).toBe(false);

      // Function service and prefixed static service get rewrites
      expect(result.routes.rewrites).toHaveLength(2);
      expect(result.routes.rewrites).toContainEqual({
        src: '^/api(?:/.*)?$',
        dest: '/api/index.js',
        check: true,
      });
      expect(result.routes.rewrites).toContainEqual({
        src: '^/admin(?:/.*)?$',
        dest: '/admin/index.html',
      });

      // Root static service gets filesystem + SPA fallback in defaults
      expect(result.routes.defaults).toHaveLength(2);
      expect(result.routes.defaults).toContainEqual({ handle: 'filesystem' });
      expect(result.routes.defaults).toContainEqual({
        src: '/(.*)',
        dest: '/index.html',
      });
    });
  });
});
