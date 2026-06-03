import { detectServices, isStaticBuild, isRouteOwningBuilder } from '../src';
import type { ExperimentalServiceV2 } from '../src';
import VirtualFilesystem from './virtual-file-system';

function vercelJson(config: object): string {
  return JSON.stringify(config);
}

function servicesV2(services: { schema: string }[]): ExperimentalServiceV2[] {
  return services.filter(
    (s): s is ExperimentalServiceV2 => s.schema === 'experimentalServicesV2'
  );
}

describe('detectServices (experimentalServicesV2)', () => {
  it('resolves a node backend framework service to @vercel/backends', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          api: { root: 'api', framework: 'express' },
        },
      }),
      'api/package.json': JSON.stringify({
        dependencies: { express: '4.0.0' },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    expect(result.source).toBe('configured');
    expect(result.useImplicitEnvInjection).toBe(false);
    expect(result.services).toHaveLength(1);

    const [api] = servicesV2(result.services);
    expect(api).toMatchObject({
      schema: 'experimentalServicesV2',
      name: 'api',
      root: 'api',
      framework: 'express',
      runtime: 'node',
    });
    expect(api.builder.use).toBe('@vercel/backends');
    expect(api.builder.src).toBe('api/index.js');
  });

  it('resolves a runtime + file entrypoint service to the runtime builder', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          worker: { root: 'svc', runtime: 'python', entrypoint: 'main.py' },
        },
      }),
      'svc/main.py': 'print("hi")',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [worker] = servicesV2(result.services);
    expect(worker).toMatchObject({
      schema: 'experimentalServicesV2',
      name: 'worker',
      root: 'svc',
      runtime: 'python',
      entrypoint: 'main.py',
    });
    expect(worker.builder.use).toBe('@vercel/python');
    expect(worker.builder.src).toBe('svc/main.py');
  });

  it('returns empty routes for V2', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          api: { root: 'api', framework: 'express' },
        },
      }),
      'api/package.json': '{}',
    });

    const result = await detectServices({ fs });

    expect(result.routes).toEqual({
      hostRewrites: [],
      rewrites: [],
      defaults: [],
      fallbacks: [],
      crons: [],
      workers: [],
    });
  });

  it('carries bindings, functions and route tables', async () => {
    const functions = { 'api/**': { memory: 1024 } };
    const routes = [{ src: '/health', dest: '/health' }];
    const rewrites = [{ source: '/old', destination: '/new' }];
    const headers = [
      { source: '/(.*)', headers: [{ key: 'x-svc', value: '1' }] },
    ];
    const bindings = [
      { type: 'service', service: 'api', format: 'url', env: 'API_URL' },
    ];

    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          web: {
            root: 'apps/web',
            framework: 'express',
            installCommand: 'npm ci',
            buildCommand: 'npm run build',
            devCommand: 'npm run dev',
            ignoreCommand: 'exit 0',
            outputDirectory: 'dist',
            bindings,
            functions,
            routes,
            rewrites,
            headers,
            cleanUrls: true,
            trailingSlash: false,
          },
          api: { root: 'api', framework: 'express' },
        },
      }),
      'apps/web/package.json': '{}',
      'api/package.json': '{}',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const services = servicesV2(result.services);
    const web = services.find(s => s.name === 'web');
    expect(web).toMatchObject({
      installCommand: 'npm ci',
      buildCommand: 'npm run build',
      devCommand: 'npm run dev',
      ignoreCommand: 'exit 0',
      outputDirectory: 'dist',
      bindings,
      functions,
      routes,
      rewrites,
      headers,
      cleanUrls: true,
      trailingSlash: false,
    });
  });

  it('resolves a frontend framework to a route-owning builder', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          web: { root: 'web', framework: 'nextjs' },
        },
      }),
      'web/package.json': JSON.stringify({ dependencies: { next: 'latest' } }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [web] = servicesV2(result.services);
    expect(web).toMatchObject({ name: 'web', framework: 'nextjs' });
    expect(web.builder.use).toBe('@vercel/next');
    expect(isRouteOwningBuilder(web)).toBe(true);
  });

  it('resolves a static framework to @vercel/static-build', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          site: { root: 'site', framework: 'vite' },
        },
      }),
      'site/package.json': JSON.stringify({ dependencies: { vite: 'latest' } }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [site] = servicesV2(result.services);
    expect(site).toMatchObject({ name: 'site', framework: 'vite' });
    expect(site.builder.use).toBe('@vercel/static-build');
    expect(isStaticBuild(site)).toBe(true);
    // Static builds have no runtime.
    expect(site.runtime).toBeUndefined();
  });

  it('resolves a Python module:attr entrypoint to its underlying file', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          api: { root: 'api', runtime: 'python', entrypoint: 'main:app' },
        },
      }),
      'api/main.py': 'app = object()',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [api] = servicesV2(result.services);
    expect(api).toMatchObject({
      name: 'api',
      runtime: 'python',
      entrypoint: 'main.py',
    });
    expect(api.builder.use).toBe('@vercel/python');
    expect(api.builder.src).toBe('api/main.py');
    expect(api.builder.config).toMatchObject({ handlerFunction: 'app' });
  });

  it('resolves a service rooted at the project root (".")', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          api: { root: '.', framework: 'express' },
        },
      }),
      'package.json': JSON.stringify({ dependencies: { express: '4.0.0' } }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [api] = servicesV2(result.services);
    expect(api).toMatchObject({ name: 'api', root: '.', framework: 'express' });
    expect(api.builder.use).toBe('@vercel/backends');
    expect(api.builder.src).toBe('index.js');
  });

  it('resolves multiple services independently', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          web: { root: 'web', framework: 'nextjs' },
          api: { root: 'api', framework: 'express' },
        },
      }),
      'web/package.json': JSON.stringify({ dependencies: { next: 'latest' } }),
      'api/package.json': JSON.stringify({
        dependencies: { express: '4.0.0' },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const services = servicesV2(result.services);
    expect(services).toHaveLength(2);
    expect(services.every(s => s.schema === 'experimentalServicesV2')).toBe(
      true
    );
    expect(services.find(s => s.name === 'web')?.builder.use).toBe(
      '@vercel/next'
    );
    expect(services.find(s => s.name === 'api')?.builder.use).toBe(
      '@vercel/backends'
    );
  });

  it('reads experimentalServicesV2 from a nested workPath', async () => {
    const fs = new VirtualFilesystem({
      'app/vercel.json': vercelJson({
        experimentalServicesV2: {
          api: { root: 'api', framework: 'express' },
        },
      }),
      'app/api/package.json': '{}',
    });

    const result = await detectServices({ fs, workPath: 'app' });

    expect(result.errors).toEqual([]);
    expect(servicesV2(result.services)).toHaveLength(1);
  });

  describe('errors', () => {
    it('errors when root does not exist', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'missing', framework: 'express' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors[0]).toMatchObject({ code: 'ROOT_NOT_FOUND' });
    });

    it('errors when root is a file', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'file.txt', framework: 'express' },
          },
        }),
        'file.txt': 'x',
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'ROOT_NOT_DIRECTORY' });
    });

    it('errors when entrypoint does not exist', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'svc', runtime: 'python', entrypoint: 'nope.py' },
          },
        }),
        'svc/other.py': 'x',
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'ENTRYPOINT_NOT_FOUND' });
    });

    it('errors when a directory entrypoint has no resolvable framework', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'svc', runtime: 'python', entrypoint: 'pkg' },
          },
        }),
        'svc/pkg/__init__.py': '',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_FRAMEWORK',
      });
    });

    it('errors on an invalid framework', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: { a: { root: 'svc', framework: 'nope' } },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'INVALID_FRAMEWORK' });
    });

    it('errors on an invalid runtime', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'svc', runtime: 'cobol', entrypoint: 'x' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'INVALID_RUNTIME' });
    });

    it('errors on a runtime/framework mismatch', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: 'svc', runtime: 'python', framework: 'express' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'RUNTIME_FRAMEWORK_MISMATCH',
      });
    });

    it('errors when neither framework nor entrypoint is given', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: { a: { root: 'svc' } },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_CONFIG',
      });
    });

    it('errors when root is missing', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: { a: { framework: 'express' } },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'MISSING_ROOT' });
    });

    it('errors when root is an absolute path', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: { a: { root: '/etc', framework: 'express' } },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'INVALID_ROOT' });
    });

    it('errors when root escapes the project root', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            a: { root: '../outside', framework: 'express' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'INVALID_ROOT' });
    });

    it('errors on an invalid service name', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            '1bad': { root: 'svc', framework: 'express' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({ code: 'INVALID_SERVICE_NAME' });
    });

    it('reports errors per service and resolves the valid ones', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            ok: { root: 'ok', framework: 'express' },
            bad: { root: 'svc', runtime: 'cobol', entrypoint: 'x' },
          },
        }),
        'ok/package.json': '{}',
      });

      const result = await detectServices({ fs });

      expect(servicesV2(result.services).map(s => s.name)).toEqual(['ok']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_RUNTIME',
        serviceName: 'bad',
      });
    });

    it('errors when a binding references an unknown service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            web: {
              root: 'apps/web',
              framework: 'express',
              bindings: [
                { type: 'service', service: 'ghost', format: 'url', env: 'G' },
              ],
            },
          },
        }),
        'apps/web/package.json': '{}',
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'UNKNOWN_SERVICE_BINDING',
      });
    });
  });
});
