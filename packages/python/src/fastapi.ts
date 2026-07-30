import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_fastapi_static.py');

/** A resolved frontend fallback: which file to serve for a miss, and its status. */
export interface FastAPIStaticFallback {
  /** File to serve for unmatched paths under the mount (e.g. "index.html"). */
  file: string;
  /** Status to serve it with (200 for index.html, 404 for 404.html). */
  status: number;
}

/** One StaticFiles/frontend mount to copy to the CDN. */
export interface FastAPIStaticMount {
  /** URL prefix the files are served under (e.g. "/static", or "/" for a frontend). */
  urlPath: string;
  /** Absolute source directory to copy. */
  directory: string;
  /** Frontend fallback for this mount, or null for a plain StaticFiles mount. */
  fallback: FastAPIStaticFallback | null;
}

/** The shim's parsed JSON output (mirrors the Python `Output` dataclass). */
export interface FastAPIStaticDiscovery {
  /** StaticFiles/frontend directories to copy to the CDN. */
  mounts: FastAPIStaticMount[];
  /**
   * Routing pattern bodies (regex matched against the request path minus its
   * leading slash) for paths a higher-priority route owns; these must reach the
   * Lambda before the CDN, preserving FastAPI's route precedence.
   */
  shadowRoutes: string[];
}

/** Outcome of copying mounts to the CDN, for the builder to wire into routes. */
export interface FastAPICollectStaticResult {
  /** URL paths of the StaticFiles mounts copied to the CDN. */
  collectedMounts: string[];
  /** Absolute path of the build-output static directory the files were written to. */
  cdnOutputDir: string;
  /** Passed through from discovery; see {@link FastAPIStaticDiscovery.shadowRoutes}. */
  shadowRoutes: string[];
  /** Frontend fallbacks to serve from the CDN, each paired with its mount prefix. */
  fallbacks: (FastAPIStaticFallback & { urlPath: string })[];
}

const _STATIC_FILE_COLLECTION_ERROR_MESSAGE =
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
    return { mounts: [], shadowRoutes: [] };
  }
  try {
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as FastAPIStaticDiscovery;
    debug(`FastAPI: discovered: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch {
    console.error(_STATIC_FILE_COLLECTION_ERROR_MESSAGE);
    debug(`FastAPI: could not read shim output file: ${outputPath}`);
    return { mounts: [], shadowRoutes: [] };
  } finally {
    await fs.promises.rm(outputPath, { force: true });
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
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  entrypointAbs: string,
  variableName: string
): Promise<FastAPICollectStaticResult | null> {
  const { mounts, shadowRoutes } = await getFastAPIStaticDiscovery(
    venvPath,
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

  const fallbacks = mounts.flatMap(m =>
    m.fallback ? [{ urlPath: m.urlPath, ...m.fallback }] : []
  );

  return {
    collectedMounts: mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
    shadowRoutes,
    fallbacks,
  };
}

/**
 * Routes that send paths a higher-priority FastAPI route owns to the Lambda.
 * Emitted before `handle: 'filesystem'`, so the app wins over a colliding CDN
 * file — preserving FastAPI's declaration-order precedence. Each shadow body is
 * a ready-made pattern (path minus its leading slash, inner groups already
 * non-capturing), OR'd into one capturing group whose match is copied back into
 * `request.path` via `$1`. Empty when nothing is shadowed.
 */
export function fastapiShadowingRoutes(
  discovery: FastAPICollectStaticResult,
  lambdaPath: string
) {
  if (discovery.shadowRoutes.length === 0) return [];
  return [
    {
      src: `^/(${discovery.shadowRoutes.join('|')})$`,
      dest: `/${lambdaPath}`,
      transforms: [
        { type: 'request.path' as const, op: 'set' as const, args: '/$1' },
      ],
    },
  ];
}

/**
 * Post-filesystem CDN routes that serve each frontend's fallback file for a miss
 * under its mount. `check: true` re-resolves the rewrite to the copied file (so
 * it stays a CDN hit) and sorts the route ahead of the catch-all Lambda; sibling
 * mounts are excluded. GET/HEAD only — the frontend falls back only for those
 * methods. A 200 ("index.html") fallback is additionally gated on
 * `Accept: text/html` to match the frontend's navigation heuristic (the router
 * anchors the `has` value `^…$`, hence the wrapping `.*`); a 404 ("404.html")
 * fallback is served for every miss.
 */
export function fastapiFallbackRoutes(discovery: FastAPICollectStaticResult) {
  return discovery.fallbacks.map(fb => {
    const prefix = fb.urlPath.replace(/\/+$/, ''); // '' for a root ("/") mount
    const nested = discovery.collectedMounts
      .map(urlPath => urlPath.replace(/\/+$/, ''))
      .filter(urlPath => urlPath !== prefix && urlPath.startsWith(`${prefix}/`))
      .map(urlPath => urlPath.slice(prefix.length + 1));
    const guard = nested.length ? `(?!(?:${nested.join('|')})(?:/|$))` : '';
    const navigationOnly =
      fb.status === 200
        ? {
            has: [
              {
                type: 'header' as const,
                key: 'accept',
                value: '.*(?:text/html|application/xhtml\\+xml).*',
              },
            ],
          }
        : {};
    return {
      src: `^${prefix}/${guard}.*$`,
      dest: `${prefix}/${fb.file}`,
      status: fb.status,
      check: true,
      methods: ['GET', 'HEAD'],
      ...navigationOnly,
    };
  });
}
