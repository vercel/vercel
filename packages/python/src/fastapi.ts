import { ge, valid } from '@renovatebot/pep440';
import fs from 'fs';
import { join, relative } from 'path';
import execa from 'execa';
import {
  debug,
  EMPTY_DISCOVERY,
  promoteStaticFiles,
  staticDirectoryRedirects,
  staticBundleExclusions,
  type Files,
  type StaticDiscovery,
  type StaticMount,
  type StaticPromotionOptions,
  type StaticPromotionResult,
} from '@vercel/build-utils';
import type { PyProjectToolVercelFastapiSection } from '@vercel/python-analysis';
import { getVenvPythonBin } from './utils';
import { entrypointToModule } from './entrypoint';
import type { InstalledPythonDistributions } from './installed-distributions';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

/** Debug-log prefix for the shared static-file promotion steps. */
export const STATIC_FILES_DEBUG_LABEL = 'FastAPI';

const STATIC_COLLECTION_WARNING =
  'Warning: FastAPI static file collection failed. Static files will not be served from the CDN.';

/**
 * Discover StaticFiles mounts (with any frontend fallback) and the shadow routes
 * that must reach the Lambda before the CDN, by importing the entrypoint through
 * the Python shim run with the build venv (which already has the user's
 * fastapi/starlette installed).
 */
export async function getFastAPIStaticDiscovery(
  venvPath: string,
  entrypointAbs: string,
  variableName: string,
  env: NodeJS.ProcessEnv,
  workPath: string,
  suppressMiddlewareMounts: boolean
): Promise<StaticDiscovery> {
  const pythonPath = getVenvPythonBin(venvPath);
  const outputDir = join(workPath, '.vercel', 'python');
  const outputPath = join(outputDir, 'vc_fastapi_static_output.json');
  const moduleName = entrypointToModule(relative(workPath, entrypointAbs));
  await fs.promises.mkdir(outputDir, { recursive: true });
  try {
    const { stderr } = await execa(
      pythonPath,
      [
        scriptPath,
        variableName,
        outputPath,
        workPath,
        moduleName,
        suppressMiddlewareMounts ? '1' : '0',
      ],
      { env, cwd: workPath }
    );
    if (stderr) {
      debug(`FastAPI shim stderr:\n${stderr}`);
    }
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as StaticDiscovery;
    debug(`FastAPI: discovered: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (err: any) {
    console.error(STATIC_COLLECTION_WARNING);
    debug(
      `FastAPI: static discovery failed: ${err?.stderr ?? err?.message ?? err}`
    );
    return EMPTY_DISCOVERY;
  } finally {
    await fs.promises.rm(outputPath, { force: true });
  }
}

/**
 * Copy each StaticFiles mount directory into the Vercel Build Output static
 * directory so the CDN serves the files. The original entrypoint is unchanged;
 * the Lambda retains its StaticFiles mounts but CDN routing preempts it.
 *
 * Returns null when no StaticFiles mounts are found, or none could be copied.
 */
export async function runFastAPICollectStatic(
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string,
  suppressMiddlewareMounts: boolean = true
): Promise<StaticPromotionResult | null> {
  const discovery = await getFastAPIStaticDiscovery(
    venvPath,
    entrypointAbs,
    variableName,
    env,
    workPath,
    suppressMiddlewareMounts
  );
  return promoteStaticFiles(discovery, outputStaticDir, {
    debugLabel: STATIC_FILES_DEBUG_LABEL,
  });
}

export interface FastAPICdnBundle {
  /** Glob patterns to exclude CDN-collected mount directories from the Lambda bundle. */
  excludePatterns: string[];
  /** Stub files that keep excluded mount directories present on the Lambda filesystem. */
  directoryStubs: Files;
  /** Redirects that fire after shadow routes, before `handle: filesystem`. */
  redirects: ReturnType<typeof staticDirectoryRedirects>;
}

/**
 * Compute CDN bundle adjustments for a FastAPI build.
 *
 * Always emits bare-directory 307 redirects for html=True mounts so the CDN
 * never serves index.html at the wrong URL.
 *
 * When `tool.vercel.fastapi.static.exclude = true` is set, also emits
 * `excludePatterns` to strip mount directories from the Lambda bundle and
 * `directoryStubs` to keep FastAPI's startup directory checks passing (a
 * placeholder, plus any index.html / 404.html for explicit fallback checks).
 */
export function getFastAPICdnBundle(
  collectedMounts: StaticMount[],
  workPath: string,
  fastapiConfig: PyProjectToolVercelFastapiSection | undefined
): FastAPICdnBundle {
  const redirects = staticDirectoryRedirects(collectedMounts, {
    debugLabel: STATIC_FILES_DEBUG_LABEL,
  });
  const { excludePatterns, directoryStubs } =
    fastapiConfig?.static?.exclude === true
      ? staticBundleExclusions(collectedMounts, workPath, [
          'index.html',
          '404.html',
        ])
      : { excludePatterns: [], directoryStubs: {} };
  return { excludePatterns, directoryStubs, redirects };
}

/**
 * Options for routing static files in a FastAPI build.
 *
 * Version-specific changes:
 * - **0.140+**: the extension check was removed; any explicit html `Accept`
 *   is navigation, including extensioned paths like `/app/main.js`.
 */
export function fastapiStaticOptions(
  installedDistributions: InstalledPythonDistributions
): StaticPromotionOptions {
  const fastapiVersion = installedDistributions.getInstalledVersion('fastapi');
  const versionAtLeast140 =
    !!fastapiVersion &&
    !!valid(fastapiVersion) &&
    ge(fastapiVersion, '0.140.0');
  return {
    debugLabel: STATIC_FILES_DEBUG_LABEL,
    useFallbackForExtensionedPaths: versionAtLeast140,
  };
}
