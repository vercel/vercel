import fs from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';
import { entrypointToModule } from './entrypoint';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

export interface FastAPIStaticMount {
  urlPath: string;
  directory: string;
  /** Paths kept Lambda-only because a normal route owns one of their URLs. */
  excludedPaths: string[];
}

export interface FastAPICollectStaticResult {
  /** URL paths of frontend() registrations collected to CDN. */
  collectedMounts: string[];
  /** Absolute path to the directory where CDN static files were written. */
  cdnOutputDir: string;
}

const _STATIC_FILE_COLLECTION_ERROR_MESSAGE =
  'Warning: FastAPI static file collection failed. Static files will not be served from the CDN.';

/**
 * Discover frontend() registrations by importing the entrypoint via a Python
 * shim run with the build venv Python. The shim records FastAPI's public router
 * API calls and excludes files owned by normal, higher-priority routes.
 */
export async function getFastAPIStaticMounts(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIStaticMount[]> {
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
  const moduleName = entrypointToModule(relative(workPath, entrypointAbs));
  try {
    const { stderr } = await execa(
      pythonPath,
      [scriptPath, entrypointAbs, variableName, outputPath, moduleName],
      { env, cwd: workPath, timeout: 60_000 }
    );
    if (stderr) {
      debug(`FastAPI shim stderr:\n${stderr}`);
    }
  } catch (err: any) {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(
      `FastAPI: could not discover frontend registrations: ${err?.stderr ?? err?.message ?? err}`
    );
    await fs.promises.rm(outputPath, { force: true });
    return [];
  }
  try {
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError('FastAPI frontend inspection output is not an array');
    }
    const mounts = parsed.map((value: unknown) => {
      if (
        !value ||
        typeof value !== 'object' ||
        typeof (value as FastAPIStaticMount).urlPath !== 'string' ||
        typeof (value as FastAPIStaticMount).directory !== 'string' ||
        !Array.isArray((value as FastAPIStaticMount).excludedPaths) ||
        !(value as FastAPIStaticMount).excludedPaths.every(
          excludedPath => typeof excludedPath === 'string'
        )
      ) {
        throw new TypeError('Invalid FastAPI frontend inspection result');
      }
      return value as FastAPIStaticMount;
    });
    debug(`FastAPI: discovered frontends: ${JSON.stringify(mounts)}`);
    return mounts;
  } catch (err: unknown) {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(
      `FastAPI: could not read shim output file ${outputPath}: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  } finally {
    await fs.promises.rm(outputPath, { force: true });
  }
}

/**
 * Copy each frontend() directory into the Vercel Build Output static directory
 * so the CDN serves files that are not owned by higher-priority app routes. The
 * original frontend remains in the Lambda to handle excluded files and misses.
 *
 * Returns null when no frontend() registrations are found.
 */
export async function runFastAPICollectStatic(
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string
): Promise<FastAPICollectStaticResult | null> {
  const mounts = await getFastAPIStaticMounts(
    venvPath,
    entrypointAbs,
    variableName,
    env,
    workPath
  );

  if (mounts.length === 0) {
    debug('FastAPI: no frontend() registrations found, skipping');
    return null;
  }

  debug(
    `Found ${mounts.length} FastAPI frontend(s): ${mounts.map(m => m.urlPath).join(', ')}`
  );

  const outputRoot = resolve(outputStaticDir);
  for (const mount of mounts) {
    const urlSubPath = mount.urlPath.replace(/^\/|\/$/g, '');
    const dest = resolve(outputRoot, urlSubPath);
    const destRelativePath = relative(outputRoot, dest);
    if (
      isAbsolute(destRelativePath) ||
      destRelativePath === '..' ||
      destRelativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(
        `FastAPI frontend URL path escapes static output: ${mount.urlPath}`
      );
    }

    const sourceRoot = resolve(mount.directory);
    const excludedPaths = new Set(mount.excludedPaths);
    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.cp(sourceRoot, dest, {
      recursive: true,
      filter: source => {
        const sourceRelativePath = relative(sourceRoot, source);
        if (!sourceRelativePath) return true;
        const normalizedPath = sourceRelativePath.split(sep).join('/');
        return !excludedPaths.has(normalizedPath);
      },
    });
    debug(
      `copied ${mount.directory} -> ${dest}, excluding ${excludedPaths.size} Lambda-owned path(s)`
    );
  }

  return {
    collectedMounts: mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
  };
}
