import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIStaticDiscovery,
  runFastAPICollectStatic,
} from '../src/fastapi';
import { getVenvPythonBin } from '../src/utils';

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
      appDir
    );

    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/static');
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'static'))
    );
    expect(mounts[0].fallback).toBeNull();
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
      appDir
    );

    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/');
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'dist'))
    );
    // fallback="auto" resolves to the index.html present in the build dir.
    expect(mounts[0].fallback).toEqual({ file: 'index.html', status: 200 });
  });

  // These entrypoints use first-party imports: relative (`from .settings`) or
  // absolute (`import settings`). Their frontend mount must still be discovered.
  // This works only if the shim imports the entrypoint as a real module with
  // the project root importable. If the import fails, discovery returns no
  // mounts and the frontend is served by the Lambda, not the CDN.
  describe('discovers mounts for entrypoints using first-party imports', () => {
    const SETTINGS = 'FRONTEND_DIR = "dist"\n';
    // A minimal FastAPI entrypoint. Its frontend directory comes from a
    // first-party import, so the mount appears only if that import resolves.
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
        appDir
      );

      expect(mounts).toHaveLength(1);
      expect(mounts[0].urlPath).toBe('/');
      expect(mounts[0].directory).toBe(
        fs.realpathSync(path.join(appDir, 'dist'))
      );
      expect(mounts[0].fallback).toEqual({ file: 'index.html', status: 200 });
    });
  });

  // The mount can be defined in an imported module rather than the entrypoint:
  // a router, a helper, a re-exported app, a factory, or a mounted sub-app.
  // Discovery must still find it. This works only when the entrypoint import
  // succeeds, so each case also exercises the first-party import path.
  describe('discovers mounts sourced from imported modules', () => {
    type Expected = {
      urlPath: string;
      dir: string;
      fallback: { file: string; status: number } | null;
    };
    // The common shape: a frontend build served at "/" from the dist dir.
    const FRONTEND: Expected = {
      urlPath: '/',
      dir: 'dist',
      fallback: { file: 'index.html', status: 200 },
    };

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
        expected: [{ urlPath: '/api/static', dir: 'static', fallback: null }],
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
        expected: [{ urlPath: '/static', dir: 'static', fallback: null }],
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
        expected: [{ urlPath: '/sub/static', dir: 'static', fallback: null }],
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
      // Build the directories the apps mount from.
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
        appDir
      );

      const got = mounts
        .map(m => ({
          urlPath: m.urlPath,
          directory: m.directory,
          fallback: m.fallback,
        }))
        .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
      const want = expected
        .map(e => ({
          urlPath: e.urlPath,
          directory: fs.realpathSync(path.join(appDir, e.dir)),
          fallback: e.fallback,
        }))
        .sort((a, b) => a.urlPath.localeCompare(b.urlPath));
      expect(got).toEqual(want);
    });
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
      appDir
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
      appDir
    );

    // The sub-app isn't a StaticFiles or a Router, but its own mount must still
    // be found under the parent prefix.
    expect(mounts).toHaveLength(1);
    expect(mounts[0].urlPath).toBe('/sub/static');
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
      appDir
    );

    expect(mounts).toHaveLength(1);
    // A pattern body (path minus leading slash, regex-escaped).
    expect(shadowRoutes).toEqual(['static/example\\.txt']);
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
      appDir
    );

    expect(shadowRoutes).toEqual([expected]);
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
      appDir
    );

    // The `:path` convertor covers the mount prefix, so the catch-all shadows
    // the mount's whole subtree.
    expect(shadowRoutes).toEqual(['(?:.*)']);
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
      appDir
    );

    // `{category}` matches the mount's literal `static` segment, so
    // `/static/items` is shadowed to the app.
    expect(shadowRoutes).toEqual(['(?:[^/]+)/items']);
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
      appDir
    );

    // The include prefix's own `uid:int` param compiles to its integer regex in
    // the shadow body.
    expect(shadowRoutes).toEqual(['data/(?:[0-9]+)/report']);
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
      appDir
    );

    expect(shadowRoutes).toContain('collision\\.txt');
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
      appDir
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
    expect(result!.collectedMounts).toContain('/static');
    expect(result!.shadowRoutes).toEqual([]);
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

    expect(result!.collectedMounts).toEqual(['/static', '/assets']);
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outputDir, 'assets', 'app.js'))).toBe(true);
  });
});
