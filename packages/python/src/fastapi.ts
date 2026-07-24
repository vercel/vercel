import fs from 'fs';
import { dirname, join } from 'path';
import execa from 'execa';
import { debug, NowBuildError, readConfigFile } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');
const FASTAPI_FRONTEND_PROXY_ENTRYPOINT =
  /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$/;

export interface FastAPIFrontendConfig {
  /**
   * Whether app.frontend() output should be copied to Vercel's CDN.
   * Defaults to true.
   */
  cdn: boolean;
  /**
   * Omitted means the generated frontend proxy should use the detected
   * FastAPI application. False explicitly skips frontend proxy execution.
   */
  proxy?: false | string;
}

export interface FastAPIStaticMount {
  urlPath: string;
  directory: string;
}

export interface FastAPIStaticFile {
  /** Public URL where FastAPI serves this concrete file. */
  urlPath: string;
  /** Absolute source path copied into Build Output API static files. */
  sourcePath: string;
  /** Request paths that resolve to this file, including index aliases. */
  requestPaths: string[];
}

export interface FastAPIStaticDiscovery {
  mounts: FastAPIStaticMount[];
  files: FastAPIStaticFile[];
}

export interface FastAPICollectStaticResult {
  /** URL paths of app.frontend() mounts considered for CDN delivery. */
  collectedMounts: string[];
  /** Concrete request paths that can be served from the CDN safely. */
  collectedRequestPaths: string[];
  /** Source directories registered through app.frontend(). */
  sourceDirectories: string[];
  /** Absolute path to the directory where CDN static files were written. */
  cdnOutputDir: string;
}

const _STATIC_FILE_COLLECTION_ERROR_MESSAGE =
  'Warning: FastAPI static file collection failed. Static files will not be served from the CDN.';

function fastAPIFrontendConfigError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_INVALID_FASTAPI_FRONTEND_CONFIG',
    message,
  });
}

/**
 * Read the FastAPI frontend delivery configuration from pyproject.toml.
 *
 * An absent section uses the optimized defaults: CDN delivery with an
 * automatically generated proxy.
 */
export async function getFastAPIFrontendConfig(
  workPath: string
): Promise<FastAPIFrontendConfig> {
  const pyprojectData = await readConfigFile<{
    tool?: {
      vercel?: {
        fastapi?: {
          frontend?: unknown;
        };
      };
    };
  }>(join(workPath, 'pyproject.toml'));
  const rawFrontend = pyprojectData?.tool?.vercel?.fastapi?.frontend;
  if (rawFrontend === undefined) {
    return { cdn: true };
  }
  if (
    rawFrontend === null ||
    typeof rawFrontend !== 'object' ||
    Array.isArray(rawFrontend)
  ) {
    throw fastAPIFrontendConfigError(
      '"tool.vercel.fastapi.frontend" must be a TOML table.'
    );
  }

  const frontend = rawFrontend as {
    cdn?: unknown;
    proxy?: unknown;
  };
  if (frontend.cdn !== undefined && typeof frontend.cdn !== 'boolean') {
    throw fastAPIFrontendConfigError(
      '"tool.vercel.fastapi.frontend.cdn" must be true or false.'
    );
  }

  if (
    frontend.proxy !== undefined &&
    frontend.proxy !== false &&
    typeof frontend.proxy !== 'string'
  ) {
    throw fastAPIFrontendConfigError(
      '"tool.vercel.fastapi.frontend.proxy" must be false or a Python "module:object" entrypoint.'
    );
  }
  if (
    typeof frontend.proxy === 'string' &&
    !FASTAPI_FRONTEND_PROXY_ENTRYPOINT.test(frontend.proxy)
  ) {
    throw fastAPIFrontendConfigError(
      '"tool.vercel.fastapi.frontend.proxy" must use Python "module:object" syntax, for example "frontend_proxy:proxy".'
    );
  }
  if (typeof frontend.proxy === 'string') {
    const [moduleName] = frontend.proxy.split(':');
    const modulePath = moduleName.replace(/\./g, '/');
    if (
      !fs.existsSync(join(workPath, `${modulePath}.py`)) &&
      !fs.existsSync(join(workPath, modulePath, '__init__.py'))
    ) {
      throw fastAPIFrontendConfigError(
        `"tool.vercel.fastapi.frontend.proxy" does not resolve to a local Python module: ${JSON.stringify(frontend.proxy)}.`
      );
    }
  }

  const cdn = frontend.cdn ?? true;
  if (!cdn && frontend.proxy !== undefined) {
    throw fastAPIFrontendConfigError(
      '"tool.vercel.fastapi.frontend.proxy" cannot be configured when "tool.vercel.fastapi.frontend.cdn" is false.'
    );
  }

  return {
    cdn,
    ...(frontend.proxy !== undefined ? { proxy: frontend.proxy } : {}),
  };
}

