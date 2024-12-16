/**
 * These types are copied from `@remix-run/dev/dist/config/routes.d.ts`
 */

export interface RouteManifestEntry {
  /**
   * The path this route uses to match on the URL pathname.
   */
  path?: string;
  /**
   * Should be `true` if it is an index route. This disallows child routes.
   */
  index?: boolean;
  /**
   * Should be `true` if the `path` is case-sensitive. Defaults to `false`.
   */
  caseSensitive?: boolean;
  /**
   * The unique id for this route, named like its `file` but without the
   * extension. So `app/routes/gists/$username.tsx` will have an `id` of
   * `routes/gists/$username`.
   */
  id: string;
  /**
   * The unique `id` for this route's parent route, if there is one.
   */
  parentId?: string;
  /**
   * The path to the entry point for this route, relative to
   * `config.appDirectory`.
   */
  file: string;
}

export interface RouteManifest {
  [routeId: string]: RouteManifestEntry;
}

export interface RemixConfig {
  appDirectory: string;
  assetsBuildDirectory: string;
  cacheDirectory: string;
  serverBuildPath: string;
  serverEntryPoint?: string;
  routes: RouteManifest;
  publicPath: string;
}
