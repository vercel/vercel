import { detectServices } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectServices', () => {
  describe('with no vercel.json', () => {
    it('should return empty services', async () => {
      const fs = new VirtualFilesystem({});
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('with vercel.json without experimentalServices', () => {
    it('should return empty services', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          buildCommand: 'npm run build',
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([]);
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
            app: {},
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
            app: {},
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
    it('should return empty result for invalid JSON', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': 'not valid json',
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('with experimentalServiceGroups', () => {
    it('should detect services within a service group', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServiceGroups: {
            backend: {
              services: {
                api: {
                  entrypoint: 'api/index.ts',
                  type: 'web',
                },
                worker: {
                  type: 'worker',
                  entrypoint: 'worker.py',
                  topic: 'tasks',
                },
              },
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);

      const api = result.services.find(s => s.name === 'api');
      expect(api).toMatchObject({
        name: 'api',
        type: 'web',
        group: 'backend',
        entrypoint: 'api/index.ts',
      });

      const worker = result.services.find(s => s.name === 'worker');
      expect(worker).toMatchObject({
        name: 'worker',
        type: 'worker',
        group: 'backend',
        topic: 'tasks',
      });
    });

    it('should detect services across multiple groups', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServiceGroups: {
            frontend: {
              services: {
                web: {
                  framework: 'nextjs',
                  workspace: 'apps/web',
                },
              },
            },
            backend: {
              services: {
                api: {
                  entrypoint: 'src/server.ts',
                },
              },
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);

      const web = result.services.find(s => s.name === 'web');
      expect(web?.group).toBe('frontend');

      const api = result.services.find(s => s.name === 'api');
      expect(api?.group).toBe('backend');
    });

    it('should return error for service group without services field', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServiceGroups: {
            invalid: {},
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_SERVICE_GROUP',
        message: 'Service group "invalid" is missing required "services" field',
      });
    });

    it('should validate cron services within groups', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServiceGroups: {
            scheduled: {
              services: {
                cleanup: {
                  type: 'cron',
                  entrypoint: 'cron/cleanup.ts',
                  // missing schedule
                },
              },
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

  describe('with both experimentalServices and experimentalServiceGroups', () => {
    it('should detect services from both sources', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            standalone: {
              entrypoint: 'standalone.ts',
            },
          },
          experimentalServiceGroups: {
            grouped: {
              services: {
                api: {
                  entrypoint: 'api/index.ts',
                },
              },
            },
          },
        }),
      });
      const result = await detectServices({ fs });

      expect(result.services).toHaveLength(2);
      expect(result.errors).toEqual([]);

      const standalone = result.services.find(s => s.name === 'standalone');
      expect(standalone).toMatchObject({
        name: 'standalone',
        entrypoint: 'standalone.ts',
      });
      expect(standalone?.group).toBeUndefined();

      const api = result.services.find(s => s.name === 'api');
      expect(api).toMatchObject({
        name: 'api',
        group: 'grouped',
        entrypoint: 'api/index.ts',
      });
    });
  });
});
