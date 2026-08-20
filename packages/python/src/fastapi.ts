import fs from 'fs';
import { join, relative, sep } from 'path';
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
  /**
   * Every mount's URL path (copied or not) so the fallback nested guard carves
   * out each nested subtree, sending its misses to the Lambda not the parent.
   */
  mountPrefixes: string[];
  /** Absolute path of the build-output static directory the files were written to. */
  cdnOutputDir: string;
  /** From discovery; see {@link FastAPIStaticDiscovery.shadowRoutes}. */
  shadowRoutes: string[];
  /** Frontend fallbacks to serve from the CDN, each paired with its mount prefix. */
  fallbacks: (FastAPIStaticFallback & { urlPath: string })[];
}

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
  workPath: string
): Promise<FastAPIStaticDiscovery> {
  const pythonPath = getVenvPythonBin(venvPath);
  const outputDir = join(workPath, '.vercel', 'python');
  const outputPath = join(outputDir, 'vc_fastapi_static_output.json');
  await fs.promises.mkdir(outputDir, { recursive: true });
  try {
    const { stderr } = await execa(
      pythonPath,
      [scriptPath, entrypointAbs, variableName, outputPath],
      { env, cwd: workPath }
    );
    if (stderr) {
      debug(`FastAPI shim stderr:\n${stderr}`);
    }
    const raw = await fs.promises.readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as FastAPIStaticDiscovery;
    debug(`FastAPI: discovered: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (err: any) {
    console.error(STATIC_COLLECTION_WARNING);
    debug(
      `FastAPI: static discovery failed: ${err?.stderr ?? err?.message ?? err}`
    );
    return { mounts: [], shadowRoutes: [] };
  } finally {
    await fs.promises.rm(outputPath, { force: true });
  }
}

/** `urlPath` with trailing slashes removed, so the root mount ("/") is ''. */
function trimTrailingSlashes(urlPath: string): string {
  return urlPath.replace(/\/+$/, '');
}

/** True when `urlPath` is `base` or under it; base is a normalized (no
 * trailing slash) mount prefix, so '' is the root mount and covers all. */
function mountCovers(base: string, urlPath: string): boolean {
  return base === '' || urlPath === base || urlPath.startsWith(base + '/');
}

/** The CDN URL path a copied file lands at, e.g. "/static/logo.png". */
function cdnUrlPath(outputStaticDir: string, destPath: string): string {
  const rel = relative(outputStaticDir, destPath);
  return rel === '' ? '/' : '/' + rel.split(sep).join('/');
}

/**
 * Copy each mount's directory into the CDN tree at its URL prefix.
 *
 * A path is filled only by the highest-priority source whose prefix covers it,
 * so a lower-priority source never leaks a file that would 404 at runtime.
 * Priority is plain mounts (declaration order), then frontends (longest prefix
 * first). The per-file filter enforces this.
 *
 * A failed mount is skipped (the Lambda still serves it), but it keeps its
 * namespace so lower-priority sources cannot fill it. Returns the mounts that
 * were copied, so a failed mount gets no fallback route (empty when all fail).
 */
export async function copyFastAPIStaticMounts(
  mounts: FastAPIStaticMount[],
  outputStaticDir: string
): Promise<FastAPIStaticMount[]> {
  const ordered = [
    ...mounts.filter(m => !m.frontend),
    ...mounts
      .filter(m => m.frontend)
      .sort((a, b) => b.urlPath.length - a.urlPath.length),
  ];

  // Normalized upfront: the filter runs per copied file (and prunes whole
  // covered directories), so it should not re-normalize per prefix.
  const higherPriority: string[] = [];
  const copied: FastAPIStaticMount[] = [];
  for (const mount of ordered) {
    const dest = join(outputStaticDir, mount.urlPath.replace(/^\/+|\/+$/g, ''));
    try {
      await fs.promises.mkdir(dest, { recursive: true });
      await fs.promises.cp(mount.directory, dest, {
        recursive: true,
        force: false,
        filter: (_src, destPath) => {
          const urlPath = cdnUrlPath(outputStaticDir, destPath);
          return !higherPriority.some(base => mountCovers(base, urlPath));
        },
      });
      copied.push(mount);
      debug(`copied ${mount.directory} -> ${dest}`);
    } catch (err) {
      debug(`FastAPI: skipping ${mount.urlPath}: copy failed (${err})`);
    }
    higherPriority.push(trimTrailingSlashes(mount.urlPath));
  }
  return copied;
}

// routing-utils caps a route `src` at 4096 chars (routesSchema in schemas.ts).
const MAX_ROUTE_SRC_LENGTH = 4096;

/** One shadowing route `src`: the bodies OR'd into a single capture group. */
function shadowSrc(bodies: string[]): string {
  return `^/((?:${bodies.join('|')})/?)$`;
}

// Length shadowSrc adds around the bodies, so a chunk's src len = this + join.
const SHADOW_SRC_WRAPPER_LENGTH = shadowSrc([]).length;

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

  const copiedMounts = await copyFastAPIStaticMounts(mounts, outputStaticDir);
  if (copiedMounts.length === 0) {
    return null;
  }

  return {
    // All mounts (not just copied) so the guard carves out every subtree.
    mountPrefixes: mounts.map(m => m.urlPath),
    cdnOutputDir: outputStaticDir,
    shadowRoutes,
    // Only copied mounts get a fallback: a check:true dest that is missing makes
    // the proxy exit with the status instead of reaching the Lambda.
    fallbacks: copiedMounts.flatMap(m =>
      m.fallback ? [{ urlPath: m.urlPath, ...m.fallback }] : []
    ),
  };
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
 * to `/foo/` reaches the Lambda, which redirects it to `/foo`.
 *
 * A root frontend shadows every route, so one OR'd `src` can exceed the 4096
 * char route cap. Bodies are split across as many routes as fit; all route to
 * the Lambda, so the split is order-independent. A body too long for a `src`
 * even alone (a custom convertor with a very long regex) is dropped: its path
 * stays unshadowed, so a colliding CDN file there would win over the app.
 * Returns an empty list when nothing is shadowed.
 */
export function fastapiShadowingRoutes(
  discovery: FastAPICollectStaticResult,
  lambdaPath: string
) {
  const chunks: string[][] = [];
  // Track each chunk's src length (wrapper + bodies + `|` separators) as it
  // grows rather than rebuilding the src to measure it.
  let srcLen = 0;
  let dropped = 0;
  for (const body of discovery.shadowRoutes) {
    if (SHADOW_SRC_WRAPPER_LENGTH + body.length > MAX_ROUTE_SRC_LENGTH) {
      dropped += 1;
      continue;
    }
    const current = chunks[chunks.length - 1];
    if (current && srcLen + 1 + body.length <= MAX_ROUTE_SRC_LENGTH) {
      current.push(body);
      srcLen += 1 + body.length;
    } else {
      chunks.push([body]);
      srcLen = SHADOW_SRC_WRAPPER_LENGTH + body.length;
    }
  }
  if (dropped > 0) {
    debug(
      `FastAPI: ${dropped} shadow route(s) over the ` +
        `${MAX_ROUTE_SRC_LENGTH} char cap left unshadowed`
    );
  }
  return chunks.map(bodies => ({
    src: shadowSrc(bodies),
    dest: `/${lambdaPath}`,
    transforms: [
      { type: 'request.path' as const, op: 'set' as const, args: '/$1' },
    ],
  }));
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
 * Accept-header gate for navigation requests: an explicit text/html or
 * application/xhtml+xml media type not rejected with q=0. The type is
 * boundary-guarded so a longer token like `text/htmlx` never matches, and a
 * wildcard `Accept` does not count. The router anchors `has` values with
 * `^…$`, hence the `.*` wrapping.
 */
const NAVIGATION_ACCEPT_RE =
  '.*(?:^|[,\\s])(?:text/html|application/xhtml\\+xml)(?=[,;\\s]|$)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*';

/**
 * Post-filesystem CDN routes that serve each frontend's fallback file for a
 * miss under its mount. `check: true` re-resolves the rewrite to the copied
 * file so it stays a CDN hit, and it sorts the route ahead of the catch-all
 * Lambda. Nested sibling mounts are excluded, and the routes are GET/HEAD only,
 * since the frontend only falls back for those methods.
 *
 * A 404 ("404.html") fallback is served for every miss. A 200 ("index.html")
 * fallback is served only for navigation requests, mirroring the runtime's
 * `_is_frontend_navigation_request` — whose definition varies by version:
 * fastapi 0.139.0 requires an extension-less final path segment AND an html
 * (or non-rejecting wildcard) `Accept`; 0.140.0 requires only an explicit html
 * `Accept`. Built without knowing the installed version, the route gates on
 * the intersection every version treats as navigation: an explicit html
 * `Accept` ({@link NAVIGATION_ACCEPT_RE}) plus an extension-less final segment
 * (so `/spa/app.js` falls through). The CDN then never serves index.html where
 * the app would 404; anything the gate rejects falls through to the Lambda,
 * which runs the real check for the installed version — still a correct
 * response, just not a CDN hit.
 */
export function fastapiFallbackRoutes(discovery: FastAPICollectStaticResult) {
  const mountPrefixes = discovery.mountPrefixes.map(trimTrailingSlashes);
  return discovery.fallbacks.flatMap(fb => {
    const prefix = trimTrailingSlashes(fb.urlPath); // '' for a root ("/") mount
    // Nested mounts own their own subtrees; exclude them from the fallback.
    const nested = mountPrefixes
      .filter(urlPath => urlPath.startsWith(`${prefix}/`))
      .map(urlPath => urlPath.slice(prefix.length + 1));
    const guard = nested.length
      ? `(?!(?:${nested.map(escapeRegex).join('|')})(?:/|$))`
      : '';
    const isNavigation = fb.status === 200;
    const navigationGuard = isNavigation ? '(?!.*[^/.]\\.[^/]*$)' : '';
    const src = `^${escapeRegex(prefix)}/${guard}${navigationGuard}.*$`;
    // The nested guard grows with every mount under the prefix and cannot be
    // chunked like a shadow route. Skip the fallback when its src exceeds the
    // cap. The Lambda still serves the fallback without a CDN hit.
    if (src.length > MAX_ROUTE_SRC_LENGTH) {
      debug(
        `FastAPI: fallback route for ${fb.urlPath} over the ` +
          `${MAX_ROUTE_SRC_LENGTH} char cap, served by the Lambda`
      );
      return [];
    }
    const navigationOnly = isNavigation
      ? {
          has: [
            {
              type: 'header' as const,
              key: 'accept',
              value: NAVIGATION_ACCEPT_RE,
            },
          ],
        }
      : {};
    return [
      {
        src,
        dest: `${prefix}/${fb.file}`,
        status: fb.status,
        check: true,
        methods: ['GET', 'HEAD'],
        ...navigationOnly,
      },
    ];
  });
}
