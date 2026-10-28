import fs from 'fs';
import { join } from 'path';
import type { RouteWithSrc } from '@vercel/routing-utils';
import debug from '../debug';
import type { ShadowRoute, StaticMount, StaticPromotionOptions } from './types';
import {
  byCopyPriority,
  escapeRegex,
  logLabel,
  mountCovers,
  trimSlashes,
  trimTrailingSlashes,
} from './utils';

// routing-utils caps a route `src` at 4096 chars (routesSchema in schemas.ts).
export const MAX_ROUTE_SRC_LENGTH = 4096;

/** One shadowing route `src`: the bodies OR'd into a single capture group. */
function shadowSrc(bodies: string[]): string {
  return `^/((?:${bodies.join('|')})/?)$`;
}

function redirectSrc(bodies: string[]): string {
  return `^/((?:${bodies.join('|')}))$`;
}

// Length each src function adds around the bodies (wrapper + joins).
const SHADOW_SRC_WRAPPER_LENGTH = shadowSrc([]).length;
const REDIRECT_SRC_WRAPPER_LENGTH = redirectSrc([]).length;

// Chunk bodies so each resulting src stays within MAX_ROUTE_SRC_LENGTH.
function chunkBodies(
  bodies: string[],
  wrapperLength: number
): { chunks: string[][]; dropped: number } {
  const chunks: string[][] = [];
  let srcLen = 0;
  let dropped = 0;
  for (const body of bodies) {
    if (wrapperLength + body.length > MAX_ROUTE_SRC_LENGTH) {
      dropped += 1;
      continue;
    }
    const current = chunks[chunks.length - 1];
    if (current && srcLen + 1 + body.length <= MAX_ROUTE_SRC_LENGTH) {
      current.push(body);
      srcLen += 1 + body.length;
    } else {
      chunks.push([body]);
      srcLen = wrapperLength + body.length;
    }
  }
  return { chunks, dropped };
}

/**
 * Routes that send paths the app owns to the Lambda, emitted before
 * `handle: 'filesystem'` so the app wins over a colliding CDN file.
 *
 * Each shadow body is a ready-made pattern from discovery, minus its leading
 * slash and with no capturing groups. The bodies are OR'd into one capturing
 * group whose match is copied back into `request.path` via `$1`. The group
 * allows an optional trailing slash so a framework's slash redirect still
 * reaches the app.
 *
 * Bodies are grouped by method set so a shadow only intercepts the methods
 * the app handles, then split across as many routes as fit the 4096-char
 * `src` cap; all route to the Lambda, so the split is order-independent. A
 * body too long for a `src` even alone is dropped (and logged): its path stays
 * unshadowed. Returns an empty list when nothing is shadowed.
 */
export function staticShadowRoutes(
  shadowRoutes: ShadowRoute[],
  lambdaPath: string,
  opts?: StaticPromotionOptions
): RouteWithSrc[] {
  const byMethods = new Map<string, string[]>();
  for (const sr of shadowRoutes) {
    // null means match all methods (e.g. sub-app subtree shadows)
    const key =
      sr.methods === null ? '' : JSON.stringify([...sr.methods].sort());
    const group = byMethods.get(key);
    if (group) {
      group.push(sr.body);
    } else {
      byMethods.set(key, [sr.body]);
    }
  }

  const routes: RouteWithSrc[] = [];
  let dropped = 0;

  for (const [methodsKey, bodies] of byMethods) {
    const methods: string[] | undefined =
      methodsKey === '' ? undefined : (JSON.parse(methodsKey) as string[]);
    const { chunks, dropped: d } = chunkBodies(
      bodies,
      SHADOW_SRC_WRAPPER_LENGTH
    );
    dropped += d;
    for (const chunk of chunks) {
      routes.push({
        src: shadowSrc(chunk),
        dest: `/${lambdaPath}`,
        ...(methods ? { methods } : {}),
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      });
    }
  }

  if (dropped > 0) {
    debug(
      `${logLabel(opts)}: ${dropped} shadow route(s) over the ` +
        `${MAX_ROUTE_SRC_LENGTH} char cap left unshadowed`
    );
  }
  return routes;
}

/**
 * Bare-directory → slash redirects, emitted after shadow routes and before
 * `handle: 'filesystem'`.
 *
 * The CDN serves index.html as an implicit directory index for bare directory
 * paths. For `html`/`frontend` mounts, redirect the bare form to the slash
 * form so the CDN serves the file at the correct URL base. Directories covered
 * by a higher-priority mount get their CDN content from that mount, so they
 * emit no redirect (mounts are walked in copy-priority order). Only
 * directories that contain an index.html get a redirect.
 */
