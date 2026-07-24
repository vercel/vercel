import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import execa from 'execa';
import {
  getFastAPIFrontendConfig,
  getFastAPIStaticDiscovery,
  getFastAPIStaticMounts,
  pruneFastAPIFrontendFiles,
  runFastAPICollectStatic,
} from '../src/fastapi';
import { getVenvPythonBin } from '../src/utils';
import { glob, isDirectory } from '@vercel/build-utils';

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

describe('FastAPI static files', () => {
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

  it('imports the entrypoint by module name for package-relative imports', async () => {
    const appDir = path.join(testDir, 'package-import');
    const packageDir = path.join(appDir, 'backend');
    fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, '__init__.py'), '');
    fs.writeFileSync(
      path.join(packageDir, 'settings.py'),
      'FRONTEND_DIRECTORY = "dist"\n'
    );
    fs.writeFileSync(
      path.join(packageDir, 'main.py'),
      [
        'from fastapi import FastAPI',
        'from .settings import FRONTEND_DIRECTORY',
        'app = FastAPI()',
        'app.frontend("/", directory=FRONTEND_DIRECTORY)',
      ].join('\n')
    );

    const mounts = await getFastAPIStaticMounts(
      venvPath,
      path.join(packageDir, 'main.py'),
      'app',
      pythonEnv,
      appDir
    );

    expect(mounts).toHaveLength(1);
    expect(mounts[0].directory).toBe(
      fs.realpathSync(path.join(appDir, 'dist'))
    );
  });

  it('fails the build when the application cannot be imported', async () => {
    const appDir = path.join(testDir, 'import-error');
    fs.mkdirSync(appDir, { recursive: true });
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(entrypointAbs, 'raise RuntimeError("import exploded")\n');

    await expect(
      getFastAPIStaticDiscovery(
        venvPath,
        entrypointAbs,
        'app',
        pythonEnv,
        appDir
      )
    ).rejects.toMatchObject({
      code: 'PYTHON_FASTAPI_FRONTEND_DISCOVERY_FAILED',
      message: expect.stringContaining('import exploded'),
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

  it('allows a missing frontend directory when check_dir is false', async () => {
    const appDir = path.join(testDir, 'missing-frontend-directory');
    const outputDir = path.join(testDir, 'output-missing-directory');
    fs.mkdirSync(appDir, { recursive: true });
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="missing", check_dir=False, fallback=None)',
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

    const lambdaFiles = await glob('**', { cwd: appDir });
    await expect(
      pruneFastAPIFrontendFiles(lambdaFiles, appDir, result!)
    ).resolves.toBeUndefined();
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
    expect(result!.promotedSourcePaths).toEqual([
      fs.realpathSync(path.join(appDir, 'static', 'style.css')),
    ]);
    expect(result!.runtimeRequiredSourcePaths).toEqual([]);
    expect(fs.existsSync(path.join(outputDir, 'static', 'style.css'))).toBe(
      true
    );

    const lambdaFiles = await glob('**', { cwd: appDir });
    await pruneFastAPIFrontendFiles(lambdaFiles, appDir, result!);
    expect(lambdaFiles['static/style.css']).toBeUndefined();
    expect(lambdaFiles.static).toBeDefined();
    expect(isDirectory(lambdaFiles.static.mode)).toBe(true);
  });

  it('retains only the active FastAPI fallback in the Lambda', async () => {
    const appDir = path.join(testDir, 'app-fallback');
    const outputDir = path.join(testDir, 'output-fallback');
    const frontendDir = path.join(appDir, 'frontend');
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(path.join(frontendDir, 'index.html'), 'index fallback');
    fs.writeFileSync(path.join(frontendDir, '404.html'), '404 fallback');
    fs.writeFileSync(path.join(frontendDir, 'app.js'), 'asset');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/", directory="frontend", fallback="auto")',
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
    expect(result!.runtimeRequiredSourcePaths).toEqual([
      fs.realpathSync(path.join(frontendDir, '404.html')),
    ]);

    const lambdaFiles = await glob('**', { cwd: appDir });
    await pruneFastAPIFrontendFiles(lambdaFiles, appDir, result!);

    expect(lambdaFiles['frontend/404.html']).toBeDefined();
    expect(lambdaFiles['frontend/index.html']).toBeUndefined();
    expect(lambdaFiles['frontend/app.js']).toBeUndefined();
    expect(isDirectory(lambdaFiles.frontend.mode)).toBe(true);
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

  it('preserves more-specific frontend precedence in either registration order', async () => {
    for (const nestedFirst of [false, true]) {
      const suffix = nestedFirst ? 'nested-first' : 'root-first';
      const appDir = path.join(testDir, `app-precedence-${suffix}`);
      const outputDir = path.join(testDir, `output-precedence-${suffix}`);
      const rootDir = path.join(appDir, 'root-frontend');
      const nestedDir = path.join(appDir, 'nested-frontend');
      fs.mkdirSync(path.join(rootDir, 'admin'), { recursive: true });
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(
        path.join(rootDir, 'admin', 'shared.txt'),
        'root shared'
      );
      fs.writeFileSync(
        path.join(rootDir, 'admin', 'root-only.txt'),
        'root only'
      );
      fs.writeFileSync(path.join(nestedDir, 'shared.txt'), 'nested shared');
      const entrypointAbs = path.join(appDir, 'main.py');
      const rootRegistration = 'app.frontend("/", directory="root-frontend")';
      const nestedRegistration = [
        'nested = APIRouter()',
        'nested.frontend("/", directory="nested-frontend")',
        'app.include_router(nested, prefix="/admin")',
      ].join('\n');
      fs.writeFileSync(
        entrypointAbs,
        [
          'from fastapi import APIRouter, FastAPI',
          'app = FastAPI()',
          ...(nestedFirst
            ? [nestedRegistration, rootRegistration]
            : [rootRegistration, nestedRegistration]),
        ].join('\n')
      );

      await runFastAPICollectStatic(
        venvPath,
        appDir,
        pythonEnv,
        outputDir,
        entrypointAbs,
        'app'
      );

      expect(
        fs.readFileSync(path.join(outputDir, 'admin', 'shared.txt'), 'utf8')
      ).toBe('nested shared');
      expect(
        fs.existsSync(path.join(outputDir, 'admin', 'root-only.txt'))
      ).toBe(false);
    }
  });

  it('preserves registration order for equally specific frontends', async () => {
    const appDir = path.join(testDir, 'app-equal-precedence');
    const outputDir = path.join(testDir, 'output-equal-precedence');
    fs.mkdirSync(path.join(appDir, 'first'), { recursive: true });
    fs.mkdirSync(path.join(appDir, 'second'), { recursive: true });
    fs.writeFileSync(path.join(appDir, 'first', 'shared.txt'), 'first');
    fs.writeFileSync(path.join(appDir, 'second', 'shared.txt'), 'second');
    const entrypointAbs = path.join(appDir, 'main.py');
    fs.writeFileSync(
      entrypointAbs,
      [
        'from fastapi import FastAPI',
        'app = FastAPI()',
        'app.frontend("/same", directory="first")',
        'app.frontend("/same", directory="second")',
      ].join('\n')
    );

    await runFastAPICollectStatic(
      venvPath,
      appDir,
      pythonEnv,
      outputDir,
      entrypointAbs,
      'app'
    );

    expect(
      fs.readFileSync(path.join(outputDir, 'same', 'shared.txt'), 'utf8')
    ).toBe('first');
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
