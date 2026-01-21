import { detectServices } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectServices', () => {
  describe('with no vercel.json (auto-detection)', () => {
    it('should return error when no manifests found', async () => {
      const fs = new VirtualFilesystem({});
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_MANIFESTS_FOUND');
    });

    it('should auto-detect service from package.json + entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({ name: 'my-app' }),
        'index.ts': 'export default app;',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'root',
        type: 'web',
        workspace: '.',
        entrypoint: 'index.ts',
        runtime: 'node',
      });
      expect(result.errors).toEqual([]);
    });

    it('should auto-detect Python service from pyproject.toml + entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'pyproject.toml': '[project]\nname = "my-app"',
        'main.py': 'app = FastAPI()',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'root',
        type: 'web',
        workspace: '.',
        entrypoint: 'main.py',
        runtime: 'python',
      });
      expect(result.errors).toEqual([]);
    });

    it('should error when multiple entrypoints at same level', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({ name: 'my-app' }),
        'pyproject.toml': '[project]\nname = "my-app"',
        'index.ts': 'export default app;',
        'main.py': 'app = FastAPI()',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CONFLICTING_SERVICES');
    });

    it('should auto-detect multiple services from different directories', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({ name: 'root' }),
        'index.ts': 'export default app;',
        'backend/pyproject.toml': '[project]\nname = "backend"',
        'backend/app.py': 'app = FastAPI()',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);

      const root = result.services.find(s => s.name === 'root');
      expect(root).toMatchObject({
        workspace: '.',
        entrypoint: 'index.ts',
        runtime: 'node',
      });

      const backend = result.services.find(s => s.name === 'backend');
      expect(backend).toMatchObject({
        workspace: 'backend',
        entrypoint: 'app.py',
        runtime: 'python',
      });
    });

    it('should return warning when manifest has no entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({ name: 'my-app' }),
        // No entrypoint file
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings![0].code).toBe('NO_ENTRYPOINT');
      // Should also have NO_SERVICES_DETECTED error since no services were created
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_DETECTED');
    });

    it('should return NO_SERVICES_DETECTED when all directories fail', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({ name: 'root' }),
        'backend/pyproject.toml': '[project]\nname = "backend"',
        // No entrypoints in either directory
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_DETECTED');
      // Should have warnings for each directory without entrypoints
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('with vercel.json without experimentalServices (auto-detection)', () => {
    it('should fall back to auto-detection', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          buildCommand: 'npm run build',
        }),
        'package.json': JSON.stringify({ name: 'my-app' }),
        'server.ts': 'export default app;',
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'root',
        entrypoint: 'server.ts',
      });
    });
  });

  describe('with experimentalServices', () => {
    it('should detect a single web service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'src/index.ts',
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
      });
      expect(result.errors).toEqual([]);
    });

    it('should detect multiple services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              workspace: 'apps/web',
              framework: 'nextjs',
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
      });

      const api = result.services.find(s => s.name === 'api');
      expect(api).toMatchObject({
        name: 'api',
        type: 'web',
        workspace: 'apps/api',
        entrypoint: 'src/server.ts',
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
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services[0].topic).toBeUndefined();
      expect(result.services[0].consumer).toBeUndefined();
    });

    it('should error when multiple web services omit routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'web/index.ts',
            },
            api: {
              entrypoint: 'api/index.ts',
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_ROOT_SERVICES');
    });

    it('should allow multiple web services when only one omits routePrefix', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'web/index.ts',
            },
            api: {
              entrypoint: 'api/index.ts',
              routePrefix: '/api',
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
  });

  describe('with workPath', () => {
    it('should read vercel.json from workPath', async () => {
      const fs = new VirtualFilesystem({
        'apps/web/vercel.json': JSON.stringify({
          experimentalServices: {
            frontend: {
              entrypoint: 'src/index.ts',
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

    it('should return error for invalid JSON even with valid manifest', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': 'not valid json',
        'package.json': JSON.stringify({ name: 'app' }),
        'index.ts': 'export default app;',
      });
      const result = await detectServices({ fs });

      // Invalid vercel.json is an error, not a fallback to auto-detection
      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_VERCEL_JSON');
    });
  });
});
