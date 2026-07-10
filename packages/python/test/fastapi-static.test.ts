import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIStaticMounts,
  runFastAPICollectStatic,
} from '../src/fastapi';
import { getVenvPythonBin } from '../src/utils';

describe('FastAPI frontend files', () => {
  let testDir: string;
  let venvPath: string;
  let pythonEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    testDir = path.join(tmpdir(), `fastapi-frontend-${Date.now()}`);
    venvPath = path.join(testDir, '.venv');
    fs.mkdirSync(testDir, { recursive: true });
    await execa('uv', ['venv', venvPath, '--python', 'python3.12']);
    await execa(
      'uv',
      [
        'pip',
        'install',
        'fastapi==0.139.0',
        '--python',
        getVenvPythonBin(venvPath),
      ],
      { env: { ...process.env, VIRTUAL_ENV: venvPath } }
    );
    pythonEnv = { ...process.env, VIRTUAL_ENV: venvPath };
  }, 120_000);

  afterAll(() => {
    if (testDir && fs.existsSync(testDir)) fs.removeSync(testDir);
  });

  it('does not collect ordinary StaticFiles mounts', async () => {
    const appDir = path.join(testDir, 'ordinary-static');
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

    expect(mounts).toEqual([]);
  });

  it('discovers an app.frontend() registration', async () => {
    const appDir = path.join(testDir, 'direct-frontend');
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

    expect(mounts).toEqual([
      {
        urlPath: '/',
        directory: fs.realpathSync(path.join(appDir, 'dist')),
        excludedPaths: [],
      },
    ]);
  });

  it('composes nested APIRouter prefixes', async () => {
    const appDir = path.join(testDir, 'nested-router');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', 'app.js'), 'console.log(1)');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'app = FastAPI()',
        'outer = APIRouter(prefix="/outer")',
        'inner = APIRouter(prefix="/inner")',
        'inner.frontend("/", directory="dist")',
        'outer.include_router(inner, prefix="/child")',
        'app.include_router(outer, prefix="/api")',
      ].join('\n')
    );

    const mounts = await getFastAPIStaticMounts(
      venvPath,
      entrypointAbs,
      'app',
      pythonEnv,
      appDir
    );

    expect(mounts).toEqual([
      {
        urlPath: '/api/outer/child/inner',
        directory: fs.realpathSync(path.join(appDir, 'dist')),
        excludedPaths: [],
      },
    ]);
  });

  it('imports the entrypoint with its runtime package name', async () => {
    const appDir = path.join(testDir, 'package-import');
    const packageDir = path.join(appDir, 'backend');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'dist', 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(packageDir, '__init__.py'), '');
    fs.writeFileSync(
      path.join(packageDir, 'settings.py'),
      'FRONTEND_DIRECTORY = "dist"\n'
    );
    const entrypointAbs = path.join(packageDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'from .settings import FRONTEND_DIRECTORY',
        'app = FastAPI()',
        'app.frontend("/", directory=FRONTEND_DIRECTORY)',
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
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'dist'))
    );
  });

  it('keeps files claimed by normal routes out of CDN output', async () => {
    const appDir = path.join(testDir, 'route-collisions');
    const distDir = path.join(appDir, 'dist');
    const outputDir = path.join(appDir, 'output');
    fs.mkdirSync(path.join(distDir, 'api'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'api', 'included'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'section'), { recursive: true });
    fs.writeFileSync(path.join(distDir, 'api', 'collision.txt'), 'static');
    fs.writeFileSync(
      path.join(distDir, 'api', 'included', 'collision.txt'),
      'static'
    );
    fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'static');
    fs.writeFileSync(path.join(distDir, 'section', 'index.html'), 'static');
    fs.writeFileSync(path.join(distDir, 'docs'), 'static');
    fs.writeFileSync(path.join(distDir, 'socket'), 'static');
    fs.writeFileSync(path.join(distDir, 'safe.txt'), 'safe');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'app = FastAPI()',
        '@app.get("/api/collision.txt")',
        'def collision(): return "api"',
        '@app.post("/assets/{name}")',
        'def dynamic(name: str): return name',
        '@app.get("/section")',
        'def section(): return "api"',
        '@app.websocket("/socket")',
        'async def socket(websocket): pass',
        'included = APIRouter()',
        '@included.get("/collision.txt")',
        'def included_collision(): return "api"',
        'app.include_router(included, prefix="/api/included")',
        'app.frontend("/", directory="dist")',
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
    expect(fs.existsSync(path.join(outputDir, 'safe.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'api', 'collision.txt'))).toBe(
      false
    );
    expect(
      fs.existsSync(path.join(outputDir, 'api', 'included', 'collision.txt'))
    ).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'assets', 'app.js'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'section', 'index.html'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(outputDir, 'docs'))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, 'socket'))).toBe(false);
  });

  it('does not publish files shadowed by a more specific frontend', async () => {
    const appDir = path.join(testDir, 'frontend-precedence');
    const rootDir = path.join(appDir, 'root-dist');
    const nestedDir = path.join(appDir, 'nested-dist');
    const outputDir = path.join(appDir, 'output');
    fs.mkdirSync(path.join(rootDir, 'admin'), { recursive: true });
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'shared.txt'), 'root');
    fs.writeFileSync(path.join(rootDir, 'admin', 'root-only.txt'), 'root');
    fs.writeFileSync(path.join(nestedDir, 'nested-only.txt'), 'nested');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import APIRouter, FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="root-dist")',
        'nested = APIRouter()',
        'nested.frontend("/", directory="nested-dist")',
        'app.include_router(nested, prefix="/admin")',
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

    expect(result?.collectedMounts).toEqual(['/', '/admin']);
    expect(fs.existsSync(path.join(outputDir, 'shared.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'admin', 'root-only.txt'))).toBe(
      false
    );
    expect(
      fs.existsSync(path.join(outputDir, 'admin', 'nested-only.txt'))
    ).toBe(true);
  });
});
