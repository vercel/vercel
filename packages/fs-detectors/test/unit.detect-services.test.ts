import { detectServices } from '../src';
import { generateServicesRoutes } from '../src/services/detect-services';
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
            worker: {
              type: 'worker',
              entrypoint: 'worker.py',
              topic: 'tasks',
              consumer: 'processor',
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

      const worker = result.services.find(s => s.name === 'worker');
      expect(worker).toMatchObject({
        name: 'worker',
        type: 'worker',
        entrypoint: 'worker.py',
        topic: 'tasks',
        consumer: 'processor',
      });
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

  describe('framework with entrypoint', () => {
    it('should use user entrypoint when both framework and entrypoint are specified', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'express-api': {
              framework: 'express',
              entrypoint: 'services/express/app.js',
              routePrefix: '/api',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0].builder.src).toBe('services/express/app.js');
      expect(result.services[0].builder.use).toBe('@vercel/express');
    });

    it('should use framework default src when entrypoint is not specified', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              framework: 'nextjs',
              routePrefix: '/',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0].builder.src).toBe('package.json');
      expect(result.services[0].builder.use).toBe('@vercel/next');
    });

    it('should use user entrypoint for Python framework', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            'fastapi-api': {
              framework: 'fastapi',
              entrypoint: 'backend/main.py',
              routePrefix: '/fastapi',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0].builder.src).toBe('backend/main.py');
      expect(result.services[0].builder.use).toBe('@vercel/python');
    });
  });
});

describe('generateServicesRoutes', () => {
  it('should generate route with dest pointing to builder.src', () => {
    const services = [
      {
        name: 'api',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/api',
        entrypoint: 'api/index.ts',
        builder: { src: 'api/index.ts', use: '@vercel/node' },
        isStaticBuild: false,
      },
    ];
    const routes = generateServicesRoutes(services);

    expect(routes.rewrites).toHaveLength(1);
    expect(routes.rewrites[0]).toMatchObject({
      src: '^/api(?:/.*)?$',
      dest: '/api/index.ts',
      check: true,
    });
  });

  it('should generate route for root service with dest pointing to builder.src', () => {
    const services = [
      {
        name: 'frontend',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/',
        entrypoint: 'src/index.ts',
        builder: { src: 'src/index.ts', use: '@vercel/node' },
        isStaticBuild: false,
      },
    ];
    const routes = generateServicesRoutes(services);

    expect(routes.defaults).toHaveLength(1);
    expect(routes.defaults[0]).toMatchObject({
      src: '^/(.*)$',
      dest: '/src/index.ts',
      check: true,
    });
  });

  it('should handle multiple services with correct dest paths', () => {
    const services = [
      {
        name: 'express-api',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/express',
        entrypoint: 'express-api/index.js',
        builder: { src: 'express-api/index.js', use: '@vercel/node' },
        isStaticBuild: false,
      },
      {
        name: 'fastapi-api',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/fastapi',
        entrypoint: 'fastapi-api/main.py',
        builder: { src: 'fastapi-api/main.py', use: '@vercel/python' },
        isStaticBuild: false,
      },
    ];
    const routes = generateServicesRoutes(services);

    expect(routes.rewrites).toHaveLength(2);
    const expressRoute = routes.rewrites.find(
      r => r.dest === '/express-api/index.js'
    );
    const fastapiRoute = routes.rewrites.find(
      r => r.dest === '/fastapi-api/main.py'
    );

    expect(expressRoute).toBeDefined();
    expect(fastapiRoute).toBeDefined();
  });

  it('should skip worker and cron services in routing', () => {
    const services = [
      {
        name: 'worker',
        type: 'worker' as const,
        workspace: '.',
        routePrefix: '/',
        entrypoint: 'worker.py',
        builder: { src: 'worker.py', use: '@vercel/python' },
        topic: 'tasks',
        consumer: 'processor',
        isStaticBuild: false,
      },
      {
        name: 'cron',
        type: 'cron' as const,
        workspace: '.',
        routePrefix: '/',
        entrypoint: 'cron.ts',
        builder: { src: 'cron.ts', use: '@vercel/node' },
        schedule: '0 * * * *',
        isStaticBuild: false,
      },
    ];
    const routes = generateServicesRoutes(services);

    expect(routes.rewrites).toHaveLength(0);
    expect(routes.defaults).toHaveLength(0);
  });

  it('should sort routes by prefix length (longest first)', () => {
    const services = [
      {
        name: 'short',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/api',
        builder: { src: 'short/index.ts', use: '@vercel/node' },
        isStaticBuild: false,
      },
      {
        name: 'long',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/api/v1/users',
        builder: { src: 'long/index.ts', use: '@vercel/node' },
        isStaticBuild: false,
      },
      {
        name: 'root',
        type: 'web' as const,
        workspace: '.',
        routePrefix: '/',
        builder: { src: 'root/index.ts', use: '@vercel/node' },
        isStaticBuild: false,
      },
    ];
    const routes = generateServicesRoutes(services);

    // Longest prefix should come first in rewrites
    expect(routes.rewrites[0].dest).toBe('/long/index.ts');
    expect(routes.rewrites[1].dest).toBe('/short/index.ts');
    // Root should be in defaults, not rewrites
    expect(routes.defaults[0].dest).toBe('/root/index.ts');
  });
});
