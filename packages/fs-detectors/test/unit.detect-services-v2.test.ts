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

describe('detectServices (services)', () => {
  it('resolves canonical services config to @vercel/backends', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
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

  it('rejects services together with its deprecated alias', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: { web: { root: 'web', framework: 'nextjs' } },
        experimentalServicesV2: {
          api: { root: 'api', framework: 'express' },
        },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.services).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SERVICES_AND_EXPERIMENTAL_SERVICES_V2',
      }),
    ]);
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

  describe('buildpack runtimes (VERCEL_EXPERIMENTAL_BUILDPACK_RUBY=1)', () => {
    beforeEach(() => {
      vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('resolves a Ruby runtime without an entrypoint to the buildpack container builder', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: {
              root: 'api',
              runtime: 'ruby',
            },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\ngem "puma"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        schema: 'experimentalServicesV2',
        name: 'api',
        root: 'api',
        framework: 'ruby',
        runtime: 'ruby',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'ruby',
          framework: 'ruby',
          workspace: 'api',
        },
      });
      expect(api).not.toHaveProperty('command');
    });

    // `command` is a container-only setting. It is rejected for every Ruby
    // service while the flag is on so it can never be dropped silently.
    it.each([
      ['runtime', { runtime: 'ruby' }, ['bundle', 'exec', 'puma']],
      ['framework', { framework: 'ruby' }, 'bundle exec puma'],
      ['detected framework', {}, 'bundle exec puma'],
      ['a .rb entrypoint', { entrypoint: 'app.rb' }, 'bundle exec puma'],
      [
        'runtime with a .ru entrypoint',
        { runtime: 'ruby', entrypoint: 'config.ru' },
        'bundle exec puma',
      ],
      ['runtime with empty string', { runtime: 'ruby' }, ''],
      ['runtime with empty argv', { runtime: 'ruby' }, []],
    ])('rejects a command for a Ruby service selected by %s', async (_, serviceConfig, command) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', ...serviceConfig, command },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\ngem "puma"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
        'api/app.rb': 'puts "hello"\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([
        {
          code: 'INVALID_COMMAND',
          message:
            'Service "api" can only specify "command" when using runtime "container".',
          serviceName: 'api',
        },
      ]);
    });

    it('rejects a command for a Ruby runtime service even without a Gemfile', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'ruby', command: 'bundle exec puma' },
          },
        }),
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'INVALID_COMMAND', serviceName: 'api' },
      ]);
    });

    it.each([
      [
        'runtime',
        { runtime: 'container' },
        'bundle exec puma',
        ['bundle exec puma'],
      ],
      [
        'Dockerfile entrypoint',
        { entrypoint: 'Dockerfile' },
        ['bundle', 'exec', 'puma'],
        ['bundle', 'exec', 'puma'],
      ],
      [
        'Ruby runtime with Dockerfile',
        { runtime: 'ruby', entrypoint: 'Dockerfile' },
        'bundle exec puma',
        ['bundle exec puma'],
      ],
    ])('preserves a container command selected by %s with Ruby buildpacks enabled', async (_, serviceConfig, command, expectedCommand) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', ...serviceConfig, command },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\n',
        'api/Dockerfile': 'FROM ruby:3.4\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        runtime: 'container',
        entrypoint: 'Dockerfile',
        command: expectedCommand,
        builder: {
          src: 'api/Dockerfile',
          use: '@vercel/container',
          config: { command: expectedCommand, workspace: 'api' },
        },
      });
      expect(api.builder.config).not.toHaveProperty('buildpack');
    });

    it.each([
      '.',
      'services/api',
    ])('builds a Gemfile-only Ruby runtime service at %s without a framework label', async root => {
      // An explicit runtime routes to the buildpack on its own. The `ruby`
      // preset needs `config.ru` too, so without one the framework label
      // (best-effort metadata) is simply absent.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root, runtime: 'ruby' },
          },
        }),
        [root === '.' ? 'Gemfile' : `${root}/Gemfile`]:
          'source "https://rubygems.org"\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        root,
        runtime: 'ruby',
        framework: undefined,
        entrypoint: undefined,
      });
      expect(api.builder).toMatchObject({
        src: root === '.' ? '<detect>' : `${root}/<detect>`,
        use: '@vercel/container',
        config: { buildpack: 'ruby' },
      });
      expect(api.builder.config).not.toHaveProperty('framework');
      expect(api).not.toHaveProperty('command');
      expect(api.builder.config).not.toHaveProperty('command');
    });

    it('requires the Gemfile at the service root, not in an ancestor', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'services/api', runtime: 'ruby' },
          },
        }),
        Gemfile: 'source "https://rubygems.org"\n',
        'services/Gemfile': 'source "https://rubygems.org"\n',
        'services/api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
      ]);
    });

    it('resolves a Rails app as the ruby framework for a Ruby runtime service', async () => {
      // There is no framework-level preset for buildpack runtimes: the
      // platform routes on the language and the buildpack classifies the app.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            web: { root: '.', runtime: 'ruby' },
          },
        }),
        Gemfile: 'source "https://rubygems.org"\ngem "rails"\n',
        'Gemfile.lock': 'GEM\n  specs:\n    rails (7.2.3.1)\n',
        'config.ru': 'run Rails.application\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [web] = servicesV2(result.services);
      expect(web.framework).toBe('ruby');
      expect(web.builder).toMatchObject({
        use: '@vercel/container',
        config: { buildpack: 'ruby', framework: 'ruby' },
      });
    });

    it('resolves an explicit Ruby framework without an entrypoint to buildpacks', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', framework: 'ruby' },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        framework: 'ruby',
        runtime: 'ruby',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          framework: 'ruby',
          buildpack: 'ruby',
          workspace: 'api',
        },
      });
    });

    it.each([
      [
        'a .ru entrypoint',
        { runtime: 'ruby', entrypoint: 'config.ru' },
        'config.ru',
      ],
      [
        'a normalized config.ru entrypoint',
        { runtime: 'ruby', entrypoint: './config.ru' },
        'config.ru',
      ],
      [
        'a framework with a .ru entrypoint',
        { framework: 'ruby', entrypoint: 'config.ru' },
        'config.ru',
      ],
    ])('resolves a Ruby service with %s to the buildpack container builder', async (_, serviceConfig, entrypoint) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', ...serviceConfig },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        runtime: 'ruby',
        framework: 'ruby',
        entrypoint,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          framework: 'ruby',
          buildpack: 'ruby',
          workspace: 'api',
        },
      });
    });

    it.each([
      [
        'a runtime-selected Ruby handler',
        { runtime: 'ruby', entrypoint: 'api/handler.rb' },
        'api/handler.rb',
      ],
      [
        'a framework-selected Ruby handler',
        { framework: 'ruby', entrypoint: 'api/handler.rb' },
        'api/handler.rb',
      ],
      [
        'an extension-inferred Ruby handler',
        { entrypoint: 'api/handler.rb' },
        'api/handler.rb',
      ],
      [
        'a custom Rack file',
        { runtime: 'ruby', entrypoint: 'custom.ru' },
        'custom.ru',
      ],
      [
        'a nested Rack file',
        { runtime: 'ruby', entrypoint: 'nested/config.ru' },
        'nested/config.ru',
      ],
    ])('preserves %s as the service entrypoint alongside a root Rack app', async (_, serviceConfig, entrypoint) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'backend/', ...serviceConfig },
          },
        }),
        'backend/Gemfile': 'source "https://rubygems.org"\ngem "puma"\n',
        'backend/config.ru': 'run ->(_env) { [200, {}, ["root app"]] }\n',
        [`backend/${entrypoint}`]: entrypoint.endsWith('.rb')
          ? 'Handler = Proc.new { |req, res| res.body = "function" }\n'
          : 'run ->(_env) { [200, {}, ["custom app"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api.entrypoint).toBe(entrypoint);
      expect(api.builder).toEqual({
        src: `backend/${entrypoint}`,
        use: '@vercel/ruby',
        config: {
          zeroConfig: true,
          framework: 'ruby',
          workspace: 'backend',
        },
      });
    });

    it.each([
      '.',
      'backend',
    ])('keeps an api/*.rb function service with a Gemfile at %s on @vercel/ruby', async root => {
      const prefix = root === '.' ? '' : `${root}/`;
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root, entrypoint: 'api/handler.rb' },
          },
        }),
        [`${prefix}Gemfile`]: 'source "https://rubygems.org"\ngem "cowsay"\n',
        [`${prefix}api/handler.rb`]:
          'Handler = Proc.new { |req, res| res.body = "ok" }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        runtime: 'ruby',
        entrypoint: 'api/handler.rb',
        builder: {
          src: `${prefix}api/handler.rb`,
          use: '@vercel/ruby',
        },
      });
      expect(api.builder.config).not.toHaveProperty('buildpack');
    });

    it('keeps a .rb entrypoint service without a Gemfile on @vercel/ruby', async () => {
      // The legacy runtime synthesizes a Gemfile; the buildpack needs one.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', entrypoint: 'handler.rb' },
          },
        }),
        'api/handler.rb': 'Handler = Proc.new { |req, res| res.body = "ok" }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        runtime: 'ruby',
        framework: undefined,
        entrypoint: 'handler.rb',
      });
      expect(api.builder).toMatchObject({
        src: 'api/handler.rb',
        use: '@vercel/ruby',
      });
      expect(api.builder.config).not.toHaveProperty('buildpack');
    });

    it('still requires an entrypoint for a Ruby runtime service without a Gemfile', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'ruby' },
          },
        }),
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
      ]);
    });

    it('rejects a misspelled file entrypoint before routing', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'ruby', entrypoint: 'confg.ru' },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'ENTRYPOINT_NOT_FOUND', serviceName: 'api' },
      ]);
    });

    it.each([
      '.',
      './',
    ])('accepts the directory entrypoint %s for a Ruby runtime service with a root Gemfile', async entrypoint => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'ruby', entrypoint },
          },
        }),
        'api/Gemfile': 'source "https://rubygems.org"\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({ runtime: 'ruby', entrypoint: undefined });
      expect(api.builder).toMatchObject({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'ruby', workspace: 'api' },
      });
    });

    it('does not borrow a Gemfile from a nested directory entrypoint', async () => {
      // The directory entrypoint is only a framework-detection workspace; the
      // build root stays the service root, which has no Gemfile here.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'ruby', entrypoint: 'app' },
          },
        }),
        'api/app/Gemfile': 'source "https://rubygems.org"\n',
        'api/app/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
      ]);
    });

    it.each([
      ['jekyll', '_config.yml', 'title: Blog\n'],
      ['middleman', 'config.rb', 'activate :directory_indexes\n'],
    ])('keeps an explicit %s framework on static-build despite a Ruby runtime hint', async (slug, configFile, configContents) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            docs: { root: 'docs', runtime: 'ruby', framework: slug },
          },
        }),
        'docs/Gemfile': `source "https://rubygems.org"\ngem "${slug}"\n`,
        [`docs/${configFile}`]: configContents,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [docs] = servicesV2(result.services);
      expect(docs).toMatchObject({ framework: slug, runtime: undefined });
      expect(docs.builder.use).toBe('@vercel/static-build');
      expect(docs.builder.config).not.toHaveProperty('buildpack');
    });

    it.each([
      '.',
      'services/api',
    ])('auto-detects a root-only Ruby service at %s from its Gemfile and config.ru', async root => {
      const prefix = root === '.' ? '' : `${root}/`;
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root },
          },
        }),
        [`${prefix}Gemfile`]: 'source "https://rubygems.org"\n',
        [`${prefix}config.ru`]: 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        root,
        framework: 'ruby',
        runtime: 'ruby',
        entrypoint: undefined,
      });
      expect(api.builder).toMatchObject({
        src: `${prefix}<detect>`,
        use: '@vercel/container',
        config: { buildpack: 'ruby', framework: 'ruby' },
      });
    });

    it.each([
      ['a bare Gemfile', { 'site/Gemfile': 'source "https://rubygems.org"\n' }],
      [
        'Rails markers without config.ru',
        {
          'site/Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
          'site/bin/rails': '',
          'site/config/application.rb': '',
        },
      ],
    ])('does not route a root-only service with %s to the buildpack', async (_, files) => {
      // Without `config.ru` nothing can boot the app (Rails and Rack alike
      // start from it), so the service falls through to the same static
      // fallback as any other undetectable root.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            site: { root: 'site' },
          },
        }),
        ...files,
        'site/index.html': '<h1>hello</h1>\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [site] = servicesV2(result.services);
      expect(site.framework).toBeUndefined();
      expect(site.runtime).toBeUndefined();
      expect(site.builder.use).toBe('@vercel/static');
      expect(site.builder.config).not.toHaveProperty('buildpack');
    });

    // Jekyll and Middleman sites carry a Gemfile too. Service detection must
    // still see exactly one framework, or it fails with
    // MULTIPLE_FRAMEWORKS_SERVICE.
    it.each([
      ['jekyll', '_config.yml', 'title: Blog\n'],
      ['middleman', 'config.rb', 'activate :directory_indexes\n'],
    ])('keeps a root-only %s service on its own preset alongside a Ruby buildpack service', async (slug, configFile, configContents) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            docs: { root: 'docs' },
            api: { root: 'api' },
          },
        }),
        'docs/Gemfile': `source "https://rubygems.org"\ngem "${slug}"\n`,
        [`docs/${configFile}`]: configContents,
        'api/Gemfile': 'source "https://rubygems.org"\ngem "puma"\n',
        'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const services = servicesV2(result.services);
      expect(services.map(s => s.name).sort()).toEqual(['api', 'docs']);

      const docs = services.find(s => s.name === 'docs')!;
      expect(docs).toMatchObject({
        root: 'docs',
        framework: slug,
        runtime: undefined,
      });
      expect(docs.builder.use).toBe('@vercel/static-build');
      expect(docs.builder.config).not.toHaveProperty('buildpack');

      const api = services.find(s => s.name === 'api')!;
      expect(api).toMatchObject({ framework: 'ruby', runtime: 'ruby' });
      expect(api.builder).toMatchObject({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'ruby', framework: 'ruby' },
      });
    });
  });

  describe('buildpack runtimes (VERCEL_EXPERIMENTAL_BUILDPACK_RUST=1)', () => {
    const CARGO_TOML =
      '[package]\nname = "api"\nversion = "0.1.0"\nedition = "2021"\n';
    const MAIN_RS = 'fn main() {}\n';

    beforeEach(() => {
      vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUST', '1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('resolves a Rust runtime without an entrypoint to the buildpack container builder', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'rust' },
          },
        }),
        'api/Cargo.toml': CARGO_TOML,
        'api/Cargo.lock': '',
        'api/src/main.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        schema: 'experimentalServicesV2',
        name: 'api',
        root: 'api',
        framework: 'rust',
        runtime: 'rust',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'rust',
          framework: 'rust',
          workspace: 'api',
        },
      });
      expect(api).not.toHaveProperty('command');
    });

    it('resolves a [[bin]]-only Rust runtime service to the buildpack', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'rust' },
          },
        }),
        'api/Cargo.toml': `${CARGO_TOML}\n[[bin]]\nname = "server"\npath = "src/bin/server.rs"\n`,
        'api/src/bin/server.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        framework: undefined,
        runtime: 'rust',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'rust',
          workspace: 'api',
        },
      });
    });

    it('resolves an explicit Rust framework without an entrypoint to buildpacks', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', framework: 'rust' },
          },
        }),
        'api/Cargo.toml': CARGO_TOML,
        'api/src/main.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        framework: 'rust',
        runtime: 'rust',
        entrypoint: undefined,
      });
      expect(api.builder).toMatchObject({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'rust', framework: 'rust' },
      });
    });

    it.each([
      [
        'a runtime with a .rs entrypoint',
        { runtime: 'rust', entrypoint: 'src/main.rs' },
        'src/main.rs',
      ],
      [
        'an extension-inferred .rs entrypoint',
        { entrypoint: 'api/handler.rs' },
        'api/handler.rs',
      ],
      [
        'a framework with a .rs entrypoint',
        { framework: 'rust', entrypoint: 'src/main.rs' },
        'src/main.rs',
      ],
    ])('keeps a Rust service with %s on @vercel/rust, without warnings', async (_, serviceConfig, entrypoint) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', ...serviceConfig },
          },
        }),
        'api/Cargo.toml': CARGO_TOML,
        'api/src/main.rs': MAIN_RS,
        'api/api/handler.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({ runtime: 'rust', entrypoint });
      expect(api.builder).toMatchObject({
        src: `api/${entrypoint}`,
        use: '@vercel/rust',
      });
      expect(api.builder.config).not.toHaveProperty('buildpack');
    });

    it('rejects a command for a Rust runtime service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: {
              root: 'api',
              runtime: 'rust',
              command: './target/release/api',
            },
          },
        }),
        'api/Cargo.toml': CARGO_TOML,
        'api/src/main.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([
        {
          code: 'INVALID_COMMAND',
          message:
            'Service "api" can only specify "command" when using runtime "container".',
          serviceName: 'api',
        },
      ]);
    });

    it('requires the Cargo.toml at the service root, not in an ancestor', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'services/api', runtime: 'rust' },
          },
        }),
        'Cargo.toml': '[workspace]\nmembers = ["services/api"]\n',
        'services/api/src/main.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
      ]);
    });

    it('does not route a Rust service on the Ruby flag alone', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'rust' },
          },
        }),
        'api/Cargo.toml': CARGO_TOML,
        'api/src/main.rs': MAIN_RS,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
      ]);
    });
  });

  it('requires an entrypoint for a Rust runtime service when buildpacks are disabled', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          api: { root: 'api', runtime: 'rust' },
        },
      }),
      'api/Cargo.toml': '[package]\nname = "api"\nversion = "0.1.0"\n',
      'api/src/main.rs': 'fn main() {}\n',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toMatchObject([
      { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
    ]);
  });

  it('requires an entrypoint for a Ruby runtime service when buildpacks are disabled', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          api: { root: 'api', runtime: 'ruby' },
        },
      }),
      'api/Gemfile': 'source "https://rubygems.org"\n',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toMatchObject([
      { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
    ]);
  });

  it('ignores a command for a Ruby service when buildpacks are disabled, as before', async () => {
    // Flag off, nothing changes: `command` on a non-container `services`
    // entry was never validated here.
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          api: {
            root: 'api',
            runtime: 'ruby',
            entrypoint: 'config.ru',
            command: 'bundle exec puma',
          },
        },
      }),
      'api/Gemfile': 'source "https://rubygems.org"\n',
      'api/config.ru': 'run ->(_env) { [200, {}, ["ok"]] }\n',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [api] = servicesV2(result.services);
    expect(api.builder).toMatchObject({
      src: 'api/config.ru',
      use: '@vercel/ruby',
    });
  });

  it('keeps an unflagged Rails app on the legacy Ruby Lambda builder', async () => {
    // Without the buildpack flag the experimental `ruby` preset stays out of
    // detection, so nothing about existing Ruby services changes.
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          web: { root: '.', runtime: 'ruby', entrypoint: 'config.ru' },
        },
      }),
      Gemfile: 'source "https://rubygems.org"\ngem "rails"\n',
      'Gemfile.lock': 'GEM\n  specs:\n    rails (7.2.3.1)\n',
      'config.ru': 'run Rails.application\n',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [web] = servicesV2(result.services);
    // Unflagged, no Ruby framework preset participates in detection at all
    // (they are experimental), and the service resolves through the legacy
    // Ruby Lambda builder exactly as it did before buildpacks existed.
    expect(web.framework).toBeUndefined();
    expect(web.runtime).toBe('ruby');
    expect(web.builder).toMatchObject({
      src: 'config.ru',
      use: '@vercel/ruby',
    });
  });

  describe('Go buildpack services (VERCEL_EXPERIMENTAL_BUILDPACK_GO=1)', () => {
    const goMod = 'module example.com/app\n\ngo 1.26\n';
    const mainGo = 'package main\n\nfunc main() {}\n';
    const handlerGo =
      'package handler\n\nimport "net/http"\n\nfunc Handler(w http.ResponseWriter, r *http.Request) {}\n';

    beforeEach(() => {
      vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_GO', '1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('resolves a Go runtime service without an entrypoint to the buildpack container builder', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'go' },
          },
        }),
        'api/go.mod': goMod,
        'api/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        schema: 'experimentalServicesV2',
        name: 'api',
        root: 'api',
        framework: 'go',
        runtime: 'go',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          framework: 'go',
          workspace: 'api',
        },
      });
    });

    it.each([
      '.',
      'services/api',
    ])('builds a go.mod-only Go runtime service at %s without a framework label', async root => {
      // No preset entrypoint: nothing detects the `go` preset, and the
      // runtime alone selects the buildpack, which finds the main package.
      const prefix = root === '.' ? '' : `${root}/`;
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root, runtime: 'go' },
          },
        }),
        [`${prefix}go.mod`]: goMod,
        [`${prefix}server.go`]: mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        framework: undefined,
        runtime: 'go',
        entrypoint: undefined,
      });
      expect(api.builder).toEqual({
        src: `${prefix}<detect>`,
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          ...(root === '.' ? {} : { workspace: root }),
        },
      });
    });

    it('resolves an explicit Go framework without an entrypoint to the buildpack', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'backend', framework: 'go' },
          },
        }),
        'backend/go.mod': goMod,
        'backend/cmd/server/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api.builder).toEqual({
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          framework: 'go',
          workspace: 'backend',
        },
      });
    });

    it.each([
      ['a root main.go', 'main.go', 'go'],
      ['a cmd/api server', 'cmd/api/main.go', 'go'],
      [
        'a cmd package the preset does not detect',
        'cmd/web/main.go',
        undefined,
      ],
      ['a root server.go', 'server.go', undefined],
    ])('resolves a Go service with %s entrypoint to the buildpack and builds its package', async (_, entrypoint, framework) => {
      // The entrypoint names the package to build, the same one `@vercel/go`
      // builds from it.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'backend/', entrypoint },
          },
        }),
        'backend/go.mod': goMod,
        [`backend/${entrypoint}`]: mainGo,
        'backend/cmd/worker/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({ runtime: 'go', framework, entrypoint });
      expect(api.builder).toEqual({
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          buildpackEntrypoint: entrypoint,
          workspace: 'backend',
          ...(framework ? { framework } : {}),
        },
      });
    });

    it.each([
      'cmd/custom',
      'cmd/custom/',
      './cmd/custom',
    ])('builds the package the directory entrypoint %j names, not a discovered one', async entrypoint => {
      // Left to discovery, the build would pick the root `main.go`.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'backend', runtime: 'go', entrypoint },
          },
        }),
        'backend/go.mod': goMod,
        'backend/main.go': mainGo,
        'backend/cmd/custom/main.go': mainGo,
        'backend/cmd/worker/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api.builder).toEqual({
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          buildpackEntrypoint: 'cmd/custom',
          workspace: 'backend',
        },
      });
    });

    it('reads the package clause past comments and build constraints', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'go', entrypoint: 'server.go' },
          },
        }),
        'api/go.mod': goMod,
        'api/server.go': [
          '\uFEFF// Copyright 2026 Example.',
          '',
          '/*',
          'package handler is only a comment',
          '*/',
          '//go:build linux',
          '',
          '// Package main serves the API.',
          'package main',
          '',
          'func main() {}',
          '',
        ].join('\n'),
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api.builder).toMatchObject({
        use: '@vercel/container',
        config: { buildpack: 'go', buildpackEntrypoint: 'server.go' },
      });
    });

    it.each([
      ['a handler under api/', 'api/handler.go', handlerGo],
      ['a root handler', 'index.go', handlerGo.replace('handler', 'api')],
      ['a file without a package clause', 'main.go', '// TODO\n'],
    ])('keeps %s on @vercel/go', async (_, entrypoint, source) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'backend', entrypoint },
          },
        }),
        'backend/go.mod': goMod,
        [`backend/${entrypoint}`]: source,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({ runtime: 'go', entrypoint });
      expect(api.builder).toMatchObject({
        src: `backend/${entrypoint}`,
        use: '@vercel/go',
      });
      expect(api.builder.config).not.toHaveProperty('buildpack');
      expect(api.builder.config).not.toHaveProperty('buildpackEntrypoint');
    });

    it('routes a Go service with a custom build command to the buildpack', async () => {
      // The command stays on the service; the container builder warns that
      // the buildpack ignores it.
      const buildCommand =
        'go build -ldflags "-s -w" -o "$VERCEL_OUTPUT_FILE" ./cmd/server';
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', framework: 'go', buildCommand },
          },
        }),
        'api/go.mod': goMod,
        'api/cmd/server/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({ buildCommand });
      expect(api.builder).toEqual({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          framework: 'go',
          buildpack: 'go',
          workspace: 'api',
        },
      });
    });

    it('requires the go.mod at the service root, not in an ancestor', async () => {
      // A module shared from the repository root builds with `@vercel/go`,
      // which searches up to the repository root; the buildpack builds the
      // service root alone.
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'services/api', framework: 'go' },
          },
        }),
        'go.mod': goMod,
        'services/api/cmd/server/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api.builder).toEqual({
        src: 'services/api/index.go',
        use: '@vercel/go',
        config: {
          zeroConfig: true,
          framework: 'go',
          workspace: 'services/api',
        },
      });
    });

    it('rejects a command for a Go service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api', runtime: 'go', command: './server' },
          },
        }),
        'api/go.mod': goMod,
        'api/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toEqual([
        {
          code: 'INVALID_COMMAND',
          message:
            'Service "api" can only specify "command" when using runtime "container".',
          serviceName: 'api',
        },
      ]);
    });

    it('keeps an explicit hugo framework on static-build despite a Go runtime hint', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            docs: { root: 'docs', runtime: 'go', framework: 'hugo' },
          },
        }),
        // Hugo Modules sites carry a go.mod too.
        'docs/go.mod': 'module example.com/docs\n\ngo 1.26\n',
        'docs/hugo.toml': 'baseURL = "https://example.com/"\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [docs] = servicesV2(result.services);
      expect(docs).toMatchObject({ framework: 'hugo', runtime: undefined });
      expect(docs.builder.use).toBe('@vercel/static-build');
      expect(docs.builder.config).not.toHaveProperty('buildpack');
    });

    it('auto-detects a root-only Go service from its go.mod and main.go', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            api: { root: 'api' },
          },
        }),
        'api/go.mod': goMod,
        'api/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [api] = servicesV2(result.services);
      expect(api).toMatchObject({
        framework: 'go',
        runtime: 'go',
        entrypoint: undefined,
      });
      expect(api.builder).toMatchObject({
        src: 'api/<detect>',
        use: '@vercel/container',
        config: { buildpack: 'go', framework: 'go' },
      });
    });

    it.each([
      ['runtime', { runtime: 'go' }, 'main.go', 'go', undefined],
      ['inferred framework', {}, 'main.go', 'go', undefined],
      ['explicit framework', { framework: 'go' }, 'main.go', 'go', undefined],
      // The service root names no package: the build discovers it.
      [
        'directory',
        { runtime: 'go', entrypoint: './' },
        'main.go',
        'go',
        undefined,
      ],
      [
        'custom binary',
        { runtime: 'go' },
        'cmd/custom/main.go',
        undefined,
        undefined,
      ],
      [
        'nested directory',
        { runtime: 'go', entrypoint: 'cmd/custom' },
        'cmd/custom/main.go',
        undefined,
        'cmd/custom',
      ],
    ])('resolves a %s service next to a static frontend', async (_, config, source, framework, buildpackEntrypoint) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: { root: 'backend/', ...config },
            frontend: { root: 'frontend' },
          },
        }),
        'backend/go.mod': goMod,
        [`backend/${source}`]: mainGo,
        'frontend/index.html': '<h1>Hello</h1>',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).toHaveLength(2);
      const [backend, frontend] = servicesV2(result.services);
      expect(backend).toMatchObject({
        root: 'backend',
        runtime: 'go',
        framework,
        entrypoint: undefined,
      });
      expect(backend.builder).toEqual({
        src: 'backend/<detect>',
        use: '@vercel/container',
        config: {
          zeroConfig: true,
          buildpack: 'go',
          ...(framework ? { framework } : {}),
          ...(buildpackEntrypoint ? { buildpackEntrypoint } : {}),
          workspace: 'backend',
        },
      });
      expect(frontend).toMatchObject({
        runtime: undefined,
        builder: { src: 'frontend/**', use: '@vercel/static' },
      });
    });

    it.each([
      ['missing', 'backend/go.sum'],
      ['ancestor', 'go.mod'],
      ['nested', 'backend/app/go.mod'],
    ])('does not use a %s service-root marker', async (_, marker) => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: {
              root: 'backend',
              runtime: 'go',
              entrypoint: marker === 'backend/app/go.mod' ? 'app' : undefined,
            },
          },
        }),
        [marker]: goMod,
        'backend/main.go': mainGo,
        'backend/app/main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'MISSING_SERVICE_CONFIG', serviceName: 'backend' },
      ]);
    });

    it.each([
      { runtime: 'go' },
      { framework: 'go' },
      {},
    ])('keeps an explicit Go handler entrypoint on the legacy builder with %j', async config => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: { root: '.', ...config, entrypoint: 'api/handler.go' },
          },
        }),
        'go.mod': goMod,
        'main.go': mainGo,
        'api/handler.go': handlerGo,
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [backend] = servicesV2(result.services);
      expect(backend).toMatchObject({
        runtime: 'go',
        entrypoint: 'api/handler.go',
      });
      expect(backend.builder).toEqual({
        src: 'api/handler.go',
        use: '@vercel/go',
        config: { zeroConfig: true, framework: 'go' },
      });
    });

    it.each([
      { runtime: 'container' },
      { runtime: 'go', entrypoint: 'Dockerfile' },
    ])('preserves a Dockerfile override and command with %j', async config => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: { root: '.', ...config, command: ['./server'] },
          },
        }),
        'go.mod': goMod,
        'main.go': mainGo,
        Dockerfile: 'FROM golang:1.26\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      const [backend] = servicesV2(result.services);
      expect(backend).toMatchObject({
        runtime: 'container',
        entrypoint: 'Dockerfile',
        builder: {
          src: 'Dockerfile',
          use: '@vercel/container',
          config: { zeroConfig: true, command: ['./server'] },
        },
      });
      expect(backend.builder.config).not.toHaveProperty('buildpack');
    });

    it('rejects commands for a Go buildpack service', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: { root: '.', runtime: 'go', command: './server' },
          },
        }),
        'go.mod': goMod,
        'main.go': mainGo,
      });

      const result = await detectServices({ fs });

      expect(result.services).toEqual([]);
      expect(result.errors).toMatchObject([
        { code: 'INVALID_COMMAND', serviceName: 'backend' },
      ]);
    });
  });

  it('keeps Go services on @vercel/go when the Go buildpack is disabled', async () => {
    vi.stubEnv('VERCEL_EXPERIMENTAL_BUILDPACK_RUBY', '1');
    try {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          services: {
            backend: { root: 'backend/', entrypoint: 'main.go' },
          },
        }),
        'backend/go.mod': 'module example.com/backend\n\ngo 1.26\n',
        'backend/main.go': 'package main\n\nfunc main() {}\n',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [backend] = servicesV2(result.services);
      expect(backend.builder).toEqual({
        src: 'backend/main.go',
        use: '@vercel/go',
        config: { zeroConfig: true, framework: 'go', workspace: 'backend' },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('requires an entrypoint for a Go runtime service when the Go buildpack is disabled', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          api: { root: 'api', runtime: 'go' },
        },
      }),
      'api/go.mod': 'module example.com/api\n\ngo 1.26\n',
      'api/server.go': 'package main\n\nfunc main() {}\n',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toMatchObject([
      { code: 'MISSING_SERVICE_CONFIG', serviceName: 'api' },
    ]);
  });

  it('resolves a pyproject.toml entrypoint to the python builder', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        services: {
          backend: { root: 'backend', entrypoint: 'pyproject.toml' },
        },
      }),
      'backend/pyproject.toml': [
        '[project]',
        'name = "x"',
        'version = "0.0.1"',
        '',
        '[[tool.vercel.subscribers]]',
        'entrypoint = "worker:app"',
        'topics = ["invoices"]',
        '',
      ].join('\n'),
      'backend/worker.py': 'app = object()',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [backend] = servicesV2(result.services);
    expect(backend).toMatchObject({
      schema: 'experimentalServicesV2',
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
    });
    expect(backend.builder.use).toBe('@vercel/python');
    expect(backend.builder.src).toBe('backend/pyproject.toml');
    expect(backend.builder.config).toMatchObject({ workspace: 'backend' });
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

  it('detects a root-only frontend framework service', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          frontend: { root: 'frontend' },
        },
      }),
      'frontend/package.json': JSON.stringify({
        dependencies: {
          next: 'latest',
          react: 'latest',
          'react-dom': 'latest',
        },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [frontend] = servicesV2(result.services);
    expect(frontend).toMatchObject({
      name: 'frontend',
      root: 'frontend',
      framework: 'nextjs',
    });
    expect(frontend.builder).toEqual({
      src: 'frontend/package.json',
      use: '@vercel/next',
      config: {
        zeroConfig: true,
        framework: 'nextjs',
        workspace: 'frontend',
      },
    });
    expect(isRouteOwningBuilder(frontend)).toBe(true);
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

  it('auto-detects framework using service root when entrypoint is in a subdirectory', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          backend: {
            root: 'backend',
            entrypoint: 'src/main.py',
          },
        },
      }),
      'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
      'backend/src/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [backend] = servicesV2(result.services);
    expect(backend).toMatchObject({
      name: 'backend',
      framework: 'fastapi',
      runtime: 'python',
      entrypoint: 'src/main.py',
    });
    expect(backend.builder.use).toBe('@vercel/python');
    expect(backend.builder.config).toMatchObject({
      framework: 'fastapi',
      workspace: 'backend',
    });
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

  it('strips a trailing slash from a framework service root', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          frontend: { root: 'frontend/', framework: 'nextjs' },
        },
      }),
      'frontend/package.json': JSON.stringify({
        dependencies: { next: 'latest' },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [frontend] = servicesV2(result.services);
    // Trailing slash is normalized away so it isn't double-prefixed downstream.
    expect(frontend.root).toBe('frontend');
    expect(frontend.builder.use).toBe('@vercel/next');
    expect(frontend.builder.src).toBe('frontend/package.json');
    expect(frontend.builder.config).toMatchObject({ workspace: 'frontend' });
  });

  it('strips a trailing slash from an entrypoint service root', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': vercelJson({
        experimentalServicesV2: {
          backend: { root: 'backend/', entrypoint: 'cmd/api/main.go' },
        },
      }),
      'backend/cmd/api/main.go': 'package main',
      'backend/go.mod': 'module backend',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    const [backend] = servicesV2(result.services);
    expect(backend.root).toBe('backend');
    expect(backend.builder.use).toBe('@vercel/go');
    // Root prefix applied exactly once.
    expect(backend.builder.src).toBe('backend/cmd/api/main.go');
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

    it('resolves a root-only static service when static files are present', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            frontend: {
              root: 'frontend/',
              rewrites: [{ source: '/(.*)', destination: '/index.html' }],
            },
          },
        }),
        'frontend/index.html': '<h1>Hello static service</h1>',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [frontend] = servicesV2(result.services);
      expect(frontend).toMatchObject({
        schema: 'experimentalServicesV2',
        name: 'frontend',
        root: 'frontend',
        rewrites: [{ source: '/(.*)', destination: '/index.html' }],
      });
      expect(frontend.builder).toEqual({
        src: 'frontend/**',
        use: '@vercel/static',
        config: { zeroConfig: true, workspace: 'frontend' },
      });
      expect(frontend.framework).toBeUndefined();
      expect(frontend.runtime).toBeUndefined();
      expect(frontend.entrypoint).toBeUndefined();
      expect(isStaticBuild(frontend)).toBe(true);
    });

    it('resolves a root-only static service with a build command to @vercel/static-build', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            frontend: {
              root: 'frontend',
              buildCommand: 'npm run build',
              outputDirectory: 'dist',
              rewrites: [{ source: '/(.*)', destination: '/index.html' }],
            },
          },
        }),
        'frontend/package.json': JSON.stringify({
          scripts: { build: 'echo built' },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [frontend] = servicesV2(result.services);
      expect(frontend).toMatchObject({
        name: 'frontend',
        buildCommand: 'npm run build',
        outputDirectory: 'dist',
        rewrites: [{ source: '/(.*)', destination: '/index.html' }],
      });
      expect(frontend.builder).toEqual({
        src: 'frontend/package.json',
        use: '@vercel/static-build',
        config: {
          zeroConfig: true,
          outputDirectory: 'dist',
          workspace: 'frontend',
        },
      });
      expect(frontend.framework).toBeUndefined();
      expect(frontend.runtime).toBeUndefined();
      expect(isStaticBuild(frontend)).toBe(true);
    });

    it('resolves a root-only static service with an output directory to @vercel/static', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            frontend: { root: 'frontend', outputDirectory: 'public' },
          },
        }),
        'frontend/public/index.html': '<h1>Hello public directory</h1>',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      const [frontend] = servicesV2(result.services);
      expect(frontend.builder).toEqual({
        src: 'frontend/public/**',
        use: '@vercel/static',
        config: {
          zeroConfig: true,
          outputDirectory: 'public',
          workspace: 'frontend',
        },
      });
      expect(frontend.outputDirectory).toBe('public');
      expect(frontend.runtime).toBeUndefined();
      expect(isStaticBuild(frontend)).toBe(true);
    });

    it('errors when a runtime service has no entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            worker: { root: 'svc', runtime: 'node' },
          },
        }),
        'svc/index.html': '<h1>Not a Node entrypoint</h1>',
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_CONFIG',
        serviceName: 'worker',
      });
    });

    it('errors when a root-only service detects a backend framework without an entrypoint', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            api: { root: 'api' },
          },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]\n',
        'api/main.py': 'app = object()',
      });

      const result = await detectServices({ fs });

      expect(servicesV2(result.services)).toEqual([]);
      expect(result.errors[0]).toMatchObject({
        code: 'MISSING_SERVICE_CONFIG',
        serviceName: 'api',
      });
      expect(result.errors[0].message).toContain('framework "fastapi"');
      expect(result.errors[0].message).toContain('"entrypoint"');
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

    it.each([
      '1bad',
      'bad1',
      'Bad',
      'bad.service',
      'bad_service_',
      'bad'.repeat(22),
    ])('errors on invalid service name "%s"', async name => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            [name]: { root: 'svc', framework: 'express' },
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_SERVICE_NAME',
      });
    });

    it('accepts service names matching the API schema', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            ['a'.repeat(64)]: { root: 'svc', framework: 'express' },
            my_service: { root: 'svc', framework: 'express' },
            'my-service': { root: 'svc', framework: 'express' },
          },
        }),
        'svc/package.json': '{}',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toHaveLength(3);
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

    it('errors when a binding references an invalid service name', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': vercelJson({
          experimentalServicesV2: {
            web: {
              root: 'apps/web',
              framework: 'express',
              bindings: [
                { type: 'service', service: 'Bad', format: 'url', env: 'G' },
              ],
            },
          },
        }),
        'apps/web/package.json': '{}',
      });

      const result = await detectServices({ fs });

      expect(result.errors[0]).toMatchObject({
        code: 'INVALID_SERVICE_BINDING_NAME',
      });
    });
  });

  // Container detection (entrypoint inference, runtime auto-detection, and
  // failure cases) is covered comprehensively with shareable fixtures in
  // unit.detect-services-v2-container.test.ts.
});
