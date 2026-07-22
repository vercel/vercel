import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  clearFastAPIRoutesManifest,
  getFastAPIStaticMounts,
  inspectFastAPIApp,
  runFastAPICollectStatic,
  writeFastAPIRoutesManifest,
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

    const mounts = await getFastAPIStaticMounts(
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

    const mounts = await getFastAPIStaticMounts(
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
  });

  it('discovers effective routes from a package entrypoint', async () => {
    const appDir = path.join(testDir, 'app-package');
    fs.mkdirSync(path.join(appDir, 'app', 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'app', '__init__.py'), '');
    fs.writeFileSync(
      path.join(appDir, 'app', 'routes.py'),
      [
        'from fastapi import APIRouter',
        'router = APIRouter()',
        '@router.get("/users/{user_id}")',
        'def get_user(user_id: str):',
        '    return {"user_id": user_id}',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(appDir, 'app', 'main.py'),
      [
        'from fastapi import FastAPI',
        'from .routes import router',
        'app = FastAPI()',
        'app.include_router(router, prefix="/api")',
        'app.frontend("/", directory="app/dist")',
      ].join('\n')
    );

    const inspection = await inspectFastAPIApp(
      venvPath,
      path.join(appDir, 'app', 'main.py'),
      'app',
      pythonEnv,
      appDir
    );

    expect(inspection).not.toBeNull();
    expect(inspection!.staticMounts).toEqual([
      {
        urlPath: '/',
        directory: fs.realpathSync(path.join(appDir, 'app', 'dist')),
      },
    ]);
    expect(inspection!.routes).toContainEqual({
      source: '/api/users/{user_id}',
      src: '^/api/users/(?:[^/]+)$',
      methods: ['GET'],
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

    const mounts = await getFastAPIStaticMounts(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir
    );

    expect(mounts).toHaveLength(0);
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

describe('FastAPI routes manifest', () => {
  it('preserves existing routes and removes only generated routes', async () => {
    const workPath = path.join(
      tmpdir(),
      `fastapi-routes-manifest-${Date.now()}`
    );
    const manifestPath = path.join(workPath, '.vercel', 'routes.json');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeJSONSync(manifestPath, {
      metadata: 'preserved',
      routes: [{ source: '/existing/:id', methods: ['GET'] }],
    });

    await writeFastAPIRoutesManifest(workPath, [
      {
        source: '/api/items/{item_id}',
        src: '^/api/items/(?:[^/]+)$',
        methods: ['GET'],
      },
    ]);

    expect(fs.readJSONSync(manifestPath)).toEqual({
      metadata: 'preserved',
      routes: [
        { source: '/existing/:id', methods: ['GET'] },
        {
          source: '/api/items/{item_id}',
          src: '^/api/items/(?:[^/]+)$',
          methods: ['GET'],
          priority: 'before-filesystem',
          origin: 'fastapi',
        },
      ],
    });

    await clearFastAPIRoutesManifest(workPath);
    expect(fs.readJSONSync(manifestPath)).toEqual({
      metadata: 'preserved',
      routes: [{ source: '/existing/:id', methods: ['GET'] }],
    });

    fs.removeSync(workPath);
  });
});
