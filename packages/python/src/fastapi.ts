import fs from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

export interface FastAPIStaticMount {
  urlPath: string;
  directory: string;
}

export interface FastAPIStaticFile {
  urlPath: string;
  sourcePath: string;
}

export interface FastAPIStaticDiscovery {
  mounts: FastAPIStaticMount[];
  files: FastAPIStaticFile[];
}

export interface FastAPICollectStaticResult {
  /** URL paths of StaticFiles mounts collected to CDN. */
  collectedMounts: string[];
  /** Absolute path to the directory where CDN static files were written. */
  cdnOutputDir: string;
}

const _STATIC_FILE_COLLECTION_ERROR_MESSAGE =
  'Warning: FastAPI static file collection failed. Static files will not be served from the CDN.';

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
 * Discover static mounts and the concrete files that FastAPI's own router
 * selects for CDN delivery.
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
    debug(`FastAPI: discovered static files: ${JSON.stringify(parsed)}`);
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
 * Copy concrete files selected by FastAPI's router into the Vercel Build
 * Output static directory. The original entrypoint is unchanged; the Lambda
 * retains its StaticFiles mounts for paths owned by another route.
 *
 * Returns null when no StaticFiles mounts are found.
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

  if (discovery.mounts.length === 0 || discovery.files.length === 0) {
    debug('FastAPI: no StaticFiles mounts found, skipping');
    return null;
  }

  debug(
    `Found ${discovery.mounts.length} FastAPI static mount(s): ${discovery.mounts.map(m => m.urlPath).join(', ')}`
  );

  const outputRoot = resolve(outputStaticDir);
  for (const file of discovery.files) {
    const dest = resolve(outputRoot, file.urlPath.replace(/^\//, ''));
    const relativeDest = relative(outputRoot, dest);
    if (
      isAbsolute(relativeDest) ||
      relativeDest === '..' ||
      relativeDest.startsWith(`..${sep}`)
    ) {
      throw new Error(
        `FastAPI static file URL escapes static output: ${file.urlPath}`
      );
    }
    await fs.promises.mkdir(dirname(dest), { recursive: true });
    await fs.promises.copyFile(file.sourcePath, dest);
    debug(`copied ${file.sourcePath} -> ${dest}`);
  }

  return {
    collectedMounts: discovery.mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
  };
}
