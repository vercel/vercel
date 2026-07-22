import fs from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

export interface FastAPIStaticMount {
  urlPath: string;
  directory: string;
}

export interface FastAPIApplicationRoute {
  /** Path-to-regexp route pattern used for observability output aliases. */
  source: string;
  /** ECMAScript-compatible route matcher for Vercel's routing layer. */
  src: string;
  /** Framework methods for diagnostics; routing intentionally matches all. */
  methods: string[];
}

export interface FastAPIInspectionResult {
  staticMounts: FastAPIStaticMount[];
  routes: FastAPIApplicationRoute[];
}

export interface FastAPICollectStaticResult {
  /** URL paths of StaticFiles mounts collected to CDN. */
  collectedMounts: string[];
  /** Absolute path to the directory where CDN static files were written. */
  cdnOutputDir: string;
}

const _FASTAPI_INSPECTION_ERROR_MESSAGE =
  'Warning: FastAPI application inspection failed. Static CDN collection and route discovery will be skipped.';
const _STATIC_FILE_COLLECTION_ERROR_MESSAGE =
  'Warning: FastAPI static file collection failed. Static files will not be served from the CDN.';

/**
 * Discover application routes and StaticFiles mounts by importing the
 * entrypoint via a Python shim run with the build venv Python. The venv already
 * contains the user's fastapi/starlette dependencies installed during the
 * build step.
 */
export async function inspectFastAPIApp(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIInspectionResult | null> {
  const pythonPath = getVenvPythonBin(venvPath);
  const outputPath = join(
    workPath,
    '.vercel',
    'python',
    `vc_fastapi_inspection_${randomUUID()}.json`
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
    console.error(_FASTAPI_INSPECTION_ERROR_MESSAGE);
    debug(
      `FastAPI: could not inspect application: ${err?.stderr ?? err?.message ?? err}`
    );
    return null;
  }
  try {
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as FastAPIInspectionResult;
    if (!Array.isArray(parsed.staticMounts) || !Array.isArray(parsed.routes)) {
      throw new Error('invalid FastAPI inspection output');
    }
    parsed.routes = parsed.routes.filter(route => {
      if (
        typeof route?.source !== 'string' ||
        typeof route?.src !== 'string' ||
        !Array.isArray(route?.methods)
      ) {
        return false;
      }
      try {
        new RegExp(route.src);
        return true;
      } catch {
        debug(`FastAPI: skipping invalid route regex: ${route.src}`);
        return false;
      }
    });
    debug(`FastAPI: inspection result: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch {
    console.error(_FASTAPI_INSPECTION_ERROR_MESSAGE);
    debug(`FastAPI: could not read shim output file: ${outputPath}`);
    return null;
  } finally {
    await fs.promises.rm(outputPath, { force: true });
  }
}

export async function getFastAPIStaticMounts(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIStaticMount[]> {
  const inspection = await inspectFastAPIApp(
    venvPath,
    entrypointAbs,
    variableName,
    env,
    workPath
  );
  return inspection?.staticMounts ?? [];
}

const FASTAPI_ROUTES_ORIGIN = 'fastapi';

type RoutesManifestRoute = {
  source?: string;
  src?: string;
  methods?: string[];
  priority?: string;
  origin?: string;
  [key: string]: unknown;
};

type RoutesManifest = {
  routes?: RoutesManifestRoute[];
  [key: string]: unknown;
};

function getRoutesManifestPath(workPath: string): string {
  return join(workPath, '.vercel', 'routes.json');
}

async function readRoutesManifest(workPath: string): Promise<RoutesManifest> {
  try {
    const raw = await fs.promises.readFile(
      getRoutesManifestPath(workPath),
      'utf8'
    );
    const parsed = JSON.parse(raw) as RoutesManifest;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error: any) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeFastAPIRoutesManifest(
  workPath: string,
  routes: FastAPIApplicationRoute[]
): Promise<void> {
  const manifest = await readRoutesManifest(workPath);
  const existingRoutes = Array.isArray(manifest.routes)
    ? manifest.routes.filter(route => route.origin !== FASTAPI_ROUTES_ORIGIN)
    : [];
  manifest.routes = [
    ...existingRoutes,
    ...routes.map(route => ({
      ...route,
      priority: 'before-filesystem',
      origin: FASTAPI_ROUTES_ORIGIN,
    })),
  ];

  const manifestPath = getRoutesManifestPath(workPath);
  await fs.promises.mkdir(join(workPath, '.vercel'), { recursive: true });
  await fs.promises.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  debug(`FastAPI: wrote ${routes.length} route(s) to ${manifestPath}`);
}

export async function clearFastAPIRoutesManifest(
  workPath: string
): Promise<void> {
  const manifestPath = getRoutesManifestPath(workPath);
  let manifest: RoutesManifest;
  try {
    manifest = await readRoutesManifest(workPath);
  } catch {
    return;
  }
  if (!Array.isArray(manifest.routes)) return;

  const routes = manifest.routes.filter(
    route => route.origin !== FASTAPI_ROUTES_ORIGIN
  );
  if (routes.length === manifest.routes.length) return;

  if (routes.length === 0 && Object.keys(manifest).length === 1) {
    await fs.promises.rm(manifestPath, { force: true });
    return;
  }

  manifest.routes = routes;
  await fs.promises.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

/**
 * Copy each StaticFiles mount directory into the Vercel Build Output static
 * directory so the CDN serves the files. The original entrypoint is unchanged;
 * the Lambda retains its StaticFiles mounts but CDN routing preempts it.
 *
 * Returns null when no StaticFiles mounts are found.
 */
export async function runFastAPICollectStatic(
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string,
  discoveredMounts?: FastAPIStaticMount[]
): Promise<FastAPICollectStaticResult | null> {
  const mounts =
    discoveredMounts ??
    (await getFastAPIStaticMounts(
      venvPath,
      entrypointAbs,
      variableName,
      env,
      workPath
    ));

  if (mounts.length === 0) {
    debug('FastAPI: no StaticFiles mounts found, skipping');
    return null;
  }

  debug(
    `Found ${mounts.length} FastAPI static mount(s): ${mounts.map(m => m.urlPath).join(', ')}`
  );

  try {
    for (const mount of mounts) {
      const urlSubPath = mount.urlPath.replace(/^\/|\/$/g, '');
      const dest = join(outputStaticDir, urlSubPath);
      await fs.promises.mkdir(dest, { recursive: true });
      await fs.promises.cp(mount.directory, dest, { recursive: true });
      debug(`copied ${mount.directory} -> ${dest}`);
    }
  } catch (error) {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(
      `FastAPI: could not copy static files: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }

  return {
    collectedMounts: mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
  };
}
