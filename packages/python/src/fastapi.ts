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
  /** True for a low-priority app.frontend() build (vs a plain StaticFiles mount). */
  frontend: boolean;
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
/**
 * Copy each mount's directory into the CDN output tree at its URL prefix.
 * Returns false if any copy fails, so the caller can skip CDN offload.
 */
export async function copyFastAPIStaticMounts(
  mounts: FastAPIStaticMount[],
  outputStaticDir: string
): Promise<boolean> {
  // Runtime routing is first-match-wins, and app.frontend() builds are always
  // low-priority. So copy non-frontend mounts first (in declaration order), then
  // frontends, and never overwrite (force: false).
  const ordered = [
    ...mounts.filter(m => !m.frontend),
    ...mounts.filter(m => m.frontend),
  ];
  for (const mount of ordered) {
    const urlSubPath = mount.urlPath.replace(/^\/|\/$/g, '');
    const dest = join(outputStaticDir, urlSubPath);
    try {
      await fs.promises.mkdir(dest, { recursive: true });
      await fs.promises.cp(mount.directory, dest, {
        recursive: true,
        force: false,
      });
    } catch (err) {
      debug(
        `FastAPI: copy ${mount.directory} -> ${dest} failed (${err}), skipping CDN`
      );
      return false;
    }
    debug(`copied ${mount.directory} -> ${dest}`);
  }
  return true;
}

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

  if (!(await copyFastAPIStaticMounts(mounts, outputStaticDir))) {
    return null;
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
 * Escape regex metacharacters in a literal path segment before it goes into a
 * route `src`. Mirrors the shim's `_escape`: shadow bodies are escaped
 * Python-side, but mount prefixes are raw URL paths and must be escaped here.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Routes that send paths the app owns to the Lambda, emitted before
 * `handle: 'filesystem'` so the app wins over a colliding CDN file. This
 * preserves FastAPI's declaration-order precedence.
 *
 * Each shadow body is a ready-made pattern from the shim: a higher-priority
 * route's path, or a mounted sub-app's subtree, minus its leading slash and with
 * inner groups already non-capturing. The bodies are OR'd into one capturing
 * group whose match is copied back into `request.path` via `$1`. The group
 * allows an optional trailing slash so redirect_slashes still works. A request
 * to `/foo/` reaches the Lambda, which redirects it to `/foo`. Returns an empty
 * list when nothing is shadowed.
 */
export function fastapiShadowingRoutes(
  discovery: FastAPICollectStaticResult,
  lambdaPath: string
) {
  if (discovery.shadowRoutes.length === 0) return [];
  return [
    {
      src: `^/((?:${discovery.shadowRoutes.join('|')})/?)$`,
      dest: `/${lambdaPath}`,
      transforms: [
        { type: 'request.path' as const, op: 'set' as const, args: '/$1' },
      ],
    },
  ];
}

/**
 * Post-filesystem CDN routes that serve each frontend's fallback file for a
 * miss under its mount. `check: true` re-resolves the rewrite to the copied
 * file so it stays a CDN hit, and it sorts the route ahead of the catch-all
 * Lambda. Sibling mounts are excluded. Each route is GET/HEAD only, since the
 * frontend only falls back for those methods.
 *
 * A 404 ("404.html") fallback is served for every miss. A 200 ("index.html")
 * fallback is different: the runtime serves it only for navigation requests, so
 * the route has to match the runtime's `_is_frontend_navigation_request`.
 *
 * That check is not the same across versions. On fastapi 0.139.0 it is a
 * navigation request when the final path segment has no file extension and
 * `Accept` includes text/html or application/xhtml+xml with a non-zero quality.
 * A wildcard `Accept` also counts, unless html is explicitly rejected with q=0.
 * On fastapi 0.140.0 it is a navigation request when `Accept` includes text/html
 * or application/xhtml+xml with a non-zero quality. The extension and wildcard
 * rules were removed.
 *
 * We build the route ahead of time and don't know which version is installed,
 * so we gate on what every version agrees is navigation. The `Accept` header
 * must include text/html or xhtml with a non-zero quality. A `q=0` is rejected
 * by a negative lookahead. The final path segment must have no file extension,
 * so `/spa/app.js` is excluded. The router anchors the `has` value with `^…$`,
 * so it is wrapped in `.*`.
 *
 * This is the strict reading, so the CDN never serves index.html when the app
 * would return 404. Anything the gate rejects falls through to the Lambda,
 * which runs the real check for the installed version. The response is still
 * correct. It just isn't a CDN hit. We leave the wildcard `Accept` out for the
 * same reason: 0.140.0 does not treat it as navigation, so matching it would
 * make the CDN serve index.html where that version would not.
 */
export function fastapiFallbackRoutes(discovery: FastAPICollectStaticResult) {
  return discovery.fallbacks.map(fb => {
    const prefix = fb.urlPath.replace(/\/+$/, ''); // '' for a root ("/") mount
    const nested = discovery.collectedMounts
      .map(urlPath => urlPath.replace(/\/+$/, ''))
      .filter(urlPath => urlPath !== prefix && urlPath.startsWith(`${prefix}/`))
      .map(urlPath => urlPath.slice(prefix.length + 1));
    const guard = nested.length
      ? `(?!(?:${nested.map(escapeRegex).join('|')})(?:/|$))`
      : '';
    const isNavigation = fb.status === 200;
    // Exclude a final segment with a file extension like `app.js`. On 0.139.0
    // that counts as a missing asset, not navigation.
    const navigationGuard = isNavigation ? '(?!.*[^/.]\\.[^/]*$)' : '';
    const navigationOnly = isNavigation
      ? {
          has: [
            {
              type: 'header' as const,
              key: 'accept',
              value:
                '.*(?:text/html|application/xhtml\\+xml)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*',
            },
          ],
        }
      : {};
    return {
      src: `^${escapeRegex(prefix)}/${guard}${navigationGuard}.*$`,
      dest: `${prefix}/${fb.file}`,
      status: fb.status,
      check: true,
      methods: ['GET', 'HEAD'],
      ...navigationOnly,
    };
  });
}
