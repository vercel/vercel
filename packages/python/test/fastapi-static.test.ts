import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIFrontendConfig,
  getFastAPIStaticMounts,
  runFastAPICollectStatic,
} from '../src/fastapi';
import { getVenvPythonBin } from '../src/utils';

describe('FastAPI frontend config', () => {
  const temporaryDirectories: string[] = [];

  afterAll(() => {
    for (const directory of temporaryDirectories) {
      fs.removeSync(directory);
    }
  });

  function writePyproject(contents: string): string {
    const directory = fs.mkdtempSync(
      path.join(tmpdir(), 'fastapi-frontend-config-')
    );
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'pyproject.toml'), contents);
    return directory;
  }

  it('enables optimized frontend delivery by default', async () => {
    const directory = writePyproject('[project]\nname = "app"\n');

    await expect(getFastAPIFrontendConfig(directory)).resolves.toEqual({
      cdn: true,
    });
  });

  it('defaults configured frontend delivery to CDN with an automatic proxy', async () => {
    const directory = writePyproject('[tool.vercel.fastapi.frontend]\n');

    await expect(getFastAPIFrontendConfig(directory)).resolves.toEqual({
      cdn: true,
    });
  });

  it('supports disabling the generated proxy', async () => {
    const directory = writePyproject(
      ['[tool.vercel.fastapi.frontend]', 'cdn = true', 'proxy = false'].join(
        '\n'
      )
    );

    await expect(getFastAPIFrontendConfig(directory)).resolves.toEqual({
      cdn: true,
      proxy: false,
    });
  });

  it('supports opting out of frontend CDN delivery', async () => {
    const directory = writePyproject(
      '[tool.vercel.fastapi.frontend]\ncdn = false\n'
    );

    await expect(getFastAPIFrontendConfig(directory)).resolves.toEqual({
      cdn: false,
    });
  });

  it('supports an explicit Python proxy entrypoint', async () => {
    const directory = writePyproject(
      ['[tool.vercel.fastapi.frontend]', 'proxy = "frontend_proxy:proxy"'].join(
        '\n'
      )
    );
    fs.writeFileSync(
      path.join(directory, 'frontend_proxy.py'),
      'async def proxy(request):\n    return None\n'
    );

    await expect(getFastAPIFrontendConfig(directory)).resolves.toEqual({
      cdn: true,
      proxy: 'frontend_proxy:proxy',
    });
  });

  it('rejects invalid CDN and proxy configuration', async () => {
    const invalidCdn = writePyproject(
      '[tool.vercel.fastapi.frontend]\ncdn = "yes"\n'
    );
    await expect(getFastAPIFrontendConfig(invalidCdn)).rejects.toThrow(
      'frontend.cdn'
    );

    const invalidProxy = writePyproject(
      '[tool.vercel.fastapi.frontend]\nproxy = "proxy.py"\n'
    );
    await expect(getFastAPIFrontendConfig(invalidProxy)).rejects.toThrow(
      'module:object'
    );

    const missingProxy = writePyproject(
      '[tool.vercel.fastapi.frontend]\nproxy = "missing:proxy"\n'
    );
    await expect(getFastAPIFrontendConfig(missingProxy)).rejects.toThrow(
      'does not resolve'
    );

    const disabledCdnWithProxy = writePyproject(
      ['[tool.vercel.fastapi.frontend]', 'cdn = false', 'proxy = false'].join(
        '\n'
      )
    );
    await expect(
      getFastAPIFrontendConfig(disabledCdnWithProxy)
    ).rejects.toThrow('cannot be configured');
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

  it('does not promote an ordinary StaticFiles mount', async () => {
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

    expect(mounts).toHaveLength(0);
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

  it('copies concrete app.frontend() files to the CDN output dir', async () => {
    const appDir = path.join(testDir, 'app-collect');
    const outputDir = path.join(testDir, 'output-collect');
    fs.mkdirSync(path.join(appDir, 'static'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'static', 'style.css'), 'body {}');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/static", directory="static")',
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
    expect(result!.collectedRequestPaths).toContain('/static/style.css');
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );
  });

  it('preserves multiple frontend mounts', async () => {
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
        'app = FastAPI()',
        'app.frontend("/static", directory="static")',
        'app.frontend("/assets", directory="assets")',
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

  it('does not let a frontend file beat a colliding API route', async () => {
    const appDir = path.join(testDir, 'app-collision');
    const outputDir = path.join(testDir, 'output-collision');
    fs.mkdirSync(path.join(appDir, 'frontend'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'frontend', 'asset.txt'),
      'frontend asset'
    );
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        '@app.get("/asset.txt")',
        'def asset():',
        '    return {"source": "api"}',
        'app.frontend("/", directory="frontend")',
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
    expect(result!.collectedRequestPaths).not.toContain('/asset.txt');
    expect(fs.existsSync(path.join(outputDir, 'asset.txt'))).toBe(false);
  });
});
