import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIStaticDiscovery,
  getFastAPICdnBundle,
  runFastAPICollectStatic,
  fastapiStaticOptions,
} from '../src/fastapi';
import type { InstalledPythonDistributions } from '../src/installed-distributions';
import { getVenvPythonBin } from '../src/utils';

// Smoke tests for the FastAPI wrapper over the shared redirect and bundle
// exclusion code in @vercel/build-utils (covered by build-utils'
// unit.static-files-*.test.ts). These check the pyproject gate and the
// FastAPI keep-files.
describe('getFastAPICdnBundle', () => {
  let workPath: string;
  let staticDir: string;
  const mounts = () => [
    {
      urlPath: '/site',
      directory: staticDir,
      fallback: null,
      frontend: false,
      html: true,
    },
  ];

  beforeAll(() => {
    workPath = fs.mkdtempSync(path.join(tmpdir(), 'fastapi-cdn-bundle-'));
    staticDir = path.join(workPath, 'site');
    fs.mkdirSync(path.join(staticDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(staticDir, 'docs', 'index.html'), '');
    fs.writeFileSync(path.join(staticDir, 'index.html'), '');
    fs.writeFileSync(path.join(staticDir, '404.html'), '');
    fs.writeFileSync(path.join(staticDir, 'app.js'), '');
  });
  afterAll(() => {
    fs.rmSync(workPath, { recursive: true, force: true });
  });

  it('emits 307 bare-directory redirects regardless of exclude', () => {
    for (const config of [undefined, { static: { exclude: true } }]) {
      expect(getFastAPICdnBundle(mounts(), workPath, config).redirects).toEqual(
        [
          {
            src: '^/((?:site|site/docs))$',
            dest: '/$1/',
            status: 307,
            methods: ['GET', 'HEAD'],
          },
        ]
      );
    }
  });

  it('excludes mount dirs and keeps index.html / 404.html when exclude = true', () => {
    const result = getFastAPICdnBundle(mounts(), workPath, {
      static: { exclude: true },
    });
    expect(result.excludePatterns).toEqual(['site/**']);
    expect(Object.keys(result.directoryStubs).sort()).toEqual([
      'site/.static-placeholder',
      'site/404.html',
      'site/index.html',
    ]);
  });

  it.each([
    ['unset', undefined],
    ['false', { static: { exclude: false } }],
  ])('returns no exclusions when exclude is %s', (_label, config) => {
    const result = getFastAPICdnBundle(mounts(), workPath, config);
    expect(result.excludePatterns).toEqual([]);
    expect(result.directoryStubs).toEqual({});
  });
});

describe('fastapiStaticOptions', () => {
  const dists = (version: string | null) =>
    ({
      getInstalledVersion: () => version,
    }) as unknown as InstalledPythonDistributions;

  it.each([
    [null, false],
    ['not-a-version', false],
    ['0.139.9', false],
    ['0.140.0', true],
    ['0.141.2', true],
  ])('fastapi %s -> useFallbackForExtensionedPaths %s', (version, expected) => {
    expect(fastapiStaticOptions(dists(version))).toEqual({
      debugLabel: 'FastAPI',
      useFallbackForExtensionedPaths: expected,
    });
  });
});

// The shim runs with the build venv Python. The build venv has cross-compiled
// Linux wheels (pydantic_core), so tests only run on Linux where they load.
describe.runIf(process.platform === 'linux')('FastAPI static files', () => {
  let testDir: string;
  let venvPath: string;
  let pythonEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    testDir = path.join(tmpdir(), `fastapi-static-${Date.now()}`);
    venvPath = path.join(testDir, '.venv');
    fs.mkdirSync(testDir, { recursive: true });
    await execa('uv', ['venv', venvPath, '--python', 'python3.12']);
    await execa(
      'uv',
      ['pip', 'install', 'fastapi', '--python', getVenvPythonBin(venvPath)],
      { env: { ...process.env, VIRTUAL_ENV: venvPath } }
    );
    pythonEnv = { ...process.env, VIRTUAL_ENV: venvPath };
  }, 120_000);

  afterAll(() => {
    if (testDir && fs.existsSync(testDir)) fs.removeSync(testDir);
  });

  it('discovers a /static mount', async () => {
    const appDir = path.join(testDir, 'app-discover');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body {}');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/static');
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'static'))
    );
    expect(mounts[0].fallback).toBeNull();
    // html=False with no index.html: CDN misses naturally, no shadow needed.
    expect(shadowRoutes).toEqual([]);
  });

  it('discovers an app.frontend() mount', async () => {
    const appDir = path.join(testDir, 'app-frontend');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', 'index.html'), '<h1>Hello</h1>');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="dist")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/');
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'dist'))
    );
    // fallback="auto" resolves to the index.html present in the build dir.
    expect(mounts[0].fallback).toEqual({ file: 'index.html', status: 200 });
  });

  it('returns empty when no StaticFiles mounts exist', async () => {
    const appDir = path.join(testDir, 'app-no-static');
    fs.mkdirSync(appDir, { recursive: true });
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts).toHaveLength(0);
  });

  it('discovers StaticFiles inside a mounted sub-application', async () => {
    const appDir = path.join(testDir, 'app-sub-app');
    fs.mkdirSync(path.join(appDir, 'sub_static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'sub_static', 'file.txt'), 'sub');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'sub = FastAPI()',
        'sub.mount("/static", StaticFiles(directory="sub_static"), name="s")',
        'app = FastAPI()',
        'app.mount("/sub", sub)',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The sub-app isn't a StaticFiles or a Router, but its own mount must still
    // be found under the parent prefix.
    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/sub/static');
  });

  it('discovers a StaticFiles mount inside an included APIRouter', async () => {
    const appDir = path.join(testDir, 'app-included-mount');
    fs.mkdirSync(path.join(appDir, 'mountfiles'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'mountfiles', 'x.txt'), 'mount');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'router = APIRouter()',
        'router.mount("/data", StaticFiles(directory="mountfiles"), name="data")',
        'app = FastAPI()',
        'app.include_router(router)',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // A plain mount inside an included router owns its subtree like a direct
    // app.mount(), so it outranks a lower-priority frontend for its files.
    const dataMount = mounts.find(m => m.urlPath === '/data');
    expect(dataMount).toBeDefined();
    expect(dataMount?.frontend).toBe(false);
  });

  // Each entrypoint uses a first-party import, so its frontend mount is found
  // only if the shim imports it as a real module with the project root importable.
  describe('discovers mounts for entrypoints using first-party imports', () => {
    const SETTINGS = 'FRONTEND_DIR = "dist"\n';
    const main = (importLine: string, dirExpr = 'FRONTEND_DIR') =>
      [
        'from fastapi import FastAPI',
        importLine,
        'app = FastAPI()',
        `app.frontend("/", directory=${dirExpr})`,
      ].join('\n');

    const cases: {
      title: string;
      dir: string;
      entrypoint: string;
      files: Record<string, string>;
    }[] = [
      {
        title: 'package-relative `from .settings import ...`',
        dir: 'imp-rel-from',
        entrypoint: 'backend/main.py',
        files: {
          'backend/__init__.py': '',
          'backend/settings.py': SETTINGS,
          'backend/main.py': main('from .settings import FRONTEND_DIR'),
        },
      },
      {
        title: 'package-relative `from . import settings`',
        dir: 'imp-rel-dot',
        entrypoint: 'backend/main.py',
        files: {
          'backend/__init__.py': '',
          'backend/settings.py': SETTINGS,
          'backend/main.py': main(
            'from . import settings',
            'settings.FRONTEND_DIR'
          ),
        },
      },
      {
        title: 'parent-relative `from ..settings import ...`',
        dir: 'imp-rel-parent',
        entrypoint: 'backend/sub/main.py',
        files: {
          'backend/__init__.py': '',
          'backend/sub/__init__.py': '',
          'backend/settings.py': SETTINGS,
          'backend/sub/main.py': main('from ..settings import FRONTEND_DIR'),
        },
      },
      {
        title: 'sibling absolute `import settings`',
        dir: 'imp-abs-import',
        entrypoint: 'main.py',
        files: {
          'settings.py': SETTINGS,
          'main.py': main('import settings', 'settings.FRONTEND_DIR'),
        },
      },
      {
        title: 'sibling absolute `from settings import ...`',
        dir: 'imp-abs-from',
        entrypoint: 'main.py',
        files: {
          'settings.py': SETTINGS,
          'main.py': main('from settings import FRONTEND_DIR'),
        },
      },
      {
        title: 'subpackage absolute `from libs.config import ...`',
        dir: 'imp-abs-subpkg',
        entrypoint: 'main.py',
        files: {
          'libs/__init__.py': '',
          'libs/config.py': SETTINGS,
          'main.py': main('from libs.config import FRONTEND_DIR'),
        },
      },
      {
        title: 'entrypoint is a package `__init__.py` (relative import)',
        dir: 'imp-init-entry',
        entrypoint: 'backend/__init__.py',
        files: {
          'backend/settings.py': SETTINGS,
          'backend/__init__.py': main('from .settings import FRONTEND_DIR'),
        },
      },
    ];

    it.each(cases)('$title', async ({ dir, entrypoint, files }) => {
      const appDir = path.join(testDir, dir);
      fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'dist', 'index.html'), '<h1>Hi</h1>');
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(appDir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        path.join(appDir, entrypoint),
        'app',
        pythonEnv,
        appDir,
        true
      );

      expect(mounts).toHaveLength(1);
      expect(mounts[0].urlPath).toBe('/');
      expect(mounts[0].directory).toBe(
        fs.realpathSync(path.join(appDir, 'dist'))
      );
      expect(mounts[0].frontend).toBe(true);
      expect(mounts[0].fallback).toEqual({ file: 'index.html', status: 200 });
    });
  });

  // The mount lives in an imported module (router, helper, re-exported app,
  // factory, or sub-app), so each case also exercises the first-party import.
  describe('discovers mounts sourced from imported modules', () => {
    type Expected = {
      urlPath: string;
      dir: string;
      frontend: boolean;
      fallback: { file: string; status: number } | null;
    };
    const FRONTEND: Expected = {
      urlPath: '/',
      dir: 'dist',
      frontend: true,
      fallback: { file: 'index.html', status: 200 },
    };
    const staticAt = (urlPath: string): Expected => ({
      urlPath,
      dir: 'static',
      frontend: false,
      fallback: null,
    });

    const cases: {
      title: string;
      dir: string;
      files: Record<string, string>;
      expected: Expected[];
    }[] = [
      {
        title: 'transitive first-party chain (main -> config -> constants)',
        dir: 'src-transitive',
        files: {
          'backend/__init__.py': '',
          'backend/constants.py': 'FRONTEND_DIR = "dist"\n',
          'backend/config.py': 'from .constants import FRONTEND_DIR\n',
          'backend/main.py': [
            'from fastapi import FastAPI',
            'from .config import FRONTEND_DIR',
            'app = FastAPI()',
            'app.frontend("/", directory=FRONTEND_DIR)',
          ].join('\n'),
        },
        expected: [FRONTEND],
      },
      {
        title: 'mount defined in an imported router (include_router)',
        dir: 'src-router',
        files: {
          'backend/__init__.py': '',
          'backend/routes.py': [
            'from fastapi import APIRouter',
            'router = APIRouter()',
            'router.frontend("/", directory="dist")',
          ].join('\n'),
          'backend/main.py': [
            'from fastapi import FastAPI',
            'from .routes import router',
            'app = FastAPI()',
            'app.include_router(router)',
          ].join('\n'),
        },
        expected: [FRONTEND],
      },
      {
        title: 'imported router mounted with app.mount()',
        dir: 'src-mount-router',
        files: {
          'backend/__init__.py': '',
          'backend/routes.py': [
            'from fastapi import APIRouter',
            'from fastapi.staticfiles import StaticFiles',
            'router = APIRouter()',
            'router.mount("/static", StaticFiles(directory="static"), name="static")',
          ].join('\n'),
          'backend/main.py': [
            'from fastapi import FastAPI',
            'from .routes import router',
            'app = FastAPI()',
            'app.mount("/api", router)',
          ].join('\n'),
        },
        expected: [staticAt('/api/static')],
      },
      {
        title: 'mount added by an imported helper function',
        dir: 'src-helper',
        files: {
          'backend/__init__.py': '',
          'backend/mounts.py': [
            'from fastapi.staticfiles import StaticFiles',
            'def add(app):',
            '    app.mount("/static", StaticFiles(directory="static"), name="static")',
          ].join('\n'),
          'backend/main.py': [
            'from fastapi import FastAPI',
            'from .mounts import add',
            'app = FastAPI()',
            'add(app)',
          ].join('\n'),
        },
        expected: [staticAt('/static')],
      },
      {
        title: 'mount on an imported sub-application (app.mount(sub))',
        dir: 'src-subapp',
        files: {
          'backend/__init__.py': '',
          'backend/sub.py': [
            'from fastapi import FastAPI',
            'from fastapi.staticfiles import StaticFiles',
            'sub = FastAPI()',
            'sub.mount("/static", StaticFiles(directory="static"), name="static")',
          ].join('\n'),
          'backend/main.py': [
            'from fastapi import FastAPI',
            'from .sub import sub',
            'app = FastAPI()',
            'app.mount("/sub", sub)',
          ].join('\n'),
        },
        expected: [staticAt('/sub/static')],
      },
      {
        title: 're-exported app (from .application import app)',
        dir: 'src-reexport',
        files: {
          'backend/__init__.py': '',
          'backend/application.py': [
            'from fastapi import FastAPI',
            'app = FastAPI()',
            'app.frontend("/", directory="dist")',
          ].join('\n'),
          'backend/main.py': 'from .application import app\n',
        },
        expected: [FRONTEND],
      },
      {
        title: 'app factory (from .factory import create_app)',
        dir: 'src-factory',
        files: {
          'backend/__init__.py': '',
          'backend/factory.py': [
            'from fastapi import FastAPI',
            'def create_app():',
            '    app = FastAPI()',
            '    app.frontend("/", directory="dist")',
            '    return app',
          ].join('\n'),
          'backend/main.py': [
            'from .factory import create_app',
            'app = create_app()',
          ].join('\n'),
        },
        expected: [FRONTEND],
      },
    ];

    it.each(cases)('$title', async ({ dir, files, expected }) => {
      const appDir = path.join(testDir, dir);
      fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'dist', 'index.html'), '<h1>Hi</h1>');
      fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body{}');
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(appDir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        path.join(appDir, 'backend/main.py'),
        'app',
        pythonEnv,
        appDir,
        true
      );

      const got = mounts
        .map(m => ({
          urlPath: m.urlPath,
          directory: m.directory,
          frontend: m.frontend,
          fallback: m.fallback,
        }))
        .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
      const want = expected
        .map(e => ({
          urlPath: e.urlPath,
          directory: fs.realpathSync(path.join(appDir, e.dir)),
          frontend: e.frontend,
          fallback: e.fallback,
        }))
        .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
      expect(got).toEqual(want);
    });
  });

  it('excludes a file from CDN when a prior route claims it before the mount', async () => {
    const appDir = path.join(testDir, 'app-shadow-mount');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'example.txt'), 'file');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        '@app.get("/static/example.txt")',
        'def example():',
        '    return "api"',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const { mounts, shadowRoutes, excludedFiles } =
      await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

    expect(mounts).toHaveLength(1);
    // The prior GET route owns the file: excluded from CDN so the Lambda
    // serves it directly. No shadow route is emitted for plain StaticFiles.
    expect(excludedFiles).toContain('/static/example.txt');
    expect(shadowRoutes).toEqual([]);
  });

  it('shadows directory indexes for an html=True mount', async () => {
    const appDir = path.join(testDir, 'app-html-index');
    fs.mkdirSync(path.join(appDir, 'site', 'guide'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'site', 'index.html'), 'root');
    fs.writeFileSync(path.join(appDir, 'site', 'guide', 'index.html'), 'guide');
    fs.writeFileSync(path.join(appDir, 'site', 'guide', 'app.js'), 'asset');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/site", StaticFiles(directory="site", html=True), name="site")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // html=True bare-dir redirects are emitted as static CDN routes by the
    // builder (getFastAPICdnBundle), not as Lambda shadow routes by the shim.
    expect(shadowRoutes).toEqual([]);
  });

  it('shadows a frontend subdirectory index but not the site root', async () => {
    const appDir = path.join(testDir, 'app-frontend-index');
    fs.mkdirSync(path.join(appDir, 'spa', 'guide'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'spa', 'index.html'), 'root');
    fs.writeFileSync(path.join(appDir, 'spa', 'guide', 'index.html'), 'guide');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="spa", fallback="auto")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // FastAPI's built-in doc routes shadow the frontend. No bare-dir shadow
    // for /guide and no shadow for the site root.
    expect(shadowRoutes).toContainEqual(
      expect.objectContaining({ body: 'docs' })
    );
    expect(shadowRoutes.map((sr: any) => sr.body)).not.toContain('guide(?!/)');
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: '' })
    );
  });

  it('shadows a subdirectory index under a non-root frontend', async () => {
    const appDir = path.join(testDir, 'app-frontend-subdir');
    fs.mkdirSync(path.join(appDir, 'spa', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'spa', 'index.html'), 'root');
    fs.writeFileSync(path.join(appDir, 'spa', 'sub', 'index.html'), 'subidx');
    fs.writeFileSync(path.join(appDir, 'spa', 'sub', 'app.js'), 'asset');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/spa", directory="spa", fallback="auto")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // CDN redirects handle /spa/sub → /spa/sub/; no shadow route is emitted
    // by the shim for frontend directory indexes.
    expect(shadowRoutes).toEqual([]);
  });

  // Each Starlette path convertor compiles to its own regex in the shadow body,
  // so a parametrized route shadows exactly the paths it matches at runtime
  // rather than a blanket `[^/]+`.
  it.each([
    ['str', '{x:str}', 'p/(?:[^/]+)'],
    ['default (no convertor)', '{x}', 'p/(?:[^/]+)'],
    ['int', '{x:int}', 'p/(?:[0-9]+)'],
    ['float', '{x:float}', 'p/(?:[0-9]+(?:\\.[0-9]+)?)'],
    ['path', '{x:path}', 'p/(?:.*)'],
    [
      'uuid',
      '{x:uuid}',
      'p/(?:[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})',
    ],
  ])('compiles the %s path convertor in a shadow route', async (slug, param, expected) => {
    const appDir = path.join(testDir, `app-conv-${slug.replace(/\W+/g, '-')}`);
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'assets', 'index.html'), '');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        `@app.get("/p/${param}")`,
        'def handler(x):',
        '    return x',
        'app.frontend("/p", directory="assets")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // shadow_bodies emits a shadow for every prior route under a frontend;
    // the convertor regex must be compiled into the body.
    expect(shadowRoutes).toContainEqual({
      body: expected,
      methods: ['GET', 'HEAD'],
    });
  });

  it('preserves escaped parens and collapses named groups in a custom convertor', async () => {
    // A convertor regex may hold escaped parens (a literal paren the route
    // matches) and named groups. Escaped parens must survive so the shadow still
    // matches the served path, and named groups must collapse to (?:) so two
    // such bodies can be OR'd into one valid src.
    const appDir = path.join(testDir, 'app-conv-custom');
    fs.mkdirSync(path.join(appDir, 'fe'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'fe', 'index.html'), 'FE');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from starlette.convertors import Convertor, register_url_convertor',
        'class Parens(Convertor):',
        '    regex = r"\\((x|y)\\)"',
        '    def convert(self, value):',
        '        return value',
        '    def to_string(self, value):',
        '        return value',
        'class Named(Convertor):',
        '    regex = r"(?P<val>[0-9]+)"',
        '    def convert(self, value):',
        '        return value',
        '    def to_string(self, value):',
        '        return value',
        'register_url_convertor("parens", Parens())',
        'register_url_convertor("named", Named())',
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '@app.get("/paren/{code:parens}")',
        'def p(code):',
        '    return code',
        '@app.get("/a/{x:named}")',
        'def a(x):',
        '    return x',
        '@app.get("/b/{y:named}")',
        'def b(y):',
        '    return y',
        'app.frontend("/", directory="fe")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // Escaped parens survive, so the shadow still matches the served /paren/(x).
    const parenBody = 'paren/(?:\\((?:x|y)\\))';
    expect(shadowRoutes).toContainEqual({
      body: parenBody,
      methods: ['GET', 'HEAD'],
    });
    expect(new RegExp(`^/((?:${parenBody})/?)$`).test('/paren/(x)')).toBe(true);
    // Named groups collapse to (?:), so two of them OR together validly.
    expect(shadowRoutes).toContainEqual({
      body: 'a/(?:(?:[0-9]+))',
      methods: ['GET', 'HEAD'],
    });
    expect(shadowRoutes).toContainEqual({
      body: 'b/(?:(?:[0-9]+))',
      methods: ['GET', 'HEAD'],
    });
  });

  it.fails('shadows a mount from a catch-all {path} route declared before it', async () => {
    const appDir = path.join(testDir, 'app-shadow-catchall');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        '@app.get("/{full:path}")',
        'def catch(full):',
        '    return full',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The `:path` convertor covers the mount prefix, so the catch-all shadows
    // the mount's whole subtree, alongside the bare mount root.
    expect(shadowRoutes).toEqual([
      { body: '(?:.*)', methods: null },
      { body: 'static', methods: ['GET'] },
    ]);
  });

  it('excludes a file matched by a prefix-position parameter route from CDN', async () => {
    const appDir = path.join(testDir, 'app-shadow-prefix-param');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    // A file at /static/items matches @app.get("/{category}/items") when
    // category == "static", so it must be excluded from CDN.
    fs.writeFileSync(path.join(appDir, 'static', 'items'), 'data');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        '@app.get("/{category}/items")',
        'def items(category):',
        '    return category',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const { shadowRoutes, excludedFiles } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The parametrized pattern matches /static/items, so that file is excluded
    // from CDN. No shadow route is emitted for plain StaticFiles.
    expect(excludedFiles).toContain('/static/items');
    expect(shadowRoutes).toEqual([]);
  });

  it('compiles an include_router prefix parameter in a shadow route', async () => {
    const appDir = path.join(testDir, 'app-shadow-router-prefix');
    fs.mkdirSync(path.join(appDir, 'data', '42'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'data', '42', 'report'), 'r');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI, APIRouter',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'router = APIRouter()',
        '@router.get("/report")',
        'def report():',
        '    return "r"',
        'app.include_router(router, prefix="/data/{uid:int}")',
        'app.mount("/data", StaticFiles(directory="data"), name="data")',
      ].join('\n')
    );

    const { shadowRoutes, excludedFiles } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The include prefix's own `uid:int` param compiles to its integer regex.
    // A matching file at data/42/report is excluded from CDN; no shadow emitted.
    expect(excludedFiles).toContain('/data/42/report');
    expect(shadowRoutes).toEqual([]);
  });

  it('reports a shadow route that beats a low-priority frontend', async () => {
    const appDir = path.join(testDir, 'app-shadow-frontend');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', 'collision.txt'), 'file');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '@app.get("/collision.txt")',
        'def collision():',
        '    return "api"',
        'app.frontend("/", directory="dist")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(shadowRoutes).toContainEqual({
      body: 'collision\\.txt',
      methods: ['GET', 'HEAD'],
    });
  });

  it('merges shadow routes with the same body from different methods into one entry', async () => {
    const appDir = path.join(testDir, 'app-merge-methods');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'data.json'), '{}');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'from fastapi.responses import PlainTextResponse',
        'app = FastAPI()',
        '@app.get("/static/data.json", response_class=PlainTextResponse)',
        'def get_data(): return "GET"',
        '@app.post("/static/data.json", response_class=PlainTextResponse)',
        'def post_data(): return "POST"',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const { shadowRoutes, excludedFiles } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The GET route owns the file: excluded from CDN (GET/HEAD routes exclude).
    // The POST route has no GET/HEAD, so a POST-only shadow is emitted.
    // _merge_shadow_routes sees only the POST shadow; GET is not in shadow routes.
    expect(excludedFiles).toContain('/static/data.json');
    const dataRoute = shadowRoutes.filter(
      sr => sr.body === 'static/data\\.json'
    );
    expect(dataRoute).toHaveLength(1);
    expect(dataRoute[0].methods).toEqual(['POST']);
  });

  it('resolves a 404.html frontend fallback', async () => {
    const appDir = path.join(testDir, 'app-fallback-404');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', '404.html'), 'nope');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="dist", fallback="404.html")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts[0].fallback).toEqual({ file: '404.html', status: 404 });
  });

  it('copies static files to CDN output dir', async () => {
    const appDir = path.join(testDir, 'app-collect');
    const outputDir = path.join(testDir, 'output-collect');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body {}');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
      ].join('\n')
    );

    const result = await runFastAPICollectStatic(
      venvPath,
      appDir,
      pythonEnv,
      outputDir,
      entrypointAbs,
      'app'
    );

    expect(result).not.toBeNull();
    expect(result!.discovery.mounts).toContainEqual(
      expect.objectContaining({ urlPath: '/static' })
    );
    // html=False with no index.html: no divergent-URL shadows.
    expect(result!.discovery.shadowRoutes).toEqual([]);
    // A plain StaticFiles mount has no fallback.
    expect(result!.copiedMounts.map(m => m.fallback)).toEqual([null]);
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );
  });

  it('handles multiple mounts', async () => {
    const appDir = path.join(testDir, 'app-multi');
    const outputDir = path.join(testDir, 'output-multi');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body {}');
    fs.writeFileSync(path.join(appDir, 'assets', 'app.js'), 'console.log(1)');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static"), name="static")',
        'app.mount("/assets", StaticFiles(directory="assets"), name="assets")',
      ].join('\n')
    );

    const result = await runFastAPICollectStatic(
      venvPath,
      appDir,
      pythonEnv,
      outputDir,
      entrypointAbs,
      'app'
    );

    expect(result!.discovery.mounts.map(m => m.urlPath)).toEqual([
      '/static',
      '/assets',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outputDir, 'assets', 'app.js'))).toBe(true);
  });

  it('excludes a file owned by an included route under a mounted sub-app prefix', async () => {
    const appDir = path.join(testDir, 'bug-subapp-route');
    fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });
    // The route @router.get("/report") owns data/report; it must be excluded
    // from CDN so the Lambda serves it, not CDN.
    fs.writeFileSync(path.join(appDir, 'data', 'report'), 'api');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'router = APIRouter()',
        '@router.get("/report")',
        'def report():',
        '    return "api"',
        'sub = FastAPI()',
        'sub.include_router(router, prefix="/data")',
        'sub.mount("/data", StaticFiles(directory="data"), name="d")',
        'app = FastAPI()',
        'app.mount("/sub", sub)',
      ].join('\n')
    );

    const { shadowRoutes, excludedFiles } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(excludedFiles).toContain('/sub/data/report');
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: 'sub/data/report' })
    );
  });

  it('normalizes a root frontend path inside a top-level include prefix', async () => {
    const appDir = path.join(testDir, 'bug-top-include-frontend');
    fs.mkdirSync(path.join(appDir, 'inner_dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'inner_dist', 'index.html'), 'idx');
    fs.writeFileSync(path.join(appDir, 'inner_dist', 'app.js'), 'asset');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'fe = APIRouter()',
        'fe.frontend("/", directory="inner_dist")',
        'app = FastAPI()',
        'app.include_router(fe, prefix="/inner")',
      ].join('\n')
    );

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // frontend("/") plus the include prefix carries no trailing slash, so its
    // files stay on the CDN instead of being over-shadowed to the Lambda.
    expect(mounts.map(m => m.urlPath)).toContain('/inner');
    const shadowed = (p: string) =>
      shadowRoutes.some(sr => new RegExp(`^/((?:${sr.body})/?)$`).test(p));
    expect(shadowed('/inner/app.js')).toBe(false);
  });

  it('uses the full prefix for a frontend inside a mounted sub-app', async () => {
    const appDir = path.join(testDir, 'bug-subapp-frontend');
    fs.mkdirSync(path.join(appDir, 'ui_dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'ui_dist', 'asset.txt'), 'ui');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'fe = APIRouter()',
        'fe.frontend("/ui", directory="ui_dist")',
        'sub = FastAPI()',
        'sub.include_router(fe, prefix="/inner")',
        'app = FastAPI()',
        'app.mount("/sub", sub)',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts.map(m => m.urlPath)).toContain('/sub/inner/ui');
  });

  it('does not shadow the subtree of a root mount inside a mounted sub-app', async () => {
    const appDir = path.join(testDir, 'bug-subapp-root-mount');
    fs.mkdirSync(path.join(appDir, 'subfiles'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'subfiles', 'data.txt'), 'sub');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'sub = FastAPI()',
        '@sub.get("/hello")',
        'def hello():',
        '    return {}',
        'sub.mount("/", StaticFiles(directory="subfiles"), name="root")',
        'app = FastAPI()',
        'app.mount("/sub", sub)',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    const shadowed = (p: string) =>
      shadowRoutes.some(sr => new RegExp(`^/((?:${sr.body})/?)$`).test(p));
    // The bare mount root (subtree shadow) reaches the Lambda.
    expect(shadowed('/sub')).toBe(true);
    // The root mount's files stay on the CDN, not shadowed to the Lambda.
    expect(shadowed('/sub/data.txt')).toBe(false);
    // The sub-app's route has no colliding CDN file, so no shadow is emitted;
    // it still reaches the Lambda via the catch-all.
    expect(shadowed('/sub/hello')).toBe(false);
  });

  it('serves a root frontend under a sub-app include prefix from the CDN', async () => {
    const appDir = path.join(testDir, 'bug-subapp-root-frontend');
    fs.mkdirSync(path.join(appDir, 'inner_dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'inner_dist', 'index.html'), 'idx');
    fs.writeFileSync(path.join(appDir, 'inner_dist', 'app.js'), 'asset');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'fe = APIRouter()',
        'fe.frontend("/", directory="inner_dist")',
        'sub = FastAPI()',
        'sub.include_router(fe, prefix="/inner")',
        'app = FastAPI()',
        'app.mount("/sub", sub)',
      ].join('\n')
    );

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // frontend("/") plus the include and mount prefixes carries no trailing
    // slash, so the subtree guard exempts the frontend's files rather than
    // degenerating and shadowing the whole subtree.
    expect(mounts.map(m => m.urlPath)).toContain('/sub/inner');
    const shadowed = (p: string) =>
      shadowRoutes.some(sr => new RegExp(`^/((?:${sr.body})/?)$`).test(p));
    expect(shadowed('/sub/inner')).toBe(false);
    expect(shadowed('/sub/inner/app.js')).toBe(false);
  });

  it('does not offload a frontend guarded by an included router dependency', async () => {
    const appDir = path.join(testDir, 'bug-frontend-auth-include');
    fs.mkdirSync(path.join(appDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'public', 'index.html'), 'pub');
    fs.writeFileSync(path.join(appDir, 'secret', 'index.html'), 'sec');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header',
        'def auth(x_token: str = Header(default=None)):',
        '    if x_token != "secret":',
        '        raise HTTPException(status_code=401)',
        'pub = APIRouter()',
        'pub.frontend("/", directory="public")',
        'sec = APIRouter(dependencies=[Depends(auth)])',
        'sec.frontend("/", directory="secret")',
        'app = FastAPI()',
        'app.include_router(pub, prefix="/pub")',
        'app.include_router(sec, prefix="/admin")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    const urlPaths = mounts.map(m => m.urlPath);
    // A dependency-guarded build stays on the Lambda, not served from the CDN.
    expect(urlPaths).not.toContain('/admin');
    // An unguarded build is still offloaded to the CDN.
    expect(urlPaths).toContain('/pub');
  });

  it('does not offload a frontend guarded by app-level dependencies', async () => {
    const appDir = path.join(testDir, 'bug-frontend-auth-app');
    fs.mkdirSync(path.join(appDir, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'secret', 'index.html'), 'sec');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import Depends, FastAPI, HTTPException, Header',
        'def auth(x_token: str = Header(default=None)):',
        '    if x_token != "secret":',
        '        raise HTTPException(status_code=401)',
        'app = FastAPI(dependencies=[Depends(auth)])',
        'app.frontend("/admin", directory="secret")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts).toHaveLength(0);
  });

  it('cdn=true: promotes frontend guarded by app-level dependencies', async () => {
    const appDir = path.join(testDir, 'bug-frontend-auth-app-cdn-true');
    fs.mkdirSync(path.join(appDir, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'secret', 'index.html'), 'sec');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import Depends, FastAPI, HTTPException, Header',
        'def auth(x_token: str = Header(default=None)):',
        '    if x_token != "secret":',
        '        raise HTTPException(status_code=401)',
        'app = FastAPI(dependencies=[Depends(auth)])',
        'app.frontend("/admin", directory="secret")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      false
    );

    expect(mounts.map(m => m.urlPath)).toEqual(['/admin']);
  });

  it('emits a subtree shadow for a guarded include_router frontend', async () => {
    const appDir = path.join(testDir, 'shadow-frontend-auth-include');
    fs.mkdirSync(path.join(appDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'public', 'index.html'), 'pub');
    fs.writeFileSync(path.join(appDir, 'secret', 'index.html'), 'sec');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, Depends, FastAPI, HTTPException, Header',
        'def auth(x_token: str = Header(default=None)):',
        '    if x_token != "secret":',
        '        raise HTTPException(status_code=401)',
        'pub = APIRouter()',
        'pub.frontend("/", directory="public")',
        'sec = APIRouter(dependencies=[Depends(auth)])',
        'sec.frontend("/", directory="secret")',
        'app = FastAPI()',
        'app.include_router(pub, prefix="/pub")',
        'app.include_router(sec, prefix="/admin")',
      ].join('\n')
    );

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The guarded frontend is not CDN-promoted.
    expect(mounts.map(m => m.urlPath)).not.toContain('/admin');
    // A subtree shadow covers the guarded prefix so colliding files and
    // unguarded fallback routes cannot serve content past the dependency.
    expect(shadowRoutes).toContainEqual({
      body: 'admin(?:/.*)?',
      methods: null,
    });
  });

  it('emits a subtree shadow for a guarded app.frontend() group', async () => {
    const appDir = path.join(testDir, 'shadow-frontend-auth-group');
    fs.mkdirSync(path.join(appDir, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'secret', 'index.html'), 'sec');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import Depends, FastAPI, HTTPException, Header',
        'def auth(x_token: str = Header(default=None)):',
        '    if x_token != "secret":',
        '        raise HTTPException(status_code=401)',
        'app = FastAPI(dependencies=[Depends(auth)])',
        'app.frontend("/admin", directory="secret")',
      ].join('\n')
    );

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The guarded frontend is not CDN-promoted.
    expect(mounts).toHaveLength(0);
    // A subtree shadow covers the guarded prefix.
    expect(shadowRoutes).toContainEqual({
      body: 'admin(?:/.*)?',
      methods: null,
    });
  });

  it('shadows a plain Starlette route inside an included APIRouter', async () => {
    const appDir = path.join(testDir, 'bug-plain-route');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'assets', 'collision.txt'), 'file');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'from fastapi.responses import PlainTextResponse',
        'from fastapi.staticfiles import StaticFiles',
        'from starlette.routing import Route',
        'async def collision(request):',
        '    return PlainTextResponse("route")',
        'plain = APIRouter(routes=[Route("/assets/collision.txt", collision)])',
        'app = FastAPI()',
        'app.include_router(plain)',
        'app.mount("/assets", StaticFiles(directory="assets"), name="a")',
      ].join('\n')
    );

    const { shadowRoutes, excludedFiles } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(excludedFiles).toContain('/assets/collision.txt');
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: 'assets/collision.txt' })
    );
  });

  it('lets a StaticFiles mount win over a colliding frontend file', async () => {
    const appDir = path.join(testDir, 'bug-copy-order');
    const outDir = path.join(appDir, 'out');
    fs.mkdirSync(path.join(appDir, 'static_dir'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'frontend', 'static'), {
      recursive: true,
    });
    fs.writeFileSync(path.join(appDir, 'static_dir', 'collision.txt'), 'MOUNT');
    fs.writeFileSync(
      path.join(appDir, 'frontend', 'static', 'collision.txt'),
      'FRONTEND'
    );
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static_dir"), name="s")',
        'app.frontend("/", directory="frontend")',
      ].join('\n')
    );

    await runFastAPICollectStatic(
      venvPath,
      appDir,
      pythonEnv,
      outDir,
      entrypointAbs,
      'app'
    );

    const served = fs.readFileSync(
      path.join(outDir, 'static', 'collision.txt'),
      'utf8'
    );
    expect(served).toBe('MOUNT');
  });

  it('drops a frontend eclipsed by a StaticFiles mount at the same prefix', async () => {
    const appDir = path.join(testDir, 'frontend-eclipsed');
    fs.mkdirSync(path.join(appDir, 'site'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'fe'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'site', 'index.html'), 'SITE');
    fs.writeFileSync(path.join(appDir, 'fe', 'index.html'), 'FE');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/", StaticFiles(directory="site"), name="site")',
        'app.frontend("/", directory="fe")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The mount at / owns the whole tree, so the low-priority frontend is never
    // reached at runtime and must not be discovered as a mount or a fallback.
    expect(mounts.some(m => m.frontend)).toBe(false);
    expect(mounts.every(m => m.fallback === null)).toBe(true);
    expect(mounts.some(m => !m.frontend)).toBe(true);
  });

  it('keeps a frontend when a mount owns only a sibling prefix', async () => {
    const appDir = path.join(testDir, 'frontend-sibling-mount');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'fe'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'assets', 'logo.txt'), 'LOGO');
    fs.writeFileSync(path.join(appDir, 'fe', 'index.html'), 'FE');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="assets"), name="assets")',
        'app.frontend("/", directory="fe")',
      ].join('\n')
    );

    const { mounts } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The mount owns only /static, so the frontend at / still serves other
    // paths at runtime and must be kept.
    expect(mounts.some(m => m.frontend)).toBe(true);
  });

  it('shadows a mounted sub-app subtree', async () => {
    const appDir = path.join(testDir, 'app-subapp-shadow');
    fs.mkdirSync(appDir, { recursive: true });
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'sub = FastAPI()',
        'app = FastAPI()',
        'app.mount("/api", sub)',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The sub-app owns /api/*, so its whole subtree (including the bare /api
    // root, which the Mount 307s) is shadowed to the Lambda.
    expect(shadowRoutes).toContainEqual({ body: 'api(?:/.*)?', methods: null });
  });

  it('shadows a non-Router sub-app mount subtree so a leaked frontend file cannot win', async () => {
    const appDir = path.join(testDir, 'app-raw-asgi-mount');
    fs.mkdirSync(path.join(appDir, 'fe', 'x'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'fe', 'index.html'), 'FE');
    fs.writeFileSync(path.join(appDir, 'fe', 'x', 'data.txt'), 'LEAK');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'async def raw_asgi(scope, receive, send):',
        "    await send({'type': 'http.response.start', 'status': 200, 'headers': []})",
        "    await send({'type': 'http.response.body', 'body': b'RAW'})",
        'class Wrapper:',
        '    async def __call__(self, scope, receive, send):',
        "        await send({'type': 'http.response.start', 'status': 200, 'headers': []})",
        "        await send({'type': 'http.response.body', 'body': b'WRAP'})",
        'app = FastAPI()',
        'app.mount("/x", raw_asgi)',
        'app.mount("/wrapped", Wrapper())',
        'app.frontend("/", directory="fe")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // A mounted non-Router sub-app (a bare ASGI callable, or a middleware wrapper
    // instance like WSGIMiddleware) owns its subtree at runtime, so the whole
    // subtree is shadowed to the Lambda. That keeps the root frontend fallback
    // from serving index.html for misses under the mount.
    expect(shadowRoutes).toContainEqual({ body: 'x(?:/.*)?', methods: null });
    expect(shadowRoutes).toContainEqual({
      body: 'wrapped(?:/.*)?',
      methods: null,
    });
  });

  it('shadows a non-root StaticFiles mount root in both html modes', async () => {
    const appDir = path.join(testDir, 'app-mount-root-html');
    fs.mkdirSync(path.join(appDir, 'files'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'files', 'index.html'), 'ROOT');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/assets", StaticFiles(directory="files"))',
        'app.mount("/site", StaticFiles(directory="files", html=True))',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(shadowRoutes).toContainEqual({ body: 'assets', methods: null });
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: 'site' })
    );
  });

  it('shadows a root ("/") mount root only when html is disabled', async () => {
    const appDir = path.join(testDir, 'app-root-mount-html');
    fs.mkdirSync(path.join(appDir, 'site'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'site', 'index.html'), 'ROOT');
    const entrypoint = (name: string, html: string) => {
      const p = path.join(appDir, name);
      fs.writeFileSync(
        p,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'app = FastAPI()',
          `app.mount("/", StaticFiles(directory="site", html=${html}))`,
        ].join('\n')
      );
      return p;
    };

    // html=True: "/" serves the site index on both the app and the CDN (no
    // redirect), so the root stays a CDN hit.
    const htmlTrue = await getFastAPIStaticDiscovery(
      venvPath,
      entrypoint('main_html.py', 'True'),
      'app',
      pythonEnv,
      appDir,
      true
    );
    expect(htmlTrue.shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: '' })
    );

    // html=False: the app 404s "/" while the CDN would serve /index.html, so
    // the root is shadowed (the '' body matches only "/").
    const htmlFalse = await getFastAPIStaticDiscovery(
      venvPath,
      entrypoint('main_plain.py', 'False'),
      'app',
      pythonEnv,
      appDir,
      true
    );
    expect(htmlFalse.shadowRoutes).toContainEqual({
      body: '',
      methods: null,
    });
  });

  it('shadows html=False subdirectories that hold a directory index', async () => {
    const appDir = path.join(testDir, 'app-mount-subdir-index');
    fs.mkdirSync(path.join(appDir, 'static', 'docs'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'static', 'empty'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'index.html'), 'ROOT');
    fs.writeFileSync(path.join(appDir, 'static', 'docs', 'index.html'), 'DOCS');
    fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'CSS');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static"), name="s")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The subdir holding an index.html is shadowed; methods: null so both
    // GET and HEAD are intercepted. The empty subdir is not shadowed.
    expect(shadowRoutes).toContainEqual({
      body: 'static/docs',
      methods: null,
    });
    // A subdir without an index 404s on both sides, so it stays on the CDN.
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: 'static/empty' })
    );
  });

  it('shadows html=True subdirectories that hold a directory index', async () => {
    const appDir = path.join(testDir, 'app-mount-subdir-index-html');
    fs.mkdirSync(path.join(appDir, 'static', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'docs', 'index.html'), 'DOCS');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        'app.mount("/static", StaticFiles(directory="static", html=True))',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(shadowRoutes).toEqual([]);
  });

  it('drops a trailing slash from a route shadow body', async () => {
    const appDir = path.join(testDir, 'app-trailing-slash-route');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', 'index.html'), 'spa');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '@app.get("/items/")',
        'def items():',
        '    return "ok"',
        'app.frontend("/", directory="dist")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // redirect_slashes 307s /items to /items/ before the frontend runs, so the
    // body drops the trailing slash and the builder's /? covers both forms.
    expect(shadowRoutes).toContainEqual({
      body: 'items',
      methods: ['GET', 'HEAD'],
    });
    expect(shadowRoutes).not.toContainEqual(
      expect.objectContaining({ body: 'items/' })
    );
  });

  it('shadows a root-mounted sub-app subtree without a leading slash', async () => {
    const appDir = path.join(testDir, 'app-root-mount-subtree');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'assets', 'logo.png'), 'PNG');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'sub = FastAPI()',
        'sub.mount("/static", StaticFiles(directory="assets"))',
        'app = FastAPI()',
        'app.mount("/", sub)',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The root mount owns everything; the builder adds the leading slash, so
    // the subtree body has none and excludes the nested /static mount.
    expect(shadowRoutes).toContainEqual({
      body: '(?!(?:static)(?:/|$)).*',
      methods: null,
    });
  });

  describe('middleware suppresses CDN promotion', () => {
    it('cdn undefined: suppresses mounts with middleware (add_middleware)', async () => {
      const appDir = path.join(testDir, 'mw-toplevel-add');
      fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          'app = FastAPI()',
          'app.add_middleware(BaseHTTPMiddleware)',
          'app.mount("/static", StaticFiles(directory="static"), name="static")',
        ].join('\n')
      );

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

      expect(mounts).toHaveLength(0);
    });

    it('cdn undefined: suppresses mounts with middleware (@app.middleware)', async () => {
      const appDir = path.join(testDir, 'mw-toplevel-decorator');
      fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI, Request',
          'from fastapi.staticfiles import StaticFiles',
          'app = FastAPI()',
          '@app.middleware("http")',
          'async def mw(request: Request, call_next):',
          '    return await call_next(request)',
          'app.mount("/static", StaticFiles(directory="static"), name="static")',
        ].join('\n')
      );

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

      expect(mounts).toHaveLength(0);
    });

    it('cdn undefined: suppresses only the sub-app mounts when it has middleware', async () => {
      const appDir = path.join(testDir, 'mw-subapp');
      fs.mkdirSync(path.join(appDir, 'api_files'), { recursive: true });
      fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'api_files', 'data.json'), '{}');
      fs.writeFileSync(path.join(appDir, 'assets', 'style.css'), 'body{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          '# sub-app has middleware — its mounts must not be promoted',
          'sub = FastAPI()',
          'sub.add_middleware(BaseHTTPMiddleware)',
          'sub.mount("/files", StaticFiles(directory="api_files"), name="files")',
          '# top-level app has no middleware — its mounts are promoted normally',
          'app = FastAPI()',
          'app.mount("/api", sub)',
          'app.mount("/assets", StaticFiles(directory="assets"), name="assets")',
        ].join('\n')
      );

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

      // /api/files is suppressed (sub has middleware); /assets is promoted.
      expect(mounts.map(m => m.urlPath)).toEqual(['/assets']);
    });

    it('cdn undefined: suppresses only the sub-app frontend when it has middleware', async () => {
      const appDir = path.join(testDir, 'mw-subapp-frontend');
      fs.mkdirSync(path.join(appDir, 'spa'), { recursive: true });
      fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'spa', 'index.html'), '<h1>spa</h1>');
      fs.writeFileSync(path.join(appDir, 'assets', 'style.css'), 'body{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          '# sub-app has middleware — its frontend must not be promoted',
          'sub = FastAPI()',
          'sub.add_middleware(BaseHTTPMiddleware)',
          'sub.frontend("/", directory="spa")',
          '# top-level app has no middleware — its mount is promoted normally',
          'app = FastAPI()',
          'app.mount("/api", sub)',
          'app.mount("/assets", StaticFiles(directory="assets"), name="assets")',
        ].join('\n')
      );

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

      // /api frontend is suppressed (sub has middleware); /assets is promoted.
      expect(mounts.map(m => m.urlPath)).toEqual(['/assets']);
    });

    it('cdn undefined: suppresses the sub-app frontend but promotes the root frontend', async () => {
      const appDir = path.join(testDir, 'mw-subapp-frontend-root');
      fs.mkdirSync(path.join(appDir, 'spa'), { recursive: true });
      fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'spa', 'index.html'), '<h1>spa</h1>');
      fs.writeFileSync(
        path.join(appDir, 'dist', 'index.html'),
        '<h1>root</h1>'
      );
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          '# sub-app has middleware — its frontend must not be promoted',
          'sub = FastAPI()',
          'sub.add_middleware(BaseHTTPMiddleware)',
          'sub.frontend("/", directory="spa")',
          '# top-level app has no middleware — root frontend is promoted normally',
          'app = FastAPI()',
          'app.mount("/api", sub)',
          'app.frontend("/", directory="dist")',
        ].join('\n')
      );

      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        true
      );

      // /api frontend is suppressed (sub has middleware); root frontend is promoted.
      const urlPaths = mounts.map(m => m.urlPath);
      expect(urlPaths).not.toContain('/api');
      expect(urlPaths).toContain('/');
    });

    it('cdn=true: promotes mounts with middleware', async () => {
      const appDir = path.join(testDir, 'mw-cdn-true-toplevel');
      fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          'app = FastAPI()',
          'app.add_middleware(BaseHTTPMiddleware)',
          'app.mount("/static", StaticFiles(directory="static"), name="static")',
        ].join('\n')
      );

      // suppressMiddlewareMounts=false mirrors cdn=true in pyproject.toml.
      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        false
      );

      expect(mounts.map(m => m.urlPath)).toEqual(['/static']);
    });

    it('cdn=true: promotes sub-app mounts with middleware', async () => {
      const appDir = path.join(testDir, 'mw-cdn-true-subapp');
      fs.mkdirSync(path.join(appDir, 'api_files'), { recursive: true });
      fs.writeFileSync(path.join(appDir, 'api_files', 'data.json'), '{}');
      const entrypointAbs = path.join(appDir, 'main.py');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import FastAPI',
          'from fastapi.staticfiles import StaticFiles',
          'from starlette.middleware.base import BaseHTTPMiddleware',
          'sub = FastAPI()',
          'sub.add_middleware(BaseHTTPMiddleware)',
          'sub.mount("/files", StaticFiles(directory="api_files"), name="files")',
          'app = FastAPI()',
          'app.mount("/api", sub)',
        ].join('\n')
      );

      // suppressMiddlewareMounts=false mirrors cdn=true in pyproject.toml.
      const { mounts } = await getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir,
        false
      );

      // Sub-app middleware is ignored when cdn=true; /api/files is promoted.
      expect(mounts.map(m => m.urlPath)).toEqual(['/api/files']);
    });
  });
});
