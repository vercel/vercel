import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIStaticDiscovery,
  getFastAPICdnBundle,
  runFastAPICollectStatic,
} from '../src/fastapi';
import { getVenvPythonBin } from '../src/utils';

describe('getFastAPICdnBundle', () => {
  const workPath = '/work';

  it('returns exclude patterns and directory stubs for each mount', () => {
    const result = getFastAPICdnBundle(
      [
        {
          urlPath: '/static',
          directory: '/work/my_files',
          fallback: null,
          frontend: false,
        },
      ],
      workPath,
      { static: { exclude: true } }
    );
    expect(result.excludePatterns).toEqual(['my_files/**']);
    expect(result.directoryStubs).toHaveProperty(
      'my_files/.static-placeholder'
    );
    expect(result.redirects).toEqual([]);
  });

  it('handles multiple mounts', () => {
    const result = getFastAPICdnBundle(
      [
        {
          urlPath: '/static',
          directory: '/work/static',
          fallback: null,
          frontend: false,
        },
        {
          urlPath: '/assets',
          directory: '/work/assets',
          fallback: null,
          frontend: false,
        },
      ],
      workPath,
      { static: { exclude: true } }
    );
    expect(result.excludePatterns).toEqual(['static/**', 'assets/**']);
    expect(result.directoryStubs).toHaveProperty('static/.static-placeholder');
    expect(result.directoryStubs).toHaveProperty('assets/.static-placeholder');
  });

  // CDN redirect routes sit before shadow routes so they fire first, letting
  // the CDN issue the 307 directly without involving the Lambda.
  it('adds bare directory redirect routes for frontend mounts', () => {
    // Use a directory name that differs from the URL prefix to confirm
    // redirect src/dest are URL-based, not filesystem-path-based.
    const distDir = path.join(tmpdir(), `fastapi-cdn-dist-${Date.now()}`);
    fs.mkdirSync(path.join(distDir, 'guide', 'section'), { recursive: true });
    try {
      const result = getFastAPICdnBundle(
        [
          {
            urlPath: '/frontend',
            directory: distDir,
            fallback: null,
            frontend: true,
          },
        ],
        path.dirname(distDir),
        { static: { exclude: true } }
      );
      expect(result.redirects).toContainEqual(
        expect.objectContaining({
          src: '^/frontend/guide$',
          dest: '/frontend/guide/',
          status: 307,
        })
      );
      expect(result.redirects).toContainEqual(
        expect.objectContaining({
          src: '^/frontend/guide/section$',
          dest: '/frontend/guide/section/',
          status: 307,
        })
      );
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  it('returns empty bundle when exclude is not set (default false)', () => {
    const result = getFastAPICdnBundle(
      [{ urlPath: '/static', directory: '/work/static' }],
      workPath,
      undefined
    );
    expect(result.excludePatterns).toEqual([]);
    expect(result.directoryStubs).toEqual({});
  });

  it('returns empty bundle when exclude is explicitly false', () => {
    const result = getFastAPICdnBundle(
      [{ urlPath: '/static', directory: '/work/static' }],
      workPath,
      { static: { exclude: false } }
    );
    expect(result.excludePatterns).toEqual([]);
    expect(result.directoryStubs).toEqual({});
  });

  it('skips mounts outside workPath', () => {
    const result = getFastAPICdnBundle(
      [{ urlPath: '/static', directory: '/other/static' }],
      workPath,
      undefined
    );
    expect(result.excludePatterns).toEqual([]);
    expect(result.directoryStubs).toEqual({});
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
    // The bare mount root 307s to its trailing-slash form, so it is shadowed.
    expect(shadowRoutes).toEqual([{ body: 'static', methods: ['GET'] }]);
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

  it('reports a shadow route for a route declared before a mount', async () => {
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

    const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(mounts).toHaveLength(1);
    // The mount root body, plus the route's pattern body (path minus
    // leading slash, regex-escaped).
    expect(shadowRoutes).toEqual([
      { body: 'static', methods: ['GET'] },
      { body: 'static/example\\.txt', methods: ['GET'] },
    ]);
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

    // html=True 307s the bare mount root and each bare directory holding an
    // index.html, so those reach the Lambda. The `(?!/)` keeps the slash form
    // (a CDN index hit) and the files below it on the CDN.
    expect(shadowRoutes).toContainEqual({
      body: 'site(?!/)',
      methods: ['GET'],
    });
    expect(shadowRoutes).toContainEqual({
      body: 'site/guide(?!/)',
      methods: ['GET'],
    });
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

    // The frontend 307s bare "/guide" to "/guide/", so only the bare form
    // reaches the Lambda; "/guide/" and "/" stay CDN index hits.
    expect(shadowRoutes).toContainEqual({
      body: 'guide(?!/)',
      methods: ['GET'],
    });
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

    const shadowed = (p: string) =>
      shadowRoutes.some(sr => new RegExp(`^/((?:${sr.body})/?)$`).test(p));
    // The frontend 307s /spa/sub to /spa/sub/, so the bare subdir reaches the
    // Lambda while the files below it stay on the CDN.
    expect(shadowed('/spa/sub')).toBe(true);
    expect(shadowed('/spa/sub/app.js')).toBe(false);
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
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from fastapi.staticfiles import StaticFiles',
        'app = FastAPI()',
        `@app.get("/p/${param}")`,
        'def handler(x):',
        '    return x',
        'app.mount("/p", StaticFiles(directory="assets"), name="p")',
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

    // The convertor regex body, plus the bare mount root ("/p").
    expect(shadowRoutes).toEqual([
      { body: 'p', methods: ['GET'] },
      { body: expected, methods: ['GET'] },
    ]);
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

  it('shadows a mount from a catch-all {path} route declared before it', async () => {
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

  it('shadows a mount from a route with a parameter in the prefix position', async () => {
    const appDir = path.join(testDir, 'app-shadow-prefix-param');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
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

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // `{category}` matches the mount's literal `static` segment, so
    // `/static/items` is shadowed to the app, alongside the bare mount root.
    expect(shadowRoutes).toEqual([
      { body: '(?:[^/]+)/items', methods: ['GET'] },
      { body: 'static', methods: ['GET'] },
    ]);
  });

  it('compiles an include_router prefix parameter in a shadow route', async () => {
    const appDir = path.join(testDir, 'app-shadow-router-prefix');
    fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });
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

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // The include prefix's own `uid:int` param compiles to its integer regex in
    // the shadow body, alongside the bare mount root.
    expect(shadowRoutes).toEqual([
      { body: 'data', methods: ['GET'] },
      { body: 'data/(?:[0-9]+)/report', methods: ['GET'] },
    ]);
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

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    // GET and POST routes on the same path must be merged into one shadow so
    // a single CDN route covers both methods rather than emitting duplicates.
    const dataRoute = shadowRoutes.filter(
      sr => sr.body === 'static/data\\.json'
    );
    expect(dataRoute).toHaveLength(1);
    // Not a frontend mount, so HEAD is not added; GET and POST are merged.
    expect(dataRoute[0].methods).toEqual(['GET', 'POST']);
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
    expect(result!.collectedMounts).toContainEqual(
      expect.objectContaining({ urlPath: '/static' })
    );
    expect(result!.shadowRoutes).toEqual([
      { body: 'static', methods: ['GET'] },
    ]);
    expect(result!.fallbacks).toEqual([]);
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

    expect(result!.collectedMounts.map(m => m.urlPath)).toEqual([
      '/static',
      '/assets',
    ]);
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outputDir, 'assets', 'app.js'))).toBe(true);
  });

  it('shadows an included route under a mounted sub-app prefix', async () => {
    const appDir = path.join(testDir, 'bug-subapp-route');
    fs.mkdirSync(path.join(appDir, 'data'), { recursive: true });
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

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(shadowRoutes).toContainEqual({
      body: 'sub/data/report',
      methods: ['GET'],
    });
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
    // The bare mount root (307) and the sub-app's route reach the Lambda.
    expect(shadowed('/sub')).toBe(true);
    expect(shadowed('/sub/hello')).toBe(true);
    // The root mount's files stay on the CDN, not shadowed to the Lambda.
    expect(shadowed('/sub/data.txt')).toBe(false);
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
    // The bare mount root (307) reaches the Lambda.
    expect(shadowed('/sub/inner')).toBe(true);
    // The copied frontend files stay on the CDN.
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

  it('shadows a plain Starlette route inside an included APIRouter', async () => {
    const appDir = path.join(testDir, 'bug-plain-route');
    fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });
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

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir,
      true
    );

    expect(shadowRoutes).toContainEqual({
      body: 'assets/collision\\.txt',
      methods: ['GET', 'HEAD'],
    });
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

    // A bare non-root mount root 307s to its trailing-slash form in both html
    // modes, so the bare form reaches the Lambda. html=True offloads the slash
    // form to the CDN (the `(?!/)` body); html=False shadows both forms.
    expect(shadowRoutes).toContainEqual({ body: 'assets', methods: ['GET'] });
    expect(shadowRoutes).toContainEqual({
      body: 'site(?!/)',
      methods: ['GET'],
    });
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
      methods: ['GET'],
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

    // html=False 404s /static/docs and /static/docs/, but the CDN resolves
    // static/docs/index.html as an index, so the subdir is shadowed.
    expect(shadowRoutes).toContainEqual({
      body: 'static/docs',
      methods: ['GET'],
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

    // html=True 307s bare /static/docs to /static/docs/, so only the bare form
    // reaches the Lambda; the slash form is a CDN index hit.
    expect(shadowRoutes).toContainEqual({
      body: 'static/docs(?!/)',
      methods: ['GET'],
    });
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
