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
      appDir
    );

    expect(shadowRoutes).toContain('sub/data/report');
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
      appDir
    );

    expect(mounts.map(m => m.urlPath)).toContain('/sub/inner/ui');
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
      appDir
    );

    expect(shadowRoutes).toContain('assets/collision\\.txt');
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
      appDir
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
      appDir
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
      appDir
    );

    // The sub-app owns /api/*, so its whole subtree (including the bare /api
    // root, which the Mount 307s) is shadowed to the Lambda.
    expect(shadowRoutes).toContain('api(?:/.*)?');
  });

  it('shadows a raw ASGI mount subtree so a leaked frontend file cannot win', async () => {
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
        'app = FastAPI()',
        'app.mount("/x", raw_asgi)',
        'app.frontend("/", directory="fe")',
      ].join('\n')
    );

    const { shadowRoutes } = await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir
    );

    // A raw ASGI mount owns /x/* at runtime, so its whole subtree is shadowed to
    // the Lambda, keeping the frontend's colliding x/data.txt copy off the CDN.
    expect(shadowRoutes).toContain('x(?:/.*)?');
  });

  it('shadows a StaticFiles mount root only when html is disabled', async () => {
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
      appDir
    );

    // html=False: the root 404s and /assets redirects, so it is shadowed.
    expect(shadowRoutes).toContain('assets');
    // html=True: the CDN serves the directory index, matching the app.
    expect(shadowRoutes).not.toContain('site');
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
      appDir
    );

    // html=False 404s /static/docs and /static/docs/, but the CDN resolves
    // static/docs/index.html as an index, so the subdir is shadowed.
    expect(shadowRoutes).toContain('static/docs');
    // A subdir without an index 404s on both sides, so it stays on the CDN.
    expect(shadowRoutes).not.toContain('static/empty');
  });

  it('does not shadow subdirectories when html is enabled', async () => {
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
      appDir
    );

    // html=True serves the directory index at runtime, matching the CDN.
    expect(shadowRoutes).not.toContain('static/docs');
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
      appDir
    );

    // redirect_slashes 307s /items to /items/ before the frontend runs, so the
    // body drops the trailing slash and the builder's /? covers both forms.
    expect(shadowRoutes).toContain('items');
    expect(shadowRoutes).not.toContain('items/');
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
      appDir
    );

    // The root mount owns everything; the builder adds the leading slash, so
    // the subtree body has none and excludes the nested /static mount.
    expect(shadowRoutes).toContain('(?!(?:static)(?:/|$)).*');
  });
});
