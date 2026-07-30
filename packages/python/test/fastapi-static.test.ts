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