/**
 * Discover StaticFiles mounts by importing the entrypoint via a Python shim
 * run with the build venv Python. The venv already contains the user's
 * fastapi/starlette dependencies installed during the build step.
 */
export async function getFastAPIStaticMounts(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIStaticMount[]> {
  return (
    await getFastAPIStaticDiscovery(
      venvPath,
      entrypointAbs,
      variableName,
      env,
      workPath
    )
  ).mounts;
}

/**
 * Discover app.frontend() mounts and the concrete files that FastAPI's own
 * router considers safe to promote to the CDN.
 */
export async function getFastAPIStaticDiscovery(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIStaticDiscovery> {
  const pythonPath = getVenvPythonBin(venvPath);
  const outputPath = join(
    workPath,
    '.vercel',
    'python',
    'vc_fastapi_static_output.json'
  );
  await fs.promises.mkdir(join(workPath, '.vercel', 'python'), {
    recursive: true,
  });
  try {
    const { stderr } = await execa(
      pythonPath,
      [scriptPath, entrypointAbs, variableName, outputPath],
      { env, cwd: workPath }
    );
    if (stderr) {
      debug(`FastAPI shim stderr:\n${stderr}`);
    }
  } catch (err: any) {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(
      `FastAPI: could not discover static mounts: ${err?.stderr ?? err?.message ?? err}`
    );
    return { mounts: [], files: [] };
  }
  try {
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as FastAPIStaticDiscovery;
    debug(`FastAPI: discovered frontend files: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(`FastAPI: could not read shim output file: ${outputPath}`);
    return { mounts: [], files: [] };
  } finally {
    await fs.promises.rm(outputPath, { force: true });
  }
}

/**
 * Copy concrete app.frontend() files into the Vercel Build Output static
 * directory. FastAPI's router has already excluded files shadowed by normal
 * routes and files owned by a more-specific frontend.
 *
 * Returns null when no app.frontend() mounts are found.
 */
export async function runFastAPICollectStatic(
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string
): Promise<FastAPICollectStaticResult | null> {
  const discovery = await getFastAPIStaticDiscovery(
    venvPath,
    entrypointAbs,
    variableName,
    env,
    workPath
  );

  if (discovery.mounts.length === 0) {
    debug('FastAPI: no app.frontend() mounts found, skipping');
    return null;
  }

  debug(
    `Found ${discovery.mounts.length} FastAPI frontend mount(s): ${discovery.mounts.map(m => m.urlPath).join(', ')}`
  );

  for (const file of discovery.files) {
    const dest = join(outputStaticDir, file.urlPath.replace(/^\//, ''));
    await fs.promises.mkdir(dirname(dest), { recursive: true });
    await fs.promises.copyFile(file.sourcePath, dest);
    debug(`copied ${file.sourcePath} -> ${dest}`);
  }

  return {
    collectedMounts: discovery.mounts.map(m => m.urlPath),
    collectedRequestPaths: discovery.files.flatMap(file => file.requestPaths),
    sourceDirectories: discovery.mounts.map(m => m.directory),
    cdnOutputDir: outputStaticDir,
  };
}
