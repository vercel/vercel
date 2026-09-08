import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'fs/promises';
import type { Services } from '@vercel/build-utils';
import {
  detectBuildersWithServices,
  type DetectBuildersWithServicesOptions,
} from '../../src/detect-builders-with-services';
import { applyServicesMonorepoDefaults as applyWithOutput } from '../../src/monorepo';

const mkdirp = (p: string) => mkdir(p, { recursive: true });

type ProjectSettings = Parameters<typeof applyWithOutput>[3];

const newProjectSettings = (): ProjectSettings => ({
  buildCommand: null,
  installCommand: null,
  commandForIgnoringBuildStep: null,
});

describe('applyServicesMonorepoDefaults', () => {
  let root: string;
  let logSpy: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.fn>;

  /** Binds the injected `output` so the cases below stay focused on behaviour. */
  const applyServicesMonorepoDefaults = (
    cwd: string,
    workPath: string,
    services: Services,
    projectSettings: ProjectSettings
  ) =>
    applyWithOutput(cwd, workPath, services, projectSettings, {
      log: logSpy,
      warn: warnSpy,
    });

  beforeEach(async () => {
    // realpath so macOS /var -> /private/var symlinks don't break equality.
    root = await realpath(await mkdtemp(join(tmpdir(), 'monorepo-services-')));
    logSpy = vi.fn();
    warnSpy = vi.fn();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** Writes a Turborepo root with a `build` task and the given turbo version. */
  async function setupTurborepo({
    turboVersion = '2.0.0',
    roots = ['apps/web', 'apps/api'],
  }: {
    turboVersion?: string | null;
    roots?: string[];
  } = {}) {
    await writeFile(
      join(root, 'turbo.json'),
      JSON.stringify({ tasks: { build: {} } })
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'monorepo',
        devDependencies: turboVersion ? { turbo: turboVersion } : {},
      })
    );
    for (const r of roots) {
      await mkdirp(join(root, r));
    }
  }

  it('assigns a monorepo build command to each service that lacks one', async () => {
    await setupTurborepo();
    const services: Services = {
      web: { root: 'apps/web' },
      api: { root: 'apps/api' },
    };

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      services,
      newProjectSettings()
    );

    expect(result.web.buildCommand).toEqual('turbo run build');
    expect(result.api.buildCommand).toEqual('turbo run build');
  });

  it('does not mutate the input services object', async () => {
    await setupTurborepo();
    const services: Services = { web: { root: 'apps/web' } };

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      services,
      newProjectSettings()
    );

    expect(result).not.toBe(services);
    expect(services.web.buildCommand).toBeUndefined();
  });

  it('records the detected monorepo manager on the project settings', async () => {
    await setupTurborepo();
    const projectSettings = newProjectSettings();

    await applyServicesMonorepoDefaults(
      root,
      root,
      { web: { root: 'apps/web' } },
      projectSettings
    );

    expect(projectSettings.monorepoManager).toEqual('turbo');
  });

  it('logs the detection notice once regardless of service count', async () => {
    await setupTurborepo({ roots: ['apps/a', 'apps/b', 'apps/c'] });

    await applyServicesMonorepoDefaults(
      root,
      root,
      { a: { root: 'apps/a' }, b: { root: 'apps/b' }, c: { root: 'apps/c' } },
      newProjectSettings()
    );

    // Matches the wording of the non-services path in `setMonorepoDefaultSettings`.
    const notices = logSpy.mock.calls.filter(([msg]) =>
      String(msg).includes('Detected Turbo. Adjusting default settings')
    );
    expect(notices).toHaveLength(1);
  });

  it('never overwrites an explicit service buildCommand', async () => {
    await setupTurborepo();
    const services: Services = {
      web: { root: 'apps/web', buildCommand: 'pnpm custom:build' },
      api: { root: 'apps/api' },
    };

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      services,
      newProjectSettings()
    );

    expect(result.web.buildCommand).toEqual('pnpm custom:build');
    expect(result.api.buildCommand).toEqual('turbo run build');
  });

  it('uses a filter command for turbo versions without root-command support', async () => {
    await setupTurborepo({ turboVersion: '1.5.0' });

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { api: { root: 'apps/api' } },
      newProjectSettings()
    );

    expect(result.api.buildCommand).toEqual(
      'cd ../.. && turbo run build --filter={apps/api}...'
    );
  });

  // The generated string is a shell command, not a filesystem path. A Windows
  // `\` separator would be parsed as a glob escape inside `--filter={...}`, so
  // the nested service path and the `cd` target must stay POSIX on every
  // platform. This assertion is what fails on Windows if the separators leak.
  it('emits POSIX separators in commands for a nested service', async () => {
    await setupTurborepo({
      turboVersion: '1.5.0',
      roots: ['apps/nested/api'],
    });

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { api: { root: 'apps/nested/api' } },
      newProjectSettings()
    );

    expect(result.api.buildCommand).toEqual(
      'cd ../../.. && turbo run build --filter={apps/nested/api}...'
    );
    expect(result.api.buildCommand).not.toContain('\\');
  });

  it('uses a scope command for turbo versions without filter support', async () => {
    await setupTurborepo({ turboVersion: '1.0.0' });

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { api: { root: 'apps/api' } },
      newProjectSettings()
    );

    // `projectName` matches the non-services path: the service root basename.
    expect(result.api.buildCommand).toEqual(
      'cd ../.. && turbo run build --scope=api'
    );
  });

  it('treats a service rooted at the repo root as the monorepo root', async () => {
    await setupTurborepo({ roots: [] });

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { app: { root: '.' } },
      newProjectSettings()
    );

    expect(result.app.buildCommand).toEqual('turbo run build');
  });

  it('resolves service roots relative to workPath, not the repo root', async () => {
    await setupTurborepo({ roots: ['sub/apps/api'] });
    const workPath = join(root, 'sub');

    const result = await applyServicesMonorepoDefaults(
      root,
      workPath,
      { api: { root: 'apps/api' } },
      newProjectSettings()
    );

    // turbo.json still lives at `root`, and the filter path is repo-root-relative.
    expect(result.api.buildCommand).toEqual('turbo run build');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // A monorepo manager's build command only makes sense for a package in its
  // task graph. `@vercel/python` (index.ts:1062) and `@vercel/go`
  // (standalone-server.ts:170) both execute `config.buildCommand` verbatim, so
  // handing them `turbo run build` would break the build outright.
  describe('non-JavaScript runtimes', () => {
    it.each([
      ['explicit python runtime', { root: 'services/py', runtime: 'python' }],
      ['explicit go runtime', { root: 'services/go', runtime: 'go' }],
      ['explicit rust runtime', { root: 'services/rs', runtime: 'rust' }],
      ['explicit ruby runtime', { root: 'services/rb', runtime: 'ruby' }],
      [
        'container runtime',
        {
          root: 'services/img',
          runtime: 'container',
          entrypoint: 'Dockerfile',
        },
      ],
      ['python framework', { root: 'services/api', framework: 'fastapi' }],
      ['django framework', { root: 'services/web', framework: 'django' }],
      ['python entrypoint', { root: 'services/worker', entrypoint: 'main.py' }],
      [
        'pyproject entrypoint',
        { root: 'services/pkg', entrypoint: 'pyproject.toml' },
      ],
    ])('does not assign a build command for a %s', async (_label, service) => {
      await setupTurborepo({ roots: [service.root] });

      const result = await applyServicesMonorepoDefaults(
        root,
        root,
        { svc: service },
        newProjectSettings()
      );

      expect(result.svc.buildCommand).toBeUndefined();
    });

    it.each([
      ['explicit node runtime', { root: 'apps/api', runtime: 'node' }],
      ['node backend framework', { root: 'apps/api', framework: 'express' }],
      ['node entrypoint', { root: 'apps/api', entrypoint: 'server.ts' }],
      ['frontend framework', { root: 'apps/web', framework: 'vite' }],
      ['no runtime or framework', { root: 'apps/web' }],
    ])('still assigns a build command for a %s', async (_label, service) => {
      await setupTurborepo({ roots: [service.root] });

      const result = await applyServicesMonorepoDefaults(
        root,
        root,
        { svc: service },
        newProjectSettings()
      );

      expect(result.svc.buildCommand).toEqual('turbo run build');
    });

    it('assigns to the node service but not the python one in a mixed repo', async () => {
      await setupTurborepo({ roots: ['apps/web', 'services/py'] });

      const result = await applyServicesMonorepoDefaults(
        root,
        root,
        {
          web: { root: 'apps/web' },
          py: { root: 'services/py', runtime: 'python' },
        },
        newProjectSettings()
      );

      expect(result.web.buildCommand).toEqual('turbo run build');
      expect(result.py.buildCommand).toBeUndefined();
    });

    it('still honours an explicit buildCommand on a python service', async () => {
      await setupTurborepo({ roots: ['services/py'] });

      const result = await applyServicesMonorepoDefaults(
        root,
        root,
        {
          py: {
            root: 'services/py',
            runtime: 'python',
            buildCommand: 'python -m build',
          },
        },
        newProjectSettings()
      );

      expect(result.py.buildCommand).toEqual('python -m build');
    });
  });

  it('skips a service whose root escapes the repository root', async () => {
    await setupTurborepo({ roots: [] });

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { api: { root: '../outside' } },
      newProjectSettings()
    );

    expect(result.api.buildCommand).toBeUndefined();
  });

  it('skips a service that defines its own vercel-build script', async () => {
    await setupTurborepo();
    await writeFile(
      join(root, 'apps', 'web', 'package.json'),
      JSON.stringify({ name: 'web', scripts: { 'vercel-build': 'vite build' } })
    );

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { web: { root: 'apps/web' }, api: { root: 'apps/api' } },
      newProjectSettings()
    );

    expect(result.web.buildCommand).toBeUndefined();
    expect(result.api.buildCommand).toEqual('turbo run build');
  });

  it('warns once and assigns nothing when the build task is missing', async () => {
    await writeFile(join(root, 'turbo.json'), JSON.stringify({ tasks: {} }));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'monorepo', devDependencies: { turbo: '2.0.0' } })
    );

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { web: { root: 'apps/web' }, api: { root: 'apps/api' } },
      newProjectSettings()
    );

    expect(result.web.buildCommand).toBeUndefined();
    expect(result.api.buildCommand).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain(
      'Missing required `build` task in turbo.json.'
    );
  });

  it('returns the services untouched when no monorepo manager is detected', async () => {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'plain' })
    );
    const services: Services = { web: { root: 'apps/web' } };

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      services,
      newProjectSettings()
    );

    expect(result).toBe(services);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('derives an nx build command from the service root basename', async () => {
    await writeFile(
      join(root, 'nx.json'),
      JSON.stringify({ targetDefaults: { build: {} } })
    );
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'monorepo' })
    );
    await mkdirp(join(root, 'apps', 'api'));

    const projectSettings = newProjectSettings();
    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { api: { root: 'apps/api' } },
      projectSettings
    );

    expect(result.api.buildCommand).toEqual('cd ../.. && npx nx build api');
    expect(projectSettings.monorepoManager).toEqual('nx');
  });

  // Nx resolves the `build` target per project, so one service missing a target
  // must not deny its siblings a default. The misconfigured service is listed
  // first so that aborting the loop instead of skipping the entry fails here.
  it('keeps assigning nx commands after a service with no build target', async () => {
    await writeFile(join(root, 'nx.json'), JSON.stringify({}));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'monorepo' })
    );
    await mkdirp(join(root, 'apps', 'broken'));
    await mkdirp(join(root, 'apps', 'configured'));
    await writeFile(
      join(root, 'apps', 'configured', 'project.json'),
      JSON.stringify({ targets: { build: {} } })
    );

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      {
        broken: { root: 'apps/broken' },
        configured: { root: 'apps/configured' },
      },
      newProjectSettings()
    );

    expect(result.broken.buildCommand).toBeUndefined();
    expect(result.configured.buildCommand).toEqual(
      'cd ../.. && npx nx build configured'
    );

    // The warning names the offending service, since the cause is service-local.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('Service "broken"');
  });

  it('warns per misconfigured nx service rather than once per repo', async () => {
    await writeFile(join(root, 'nx.json'), JSON.stringify({}));
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'monorepo' })
    );
    await mkdirp(join(root, 'apps', 'a'));
    await mkdirp(join(root, 'apps', 'b'));

    const result = await applyServicesMonorepoDefaults(
      root,
      root,
      { a: { root: 'apps/a' }, b: { root: 'apps/b' } },
      newProjectSettings()
    );

    expect(result.a.buildCommand).toBeUndefined();
    expect(result.b.buildCommand).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  // The reason this must run before `detectBuilders()`: the services resolver
  // selects the builder based on whether a `buildCommand` is present.
  it('flips builder selection from @vercel/static to @vercel/static-build', async () => {
    await setupTurborepo({ roots: ['apps/web'] });
    await writeFile(
      join(root, 'apps', 'web', 'package.json'),
      JSON.stringify({ name: 'web', scripts: { build: 'vite build' } })
    );

    const services: Services = { web: { root: 'apps/web' } };
    const files = {
      'turbo.json': '',
      'package.json': '',
      'apps/web/package.json': '',
    };
    const detectOptions: DetectBuildersWithServicesOptions = {
      projectSettings: { framework: 'services' },
      featHandleMiss: true,
      workPath: root,
    };

    const before = await detectBuildersWithServices(Object.keys(files), null, {
      ...detectOptions,
      services,
    });
    expect(before.builders?.[0]?.use).toEqual('@vercel/static');

    const withDefaults = await applyServicesMonorepoDefaults(
      root,
      root,
      services,
      newProjectSettings()
    );
    const after = await detectBuildersWithServices(Object.keys(files), null, {
      ...detectOptions,
      services: withDefaults,
    });
    expect(after.builders?.[0]?.use).toEqual('@vercel/static-build');
  });
});
