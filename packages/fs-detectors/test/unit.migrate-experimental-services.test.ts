import { convertRewrites, isHandler } from '@vercel/routing-utils';
import type { HasField, Rewrite } from '@vercel/routing-utils';
import {
  detectServices,
  hasLegacyServicesConfig,
  migrateExperimentalServices,
  planExperimentalServicesMigration,
} from '../src';
import type {
  ExperimentalService,
  ExperimentalServicesMigrationPlan,
  LegacyServicesConfig,
  ServiceBinding,
} from '../src';
import VirtualFilesystem from './virtual-file-system';

function app(dir: string, framework = 'next'): Record<string, string> {
  return {
    [`${dir}/package.json`]: JSON.stringify({
      dependencies: { [framework]: framework === 'next' ? '15.0.0' : '6.0.0' },
    }),
  };
}

async function migrate(
  config: LegacyServicesConfig,
  files: Record<string, string>,
  errors: string[] = []
) {
  const fs = new VirtualFilesystem({
    ...files,
    'vercel.json': JSON.stringify(config),
  });
  const plan = await migrateExperimentalServices({ fs });
  expect(codes(plan.errors)).toEqual(errors);
  return plan;
}

function codes(notes: Array<{ code: string }>): string[] {
  return notes.map(n => n.code);
}

function warnings(plan: ExperimentalServicesMigrationPlan, code: string) {
  return plan.warnings.filter(note => note.code === code);
}

function binding(service: string, env: string): ServiceBinding {
  return { type: 'service', service, format: 'url', env };
}

// Match generated terminal handoffs after real rewrite compilation. This only
// models their host conditions and routing path, not the service's app runtime.
function routeToService(rewrites: Rewrite[], pathname: string, host: string) {
  const matchesHost = (condition: HasField[number]) => {
    if (condition.type !== 'host' || typeof condition.value !== 'object') {
      throw new Error('Unexpected condition in generated service rewrite');
    }
    const { pre, suf } = condition.value;
    return (!pre || host.startsWith(pre)) && (!suf || host.endsWith(suf));
  };
  for (const route of convertRewrites(rewrites)) {
    if (isHandler(route)) continue;
    const match = new RegExp(route.src).exec(pathname);
    if (
      !match ||
      !(route.has ?? []).every(matchesHost) ||
      (route.missing ?? []).some(matchesHost)
    ) {
      continue;
    }
    if (typeof route.destination !== 'object') {
      throw new Error('Expected a terminal service handoff');
    }
    return {
      service: route.destination.service,
      path:
        route.destination.path?.replace(
          /\$(\d+)/g,
          (_: string, index: string) => match[Number(index)] ?? ''
        ) ?? pathname,
    };
  }
  return undefined;
}

describe('hasLegacyServicesConfig', () => {
  it('detects experimentalServices and the deprecated V2 alias', () => {
    expect(hasLegacyServicesConfig({ experimentalServices: { a: {} } })).toBe(
      true
    );
    expect(
      hasLegacyServicesConfig({ experimentalServicesV2: { a: { root: '.' } } })
    ).toBe(true);
    expect(hasLegacyServicesConfig({ services: { a: { root: '.' } } })).toBe(
      false
    );
    expect(hasLegacyServicesConfig({ experimentalServices: {} })).toBe(false);
    expect(hasLegacyServicesConfig(null)).toBe(false);
  });
});