export function staticDirectoryRedirects(
  mounts: StaticMount[],
  opts?: StaticPromotionOptions
): RouteWithSrc[] {
  const redirects: RouteWithSrc[] = [];
  let redirectDropped = 0;
  const higherPriority: string[] = [];
  for (const mount of byCopyPriority(mounts)) {
    if (!mount.html && !mount.frontend) {
      higherPriority.push(trimTrailingSlashes(mount.urlPath));
      continue;
    }

    const urlPrefix = trimSlashes(mount.urlPath);
    const bodies: string[] = [];
    const collectBodies = (absDir: string, urlPath: string) => {
      // Coverage is downward-transitive (a covered directory's children are
      // covered too), so the whole covered subtree is pruned.
      if (higherPriority.some(base => mountCovers(base, `/${urlPath}`))) {
        return;
      }
      // Only collect when index.html is present; without it the CDN misses
      // naturally and no redirect is needed.
      if (urlPath && fs.existsSync(join(absDir, 'index.html'))) {
        bodies.push(escapeRegex(urlPath));
      }
      for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        collectBodies(
          join(absDir, entry.name),
          urlPath ? `${urlPath}/${entry.name}` : entry.name
        );
      }
    };
    // A failed walk (missing/unreadable directory) only loses this mount's
    // redirects; the Lambda still serves the correct responses without them.
    try {
      collectBodies(mount.directory, urlPrefix);
    } catch (err) {
      debug(
        `${logLabel(opts)}: skipping bare-dir redirects for ${mount.urlPath} (${err})`
      );
    }
    higherPriority.push(trimTrailingSlashes(mount.urlPath));

    const { chunks, dropped } = chunkBodies(
      bodies,
      REDIRECT_SRC_WRAPPER_LENGTH
    );
    redirectDropped += dropped;
    for (const chunk of chunks) {
      redirects.push({
        src: redirectSrc(chunk),
        dest: '/$1/',
        status: 307,
        methods: ['GET', 'HEAD'],
      });
    }
  }
  if (redirectDropped > 0) {
    debug(
      `${logLabel(opts)}: ${redirectDropped} redirect(s) over the ` +
        `${MAX_ROUTE_SRC_LENGTH} char cap left unredirected`
    );
  }
  return redirects;
}

/**
 * Accept-header gate for navigation requests: an explicit text/html or
 * application/xhtml+xml media type not rejected with q=0. The type is
 * boundary-guarded so a longer token like `text/htmlx` never matches, and a
 * wildcard `Accept` does not count. The router anchors `has` values with
 * `^…$`, hence the `.*` wrapping.
 */
export const NAVIGATION_ACCEPT_RE =
  '.*(?:^|[,\\s])(?:text/html|application/xhtml\\+xml)(?=[,;\\s]|$)(?![^,]*;\\s*q=0(?:\\.0+)?(?:[,;\\s]|$)).*';

/**
 * `handle: 'miss'` routes that serve each copied mount's fallback file for a
 * miss under its mount. `check: true` re-resolves the rewrite to the copied
 * file so it stays a CDN hit. Routes are GET/HEAD only.
 *
 * `copied` supplies the fallbacks: only copied mounts get one, since a
 * `check: true` destination that doesn't exist ends the request instead of
 * reaching the Lambda. `discovered` (every discovered mount) supplies the
 * nested-mount exclusions, since nested mounts own their own subtrees whether
 * or not they were copied.
 *
 * A non-200 fallback (e.g. 404.html) is served for every miss. A 200 fallback
 * (e.g. index.html) is served only for navigation requests: an explicit html
 * `Accept` ({@link NAVIGATION_ACCEPT_RE}) plus, unless
 * `useFallbackForExtensionedPaths` is true, an extension-less final path
 * segment (so `/app/main.js` falls through). Anything the gate rejects falls
 * through to the Lambda. A fallback whose nested-mount guard pushes its `src`
 * over the cap is skipped.
 */
export function staticFallbackRoutes(
  copied: Pick<StaticMount, 'urlPath' | 'fallback'>[],
  discovered: Pick<StaticMount, 'urlPath'>[],
  opts?: StaticPromotionOptions
): RouteWithSrc[] {
  const mountPrefixes = discovered.map(m => trimTrailingSlashes(m.urlPath));
  return copied.flatMap(mount => {
    const fb = mount.fallback;
    if (!fb) return [];
    const isNavigation = fb.status === 200;
    const prefix = trimTrailingSlashes(mount.urlPath); // '' for a root mount

    // Nested mounts own their own subtrees; exclude them from the fallback.
    const nested = mountPrefixes
      .filter(urlPath => urlPath.startsWith(`${prefix}/`))
      .map(urlPath => urlPath.slice(prefix.length + 1));
    const siblingGuard = nested.length
      ? `(?!(?:${nested.map(escapeRegex).join('|')})(?:/|$))`
      : '';

    const useExtensionGuard =
      isNavigation && !opts?.useFallbackForExtensionedPaths;
    const extensionGuard = useExtensionGuard ? '(?!.*[^/.]\\.[^/]*$)' : '';

    const src = `^${escapeRegex(prefix)}/${siblingGuard}${extensionGuard}.*$`;
    // The nested guard grows with every mount under the prefix and cannot be
    // chunked like a shadow route. Skip the fallback when its src exceeds the
    // cap. The Lambda still serves the fallback without a CDN hit.
    if (src.length > MAX_ROUTE_SRC_LENGTH) {
      debug(
        `${logLabel(opts)}: fallback route for ${mount.urlPath} over the ` +
          `${MAX_ROUTE_SRC_LENGTH} char cap, served by the Lambda`
      );
      return [];
    }
    const route: RouteWithSrc = {
      src,
      dest: `${prefix}/${fb.file}`,
      status: fb.status,
      check: true,
      methods: ['GET', 'HEAD'],
      ...(isNavigation
        ? {
            has: [
              { type: 'header', key: 'accept', value: NAVIGATION_ACCEPT_RE },
            ],
          }
        : {}),
    };
    return [route];
  });
}
