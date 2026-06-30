import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

export interface FastAPIStaticMount {
  urlPath: string;
  directory: string;
}

export interface FastAPICollectStaticResult {
  /** URL paths of StaticFiles mounts collected to CDN. */
  collectedMounts: string[];
  /** Absolute path to the directory where CDN static files were written. */
  cdnOutputDir: string;
}

/**
 * Discover StaticFiles mounts by importing the entrypoint via a Python shim.
 * Uses `uv run --with fastapi` so native wheels are resolved for
 * the build host platform — no venv dependency.
 */
export async function getFastAPIStaticMounts(
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string
): Promise<FastAPIStaticMount[]> {
  let stdout: string;
  try {
    let stderr: string;
    ({ stdout, stderr } = await execa(
      'uv',
      ['run', '--with', 'fastapi', scriptPath, entrypointAbs, variableName],
      { env, cwd: workPath }
    ));
    if (stderr) {
      debug(`FastAPI shim stderr:\n${stderr}`);
    }
  } catch (err: any) {
    debug(
      `FastAPI: could not discover static mounts: ${err?.stderr ?? err?.message ?? err}`
    );
    return [];
  }
  try {
    const parsed = JSON.parse(stdout) as FastAPIStaticMount[];
    debug(`FastAPI: discovered mounts: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch {
    debug(`FastAPI: could not parse shim output: ${stdout}`);
    return [];
  }
}

/**
 * Copy each StaticFiles mount directory into the Vercel Build Output static
 * directory so the CDN serves the files. The original entrypoint is unchanged;
 * the Lambda retains its StaticFiles mounts but CDN routing preempts it.
 *
 * Returns null when no StaticFiles mounts are found.
 */
export async function runFastAPICollectStatic(
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string
): Promise<FastAPICollectStaticResult | null> {
  const mounts = await getFastAPIStaticMounts(
    entrypointAbs,
    variableName,
    env,
    workPath
  );

  if (mounts.length === 0) {
    debug('FastAPI: no StaticFiles mounts found, skipping');
    return null;
  }

  debug(
    `Found ${mounts.length} FastAPI static mount(s): ${mounts.map(m => m.urlPath).join(', ')}`
  );

  for (const mount of mounts) {
    const urlSubPath = mount.urlPath.replace(/^\/|\/$/g, '');
    const dest = join(outputStaticDir, urlSubPath);
    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.cp(mount.directory, dest, { recursive: true });
    debug(`copied ${mount.directory} -> ${dest}`);
  }

  return {
    collectedMounts: mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
  };
}