describe('migrateExperimentalServices', () => {
  it('reuses resolved services without mutating the input', async () => {
    const config = {
      experimentalServices: {
        Api: { entrypoint: 'main.py', routePrefix: '/' },
      },
    };
    const fs = new VirtualFilesystem({ 'main.py': 'app = None' });
    const configuredFs = new VirtualFilesystem({
      'main.py': 'app = None',
      'vercel.json': JSON.stringify(config),
    });
    const detected = await detectServices({ fs: configuredFs });
    expect(detected.errors).toEqual([]);
    const resolvedServices = detected.services as ExperimentalService[];
    const original = structuredClone({ config, resolvedServices });
    const plan = planExperimentalServicesMigration(config, resolvedServices);
    expect(
      await migrateExperimentalServices({ fs, config, resolvedServices })
    ).toEqual(plan);
    expect({ config, resolvedServices }).toEqual(original);
  });

  it('migrates Next.js + FastAPI with a prefix', async () => {
    const plan = await migrate(
      {
        experimentalServices: {
          frontend: {
            entrypoint: 'apps/web',
            framework: 'nextjs',
            routePrefix: '/',
            buildCommand: 'bun run build',
          },
          api: {
            entrypoint: 'backend/api/main.py',
            routePrefix: '/svc/api',
          },
        },
      },
      {
        ...app('apps/web'),
        'backend/api/main.py': 'app = None',
        'backend/pyproject.toml': '[project]\nname = "backend"',
      }
    );
    expect(plan.removeKeys).toEqual(['experimentalServices']);
    expect(plan.unmigrated).toEqual([]);
    expect(plan.patch.services).toEqual({
      frontend: {
        root: 'apps/web',
        framework: 'nextjs',
        buildCommand: 'bun run build',
        bindings: [binding('api', 'API_URL')],
      },
      api: {
        root: 'backend',
        entrypoint: 'api/main.py',
        rewrites: [{ source: '/svc/api/:path(.*)?', destination: '/:path' }],
        bindings: [binding('frontend', 'FRONTEND_URL')],
      },
    });
    expect(plan.patch.rewrites).toEqual([
      { source: '/svc/api(/.*)?', destination: { service: 'api' } },
      { source: '/(.*)', destination: { service: 'frontend' } },
    ]);
    expect(plan.patch.build?.env).toEqual({
      NEXT_PUBLIC_FRONTEND_URL: '/',
      NEXT_PUBLIC_API_URL: '/svc/api',
    });
    expect(warnings(plan, 'CLIENT_SIDE_SERVICE_URL')).toEqual([]);
    expect(codes(plan.warnings)).toEqual(
      expect.arrayContaining(['PREFIX_STRIP', 'IMPLICIT_URL_TO_BINDING'])
    );
  });

  it('preserves prefix ownership and Next.js basePath on subdomain hosts', async () => {
    const plan = await migrate(
      {
        experimentalServices: {
          web: { entrypoint: 'web', routePrefix: '/' },
          dashboard: {
            entrypoint: 'dashboard',
            routePrefix: '/dashboard',
            subdomain: 'app',
          },
          docs: { entrypoint: 'docs', subdomain: 'docs' },
          assets: {
            entrypoint: 'assets/index.ts',
            mount: { subdomain: 'assets' },
          },
          api: {
            entrypoint: 'api/main.py',
            routePrefix: '/api',
            subdomain: 'api',
          },
          admin: { entrypoint: 'admin/main.py', routePrefix: '/api/admin' },
        },
      },
      {
        ...app('web'),
        ...app('dashboard'),
        ...app('docs'),
        'dashboard/next.config.js':
          'module.exports = { basePath: "/dashboard" }',
        'docs/next.config.js': 'module.exports = { basePath: "/_/docs" }',
        'api/main.py': 'app = None',
        'admin/main.py': 'app = None',
        'assets/index.ts': 'export default {}',
        'assets/package.json': '{}',
      }
    );

    expect(plan.patch.services.dashboard.rewrites).toBeUndefined();
    expect(plan.patch.services.docs.rewrites).toBeUndefined();
    expect(plan.patch.services.assets.rewrites).toEqual([
      { source: '/_/assets/:path(.*)?', destination: '/:path' },
    ]);
    expect(codes(plan.warnings)).toContain('NEXT_SUBPATH');
    const appHost = 'app.example.com';
    const apiHost = 'api.example.com';
    const cases = [
      [appHost, '/', 'dashboard', '/dashboard'],
      [
        appHost,
        '/settings/profile',
        'dashboard',
        '/dashboard/settings/profile',
      ],
      [appHost, '/dashboard', 'dashboard', '/dashboard'],
      [appHost, '/dashboard/', 'dashboard', '/dashboard/'],
      [appHost, '/dashboard/settings', 'dashboard', '/dashboard/settings'],
      [appHost, '/api', 'api', '/api'],
      [appHost, '/api/', 'api', '/api/'],
      [appHost, '/api/users', 'api', '/api/users'],
      [appHost, '/api/admin/users', 'admin', '/api/admin/users'],
      [appHost, '/apiary', 'dashboard', '/dashboard/apiary'],
      [apiHost, '/', 'api', '/'],
      [apiHost, '/users', 'api', '/users'],
      [apiHost, '/dashboard/settings', 'dashboard', '/dashboard/settings'],
      ['docs.example.com', '/', 'docs', '/_/docs'],
      ['docs.example.com', '/guide', 'docs', '/_/docs/guide'],
      [appHost, '/_/docs/guide', 'docs', '/_/docs/guide'],
      ['assets.example.com', '/', 'assets', '/'],
      [appHost, '/_/assets/file', 'assets', '/_/assets/file'],
      ['example.com', '/settings', 'web', '/settings'],
      ['app.preview.vercel.app', '/settings', 'web', '/settings'],
      ['app.preview.vercel.dev', '/settings', 'web', '/settings'],
      [
        'app.preview.vercel.app',
        '/dashboard/settings',
        'dashboard',
        '/dashboard/settings',
      ],
    ];
    for (const [host, pathname, service, path] of cases) {
      expect({
        host,
        pathname,
        ...routeToService(plan.patch.rewrites, pathname, host),
      }).toEqual({
        host,
        pathname,
        service,
        path,
      });
    }
  });

  it.each([
    'python',
    'nextjs',
    'vite',
  ])('preserves a single %s service and warns about its implicit self URLs', async framework => {
    const python = framework === 'python';
    const plan = await migrate(
      {
        experimentalServices: {
          'Web-App': python
            ? { entrypoint: 'backend.main:app', routePrefix: '/' }
            : { entrypoint: 'web', framework, routePrefix: '/web' },
        },
      },
      python
        ? { 'backend/main.py': 'app = None', 'requirements.txt': 'fastapi' }
        : app('web', framework === 'nextjs' ? 'next' : 'vite')
    );
    expect(plan.renamedServices).toEqual([{ from: 'Web-App', to: 'web-app' }]);
    expect(plan.patch.services['web-app'].bindings).toBeUndefined();
    expect(warnings(plan, 'SELF_SERVICE_URL_DROPPED')).toEqual([
      expect.objectContaining({ serviceName: 'Web-App' }),
    ]);
    if (python) {
      expect(plan.patch.services['web-app']).toEqual({
        root: '.',
        entrypoint: 'backend.main:app',
      });
      expect(plan.patch.rewrites).toEqual([
        { source: '/(.*)', destination: { service: 'web-app' } },
      ]);
      expect(codes(plan.warnings)).toEqual(['SELF_SERVICE_URL_DROPPED']);
    } else {
      const prefix = framework === 'nextjs' ? 'NEXT_PUBLIC_' : 'VITE_';
      expect(plan.patch.build?.env).toEqual({
        [`${prefix}WEB_APP_URL`]: '/web',
      });
      expect(warnings(plan, 'CLIENT_SIDE_SERVICE_URL')).toEqual([]);
    }
  });

  it('adds a strip rewrite and SPA fallback for static builds on a subpath', async () => {
    const plan = await migrate(
      {
        experimentalServices: {
          web: { entrypoint: 'apps/web', framework: 'vite', routePrefix: '/' },
          admin: {
            entrypoint: 'apps/admin',
            framework: 'vite',
            routePrefix: '/admin',
            env: { ROOT_URL: { type: 'service-ref', service: 'web' } },
          },
        },
      },
      { ...app('apps/web', 'vite'), ...app('apps/admin', 'vite') }
    );

    expect(plan.patch.services.web.rewrites).toEqual([
      { source: '/(.*)', destination: '/index.html' },
    ]);
    expect(plan.patch.services.admin.rewrites).toEqual([
      { source: '/admin/:path(.*)?', destination: '/:path' },
      { source: '/:path*', destination: '/index.html' },
    ]);
    // Static services use build.env for public URLs, not runtime bindings.
    expect(plan.patch.services.web.bindings).toBeUndefined();
    expect(plan.patch.services.admin.bindings).toBeUndefined();
    expect(plan.patch.build?.env).toEqual({
      VITE_WEB_URL: '/',
      VITE_ADMIN_URL: '/admin',
    });
    expect(codes(plan.warnings)).not.toContain('IMPLICIT_URL_TO_BINDING');
    expect(codes(plan.warnings)).toContain('STATIC_SUBPATH');
    expect(
      warnings(plan, 'CLIENT_SIDE_SERVICE_URL').find(
        w => w.serviceName === 'admin'
      )?.message
    ).toContain('`ROOT_URL="/"`');
  });

  it('converts server refs to bindings and public refs to build.env', async () => {
    const plan = await migrate(
      {
        experimentalServices: {
          frontend: {
            entrypoint: 'frontend',
            framework: 'nextjs',
            routePrefix: '/',
            env: {
              API_BASE_URL: { type: 'service-ref', service: 'backend' },
              FRONTEND_URL: { type: 'service-ref', service: 'backend' },
              NEXT_PUBLIC_API_BASE_URL: {
                type: 'service-ref',
                service: 'backend',
              },
            },
          },
          backend: { entrypoint: 'backend/main.py', routePrefix: '/_/backend' },
        },
      },
      {
        ...app('frontend'),
        'backend/main.py': 'app = None',
        'backend/requirements.txt': 'fastapi',
      }
    );

    expect(plan.patch.services.frontend.bindings).toEqual([
      binding('backend', 'API_BASE_URL'),
      binding('backend', 'FRONTEND_URL'),
      binding('backend', 'BACKEND_URL'),
    ]);
    expect(plan.patch.build?.env).toEqual({
      NEXT_PUBLIC_API_BASE_URL: '/_/backend',
      NEXT_PUBLIC_FRONTEND_URL: '/',
      NEXT_PUBLIC_BACKEND_URL: '/_/backend',
    });
    expect(warnings(plan, 'CLIENT_SIDE_SERVICE_URL')).toEqual([]);
    // An explicit variable wins over the consumer's implicit self URL.
    expect(
      warnings(plan, 'SELF_SERVICE_URL_DROPPED').map(w => w.serviceName)
    ).toEqual(['backend']);
  });

  it.each([
    undefined,
    '',
    '/custom',
  ])('handles shared public URL aliases with existing value %s', async existing => {
    const plan = await migrate(
      {
        build: {
          env:
            existing === undefined ? {} : { NEXT_PUBLIC_SHARED_URL: existing },
        },
        experimentalServices: {
          web: {
            entrypoint: 'web',
            routePrefix: '/',
            env: {
              NEXT_PUBLIC_SHARED_URL: { type: 'service-ref', service: 'web' },
            },
          },
          other: {
            entrypoint: 'other',
            routePrefix: '/other',
            env: {
              NEXT_PUBLIC_SHARED_URL: { type: 'service-ref', service: 'other' },
            },
          },
        },
      },
      { ...app('web'), ...app('other') },
      existing === undefined ? ['CONFLICTING_BUILD_ENV'] : []
    );
    if (existing !== undefined) {
      expect(plan.patch.build?.env).toEqual({
        NEXT_PUBLIC_WEB_URL: '/',
        NEXT_PUBLIC_OTHER_URL: '/other',
      });
    }
  });

  it('binds every supported web-to-web pair, with manual guidance for other consumers', async () => {
    const plan = await migrate(
      {
        experimentalServices: {
          web: { entrypoint: 'web', routePrefix: '/' },
          node: { entrypoint: 'node/index.ts', mount: '/node' },
          python: { entrypoint: 'python/main.py', routePrefix: '/python' },
          ruby: { entrypoint: 'ruby/main.rb', routePrefix: '/ruby' },
          container: {
            root: 'container',
            entrypoint: 'Dockerfile',
            runtime: 'container',
            routePrefix: '/container',
            command: ['serve'],
            maxDuration: 60,
          },
          go: { entrypoint: 'go/main.go', routePrefix: '/go' },
          rust: { entrypoint: 'rust/src/main.rs', routePrefix: '/rust' },
          static: {
            entrypoint: 'static',
            framework: 'vite',
            routePrefix: '/static',
          },
        },
      },
      {
        ...app('web'),
        ...app('static', 'vite'),
        'node/index.ts': 'export default {}',
        'python/main.py': 'app = None',
        'ruby/main.rb': 'run ->(env) { [200, {}, ["ok"]] }',
        'container/Dockerfile': 'FROM alpine',
        'go/main.go': 'package main',
        'go/go.mod': 'module api',
        'rust/src/main.rs': 'fn main() {}',
        'rust/Cargo.toml': '[package]\nname = "api"\nversion = "0.1.0"\n',
      }
    );
    const names = [
      'web',
      'node',
      'python',
      'ruby',
      'container',
      'go',
      'rust',
      'static',
    ];
    expect(Object.keys(plan.patch.services).sort()).toEqual([...names].sort());
    for (const name of names) {
      const expected = ['go', 'rust', 'static'].includes(name)
        ? undefined
        : names
            .filter(target => target !== name)
            .map(target => binding(target, `${target.toUpperCase()}_URL`));
      expect(plan.patch.services[name].bindings).toEqual(expected);
    }
    expect(
      warnings(plan, 'BINDINGS_UNSUPPORTED_RUNTIME')
        .map(w => w.serviceName)
        .sort()
    ).toEqual(['go', 'rust']);
    expect(
      warnings(plan, 'SELF_SERVICE_URL_DROPPED')
        .map(w => w.serviceName)
        .sort()
    ).toEqual([...names].sort());
    expect(plan.patch.services.container.command).toEqual(['serve']);
    expect(plan.patch.services.container.functions).toBeUndefined();
    expect(codes(plan.warnings)).toContain('FUNCTION_CONFIG_DROPPED');
  });

  it('drops non-web services before output-name validation, even when listed first', async () => {
    const web: NonNullable<LegacyServicesConfig['experimentalServices']> = {
      web: {
        entrypoint: 'web',
        framework: 'nitro',
        routePrefix: '/',
      },
      experience: {
        entrypoint: 'backend/main.py',
        framework: 'fastapi',
        routePrefix: '/svc/experience',
      },
    };
    const entrypoint = 'backend/jobs.py';
    const nonWeb: NonNullable<LegacyServicesConfig['experimentalServices']> = {
      worker2: { type: 'worker', entrypoint, topics: ['events'] },
      cron2: { type: 'cron', entrypoint, schedule: '0 0 * * *' },
      job2: { type: 'job', trigger: 'workflow', entrypoint },
      Web: { type: 'worker', entrypoint, topics: ['events'] },
    };
    const plan = await migrate(
      {
        rewrites: [{ source: '/old', destination: '/svc/experience' }],
        experimentalServiceGroups: { all: ['web', 'experience'] },
        experimentalServices: { ...nonWeb, ...web },
      },
      {
        ...app('web', 'nitropack'),
        'backend/pyproject.toml': '[project]\nname = "experience"',
        'backend/main.py': 'app = None',
        'backend/jobs.py': 'def run(): pass',
      }
    );
    expect(Object.keys(plan.patch.services)).toEqual(['web', 'experience']);
    expect(plan.renamedServices).toEqual([]);
    expect(plan.unmigrated.map(note => note.serviceName).sort()).toEqual(
      Object.keys(nonWeb).sort()
    );
    expect(codes(plan.unmigrated)).toEqual(
      Array(4).fill('UNSUPPORTED_SERVICE_TYPE')
    );
    for (const [serviceName, guidance] of [
      ['worker2', '[[tool.vercel.subscribers]]'],
      ['cron2', 'crons'],
      ['job2', '[[tool.vercel.workflows]]'],
    ]) {
      expect(plan.unmigrated).toContainEqual(
        expect.objectContaining({
          serviceName,
          message: expect.stringContaining(guidance),
        })
      );
    }
    // Existing rewrites stay with the caller; only generated rewrites are returned.
    expect(plan.patch.rewrites).toEqual([
      {
        source: '/svc/experience(/.*)?',
        destination: { service: 'experience' },
      },
      { source: '/(.*)', destination: { service: 'web' } },
    ]);
    expect(codes(plan.warnings)).toEqual(
      expect.arrayContaining(['EXISTING_REWRITES', 'SERVICE_GROUPS_DROPPED'])
    );
    expect(plan.removeKeys).toContain('experimentalServiceGroups');
  });

  it('errors when top-level build settings have no root service to move into', async () => {
    await migrate(
      {
        buildCommand: 'make',
        experimentalServices: {
          web: { entrypoint: 'web', framework: 'nextjs', routePrefix: '/' },
        },
      },
      app('web'),
      ['TOP_LEVEL_SETTING_WITHOUT_ROOT_SERVICE']
    );
  });

  it('moves build settings into the root service, retaining overrides and warnings', async () => {
    const plan = await migrate(
      {
        framework: 'services',
        installCommand: 'uv sync',
        buildCommand: 'overridden',
        devCommand: null,
        functions: {
          'main.py': { maxDuration: 60 },
          'api/**': { maxDuration: 30 },
        },
        experimentalServices: {
          api: {
            entrypoint: 'main.py',
            routePrefix: '/',
            builder: '@vercel/python',
            workspace: '.',
            buildCommand: 'uv sync',
            preDeployCommand: 'python manage.py migrate',
            maxDuration: 300,
            memory: 1024,
            includeFiles: 'templates/**',
            excludeFiles: ['tests/**'],
          },
        },
      },
      { 'main.py': 'app = None', 'requirements.txt': 'django' }
    );

    expect(plan.patch.services.api).toEqual({
      root: '.',
      entrypoint: 'main.py',
      installCommand: 'uv sync',
      buildCommand: 'uv sync && python manage.py migrate',
      functions: {
        'main.py': {
          maxDuration: 300,
          includeFiles: 'templates/**',
          excludeFiles: ['tests/**'],
        },
        'api/**': { maxDuration: 30 },
      },
    });
    expect(plan.removeKeys).toEqual([
      'experimentalServices',
      'functions',
      'installCommand',
      'buildCommand',
      'devCommand',
      'framework',
    ]);
    expect(plan.movedTopLevelKeys).toEqual([
      { key: 'functions', service: 'api' },
      { key: 'installCommand', service: 'api' },
      { key: 'devCommand', service: 'api' },
    ]);
    expect(codes(plan.warnings)).toEqual(
      expect.arrayContaining([
        'PRE_DEPLOY_COMMAND_FOLDED',
        'MEMORY_DROPPED',
        'TOP_LEVEL_SETTING_CONFLICT',
        'BUILDER_DROPPED',
        'WORKSPACE_REPLACED',
      ])
    );
  });

  it.each([
    'api2',
    'web',
  ])('rejects invalid or colliding web names: %s', async name => {
    const code =
      name === 'api2' ? 'INVALID_SERVICE_NAME' : 'DUPLICATE_SERVICE_NAME';
    const plan = await migrate(
      {
        experimentalServices: {
          Web: { entrypoint: 'web', routePrefix: '/' },
          [name]: { entrypoint: 'main.py', routePrefix: '/api' },
        },
      },
      { ...app('web'), 'main.py': 'app = None' },
      [code]
    );
    expect(plan.errors[0].serviceName).toBe(name);
    expect(plan.patch).toEqual({ services: {}, rewrites: [] });
  });

  it('renames experimentalServicesV2 to services without changes', () => {
    const services = {
      web: { root: 'web', framework: 'nextjs' },
      api: { root: 'api', entrypoint: 'main:app' },
    };
    const plan = planExperimentalServicesMigration(
      { experimentalServicesV2: services, rewrites: [] },
      []
    );
    expect(plan.errors).toEqual([]);
    expect(plan.patch.services).toEqual(services);
    expect(plan.patch.rewrites).toEqual([]);
    expect(plan.removeKeys).toEqual(['experimentalServicesV2']);
    expect(plan.warnings).toEqual([]);
  });

  const legacy = {
    experimentalServices: { web: { entrypoint: 'old', routePrefix: '/' } },
  };
  const released = { services: { web: { root: 'new' } } };
  const alias = { experimentalServicesV2: { web: { root: 'alias' } } };
  it.each([
    { ...released, ...legacy },
    { ...released, ...alias },
    { ...legacy, ...alias },
    { services: {}, ...legacy },
    { ...legacy, experimentalServicesV2: {} },
    { ...released, ...legacy, ...alias },
  ])('rejects conflicting service configurations without changes: %j', async config => {
    const original = JSON.parse(JSON.stringify(config));
    const plan = planExperimentalServicesMigration(config, []);
    expect(codes(plan.errors)).toEqual(['CONFLICTING_SERVICES_CONFIG']);
    expect(plan.patch).toEqual({ services: {}, rewrites: [] });
    expect(plan.removeKeys).toEqual([]);
    // Conflicts must be reported before attempting to resolve either config.
    const fromFs = await migrateExperimentalServices({
      fs: new VirtualFilesystem({ 'vercel.json': JSON.stringify(config) }),
    });
    expect(fromFs).toEqual(plan);
    expect(config).toEqual(original);
  });

  it('keeps runtime and missing-ref guidance non-blocking for already-resolved input', () => {
    const plan = planExperimentalServicesMigration(
      {
        experimentalServices: {
          api: {
            runtime: 'python3.14',
            env: { MISSING_URL: { type: 'service-ref', service: 'missing' } },
          },
        },
      },
      [
        {
          schema: 'experimentalServices',
          name: 'api',
          type: 'web',
          workspace: '.',
          entrypoint: 'main.py',
          builder: { use: '@vercel/python', src: 'main.py' },
        },
      ]
    );
    expect(plan.errors).toEqual([]);
    expect(plan.patch.services.api).toEqual({
      root: '.',
      entrypoint: 'main.py',
    });
    expect(codes(plan.warnings)).toContain('RUNTIME_DROPPED');
    expect(codes(plan.warnings)).toContain('SERVICE_REF_DROPPED');
  });

  it('reports an error when nothing legacy is configured', () => {
    const plan = planExperimentalServicesMigration(
      { services: { api: { root: '.' } } },
      []
    );
    expect(plan.errors).toEqual([
      expect.objectContaining({ code: 'NO_LEGACY_SERVICES' }),
    ]);
  });
});
