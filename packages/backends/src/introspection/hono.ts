import type { Hono } from 'hono';
import { pathToRegexp } from 'path-to-regexp';
import { setupCloseHandlers } from '../rolldown/util.js';
import { debug } from '@vercel/build-utils';

const apps: Hono[] = [];

/**
 * Well-known cross-realm symbol app authors stamp onto a `Hono` instance to
 * pin per-route Vercel Function configuration (region, memory, etc.). The
 * builder reads this symbol during introspection and emits a dedicated
 * `NodejsLambda` for each distinct config, sharing the bundled files with
 * the default Lambda — runtime configuration only, never code splitting.
 *
 * Stable across `@vercel/backends` versions and across the introspection
 * child process / user code boundary, since `Symbol.for(...)` is keyed by
 * string.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 *
 * const VERCEL_CONFIG = Symbol.for('@vercel/backends.config');
 *
 * const iad1 = new Hono();
 * (iad1 as any)[VERCEL_CONFIG] = { regions: ['iad1'] };
 * iad1.get('/iad1', (c) => c.text(process.env.VERCEL_REGION ?? ''));
 *
 * const app = new Hono();
 * app.route('/', iad1);
 *
 * export default app;
 * ```
 */
export const VERCEL_CONFIG = Symbol.for('@vercel/backends.config');

/**
 * Per-route stamp applied during `route()` flattening. We can't put this on
 * the public `VERCEL_CONFIG` slot because `route()` shares route entries with
 * sub-apps — a second mount of the same sub-app under a different parent
 * would clobber the original capture. A non-`Symbol.for` symbol is fine here:
 * only this module ever reads it.
 */
const CAPTURED_CONFIG = Symbol('@vercel/backends.captured');

export const handle = (honoModule: any) => {
  const TrackedHono = class extends honoModule.Hono {
    constructor(...args: any[]) {
      super(...args);

      apps.push(this as unknown as Hono);
    }

    /**
     * Intercept `app.route(path, subApp)` to snapshot the sub-app's Vercel
     * config onto each route entry it contributes. Hono's `route()` flattens
     * `subApp.routes` into `this.routes`; we walk the newly added entries
     * after delegating and stamp them with the resolved config.
     *
     * Innermost configuration wins: if a route is already stamped (e.g. by
     * an inner sub-app being mounted into the sub-app being mounted here),
     * we don't overwrite. This matches the intuition that the sub-app
     * declaring the route knows best.
     */
    route(path: string, subApp: any) {
      const subConfig =
        subApp != null && typeof subApp === 'object'
          ? (subApp as any)[VERCEL_CONFIG]
          : undefined;
      const beforeLength = (this as any).routes?.length ?? 0;
      const result = super.route(path, subApp);
      const routesArray = (this as any).routes;
      if (subConfig && Array.isArray(routesArray)) {
        for (let i = beforeLength; i < routesArray.length; i++) {
          const r = routesArray[i];
          if (r && r[CAPTURED_CONFIG] === undefined) {
            r[CAPTURED_CONFIG] = subConfig;
          }
        }
      }
      return result;
    }
  };
  return TrackedHono;
};

setupCloseHandlers(() => {
  const routes = extractRoutes();
  if (routes.length > 0) {
    return { routes };
  }
  return undefined;
});

function extractRoutes() {
  // get the app that has the most routes
  const app = apps.sort((a, b) => b.routes.length - a.routes.length)[0];
  if (!app || !app.routes) {
    return [];
  }
  // Fallback for routes registered directly on a tagged root app
  // (no `route()` call to capture from).
  const rootConfig = (app as any)[VERCEL_CONFIG];
  const routes: {
    src: string;
    dest: string;
    methods: string[];
    config?: unknown;
  }[] = [];

  for (const route of app.routes) {
    const routePath = route.path;
    const method = route.method.toUpperCase();
    try {
      const { regexp } = pathToRegexp(routePath);

      if (routePath === '/') {
        continue;
      }

      const capturedConfig = (route as any)[CAPTURED_CONFIG];
      const config = capturedConfig ?? rootConfig;
      routes.push({
        src: regexp.source,
        dest: routePath,
        methods: [method],
        ...(config !== undefined && { config }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      debug(`Error extracting routes for ${routePath}: ${message}`);
      //
    }
  }
  return routes;
}
