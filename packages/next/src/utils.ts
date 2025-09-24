import {
  FileFsRef,
  Files,
  Config,
  debug,
  FileBlob,
  glob,
  Lambda,
  Prerender,
  getLambdaOptionsFromFunction,
  getPlatformEnv,
  streamToBuffer,
  NowBuildError,
  isSymbolicLink,
  NodejsLambda,
  EdgeFunction,
  Images,
  File,
  FlagDefinitions,
  Chain,
} from '@vercel/build-utils';
import { NodeFileTraceReasons } from '@vercel/nft';
import type {
  HasField,
  Header,
  Rewrite,
  Route,
  RouteWithSrc,
} from '@vercel/routing-utils';
import { Sema } from 'async-sema';
import crc32 from 'buffer-crc32';
import fs, { lstat, stat } from 'fs-extra';
import path from 'path';
import semver from 'semver';
import url from 'url';
import { createRequire } from 'module';
import escapeStringRegexp from 'escape-string-regexp';
import { htmlContentType } from '.';
import textTable from 'text-table';
import { getNextjsEdgeFunctionSource } from './edge-function-source/get-edge-function-source';
import type {
  LambdaOptions,
  LambdaOptionsWithFiles,
} from '@vercel/build-utils/dist/lambda';
import { stringifySourceMap } from './sourcemapped';
import type { RawSourceMap } from 'source-map';
import { prettyBytes } from './pretty-bytes';
import {
  MIB,
  KIB,
  LAMBDA_RESERVED_UNCOMPRESSED_SIZE,
  DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE,
  INTERNAL_PAGES,
} from './constants';
import {
  getContentTypeFromFile,
  getSourceFileRefOfStaticMetadata,
} from './metadata';

type stringMap = { [key: string]: string };

export const require_ = createRequire(__filename);

export const RSC_CONTENT_TYPE = 'x-component';
export const RSC_PREFETCH_SUFFIX = '.prefetch.rsc';

export const MAX_UNCOMPRESSED_LAMBDA_SIZE = !isNaN(
  Number(process.env.MAX_UNCOMPRESSED_LAMBDA_SIZE)
)
  ? Number(process.env.MAX_UNCOMPRESSED_LAMBDA_SIZE)
  : DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE;

const skipDefaultLocaleRewrite = Boolean(
  process.env.NEXT_EXPERIMENTAL_DEFER_DEFAULT_LOCALE_REWRITE
);

// Identify /[param]/ in route string
// eslint-disable-next-line no-useless-escape
const TEST_DYNAMIC_ROUTE = /\/\[[^\/]+?\](?=\/|$)/;

function isDynamicRoute(route: string): boolean {
  route = route.startsWith('/') ? route : `/${route}`;
  return TEST_DYNAMIC_ROUTE.test(route);
}

/**
 * Validate if the entrypoint is allowed to be used
 */
function validateEntrypoint(entrypoint: string) {
  if (
    !/package\.json$/.exec(entrypoint) &&
    !/next\.config\.js$/.exec(entrypoint)
  ) {
    throw new NowBuildError({
      message:
        'Specified "src" for "@vercel/next" has to be "package.json" or "next.config.js"',
      code: 'NEXT_INCORRECT_SRC',
    });
  }
}

/**
 * Exclude certain files from the files object
 */
function excludeFiles(
  files: Files,
  matcher: (filePath: string) => boolean
): Files {
  return Object.keys(files).reduce((newFiles, filePath) => {
    if (matcher(filePath)) {
      return newFiles;
    }
    return {
      ...newFiles,
      [filePath]: files[filePath],
    };
  }, {});
}

/**
 * Enforce specific package.json configuration for smallest possible lambda
 */
function normalizePackageJson(
  defaultPackageJson: {
    dependencies?: stringMap;
    devDependencies?: stringMap;
    scripts?: stringMap;
  } = {}
) {
  const dependencies: stringMap = {};
  const devDependencies: stringMap = {
    ...defaultPackageJson.dependencies,
    ...defaultPackageJson.devDependencies,
  };

  if (devDependencies.react) {
    dependencies.react = devDependencies.react;
    delete devDependencies.react;
  }

  if (devDependencies['react-dom']) {
    dependencies['react-dom'] = devDependencies['react-dom'];
    delete devDependencies['react-dom'];
  }

  delete devDependencies['next-server'];

  return {
    ...defaultPackageJson,
    dependencies: {
      // react and react-dom can be overwritten
      react: 'latest',
      'react-dom': 'latest',
      ...dependencies, // override react if user provided it
      // next-server is forced to canary
      'next-server': 'v7.0.2-canary.49',
    },
    devDependencies: {
      ...devDependencies,
      // next is forced to canary
      next: 'v7.0.2-canary.49',
    },
    scripts: {
      ...defaultPackageJson.scripts,
      'now-build':
        'NODE_OPTIONS=--max_old_space_size=3000 next build --lambdas',
    },
  };
}

async function getNextConfig(workPath: string, entryPath: string) {
  const entryConfig = path.join(entryPath, './next.config.js');
  if (await fs.pathExists(entryConfig)) {
    return fs.readFile(entryConfig, 'utf8');
  }

  const workConfig = path.join(workPath, './next.config.js');
  if (await fs.pathExists(workConfig)) {
    return fs.readFile(workConfig, 'utf8');
  }

  return null;
}

function getImagesConfig(
  imagesManifest: NextImagesManifest | undefined
): Images | undefined {
  return imagesManifest?.images?.loader === 'default' &&
    imagesManifest.images?.unoptimized !== true
    ? {
        domains: imagesManifest.images.domains,
        sizes: imagesManifest.images.sizes,
        qualities: imagesManifest.images.qualities,
        remotePatterns: imagesManifest.images.remotePatterns,
        localPatterns: imagesManifest.images.localPatterns,
        minimumCacheTTL: imagesManifest.images.minimumCacheTTL,
        formats: imagesManifest.images.formats,
        dangerouslyAllowSVG: imagesManifest.images.dangerouslyAllowSVG,
        contentSecurityPolicy: imagesManifest.images.contentSecurityPolicy,
        contentDispositionType: imagesManifest.images.contentDispositionType,
      }
    : undefined;
}

function normalizePage(page: string): string {
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`;
  }

  // Replace the `/index` with `/`
  if (page === '/index') {
    page = '/';
  }

  return page;
}

export type Redirect = Rewrite & {
  statusCode?: number;
  permanent?: boolean;
};

type RoutesManifestRegex = {
  regex: string;
  regexKeys: string[];
};

type RoutesManifestRoute = {
  page: string;
  regex: string;
  namedRegex?: string;
  routeKeys?: { [named: string]: string };

  /**
   * If true, this indicates that the route has fallback root params. This is
   * used to simplify the route regex for matching.
   */
  hasFallbackRootParams?: boolean;

  /**
   * The prefetch segment data routes for this route. This is used to rewrite
   * the prefetch segment data routes (or the inverse) to the correct
   * destination.
   */
  prefetchSegmentDataRoutes?: {
    source: string;
    destination: string;
    routeKeys?: { [named: string]: string };
  }[];
};

type RoutesManifestOld = {
  pages404: boolean;
  basePath: string | undefined;
  redirects: (Redirect & RoutesManifestRegex)[];
  rewrites:
    | (Rewrite & RoutesManifestRegex)[]
    | {
        beforeFiles: (Rewrite & RoutesManifestRegex)[];
        afterFiles: (Rewrite & RoutesManifestRegex)[];
        fallback: (Rewrite & RoutesManifestRegex)[];
      };
  headers?: (Header & RoutesManifestRegex)[];
  dynamicRoutes: RoutesManifestRoute[];
  staticRoutes: RoutesManifestRoute[];
  version: 1 | 2 | 3;
  dataRoutes?: Array<{
    page: string;
    dataRouteRegex: string;
    namedDataRouteRegex?: string;
    routeKeys?: { [named: string]: string };
  }>;
  i18n?: {
    localeDetection?: boolean;
    defaultLocale: string;
    locales: string[];
    domains?: Array<{
      http?: boolean;
      domain: string;
      locales?: string[];
      defaultLocale: string;
    }>;
  };
  rsc?: {
    header: string;
    varyHeader: string;
    prefetchHeader?: string;
    didPostponeHeader?: string;
    contentTypeHeader: string;

    /**
     * Header for the prefetch segment data route rewrites.
     */
    prefetchSegmentHeader?: string;

    /**
     * Suffix for the prefetch segment data route rewrites.
     */
    prefetchSegmentSuffix?: string;

    /**
     * Suffix for the prefetch segment data route directory.
     */
    prefetchSegmentDirSuffix?: string;

    /**
     * When true, the dynamic RSC route is expecting to be a prerendered route.
     */
    dynamicRSCPrerender?: boolean;

    /**
     * Whether the client param parsing is enabled. This is only relevant for
     * app pages when PPR is enabled.
     */
    clientParamParsing?: boolean;
  };
  rewriteHeaders?: {
    pathHeader: string;
    queryHeader: string;
  };
  skipMiddlewareUrlNormalize?: boolean;
  /**
   * Configuration related to Partial Prerendering.
   */
  ppr?: {
    /**
     * The chained response for the PPR resume.
     */
    chain: {
      /**
       * The headers that will indicate to Next.js that the request is for a PPR
       * resume.
       */
      headers: Readonly<Record<string, string>>;
    };
  };
};

type RoutesManifestV4 = Omit<RoutesManifestOld, 'dynamicRoutes' | 'version'> & {
  version: 4;
  dynamicRoutes: (
    | RoutesManifestRoute
    | { sourcePage: string | undefined; page: string; isMiddleware: true }
  )[];
};

export type RoutesManifest = RoutesManifestV4 | RoutesManifestOld;

export async function getRoutesManifest(
  entryPath: string,
  outputDirectory: string,
  nextVersion?: string
): Promise<RoutesManifest | undefined> {
  const shouldHaveManifest =
    nextVersion && semver.gte(nextVersion, '9.1.4-canary.0');
  if (!shouldHaveManifest) return;

  const pathRoutesManifest = path.join(
    entryPath,
    outputDirectory,
    'routes-manifest.json'
  );
  const hasRoutesManifest = await fs
    .access(pathRoutesManifest)
    .then(() => true)
    .catch(() => false);

  if (shouldHaveManifest && !hasRoutesManifest) {
    throw new NowBuildError({
      message: `The file "${pathRoutesManifest}" couldn't be found. This is often caused by a misconfiguration in your project.`,
      link: 'https://err.sh/vercel/vercel/now-next-routes-manifest',
      code: 'NEXT_NO_ROUTES_MANIFEST',
    });
  }

  const routesManifest: RoutesManifest = await fs.readJSON(pathRoutesManifest);
  // remove temporary array based routeKeys from v1/v2 of routes
  // manifest since it can result in invalid routes
  for (const route of routesManifest.dataRoutes || []) {
    if (Array.isArray(route.routeKeys)) {
      delete route.routeKeys;
      delete route.namedDataRouteRegex;
    }
  }
  for (const route of routesManifest.dynamicRoutes || []) {
    if ('routeKeys' in route && Array.isArray(route.routeKeys)) {
      delete route.routeKeys;
      delete route.namedRegex;
    }
  }

  return routesManifest;
}

function getDestinationForSegmentRoute(
  isDev: boolean,
  entryDirectory: string,
  routeKeys: Record<string, string> | undefined,
  prefetchSegmentDataRoute: {
    destination: string;
    routeKeys?: Record<string, string>;
  }
) {
  return `${
    !isDev
      ? path.posix.join(
          '/',
          entryDirectory,
          prefetchSegmentDataRoute.destination
        )
      : prefetchSegmentDataRoute.destination
  }?${Object.entries(prefetchSegmentDataRoute.routeKeys ?? routeKeys ?? {})
    .map(([key, value]) => `${value}=$${key}`)
    .join('&')}`;
}

export async function getDynamicRoutes({
  entryPath,
  entryDirectory,
  dynamicPages,
  isDev,
  routesManifest,
  omittedRoutes,
  canUsePreviewMode,
  bypassToken,
  isServerMode,
  dynamicMiddlewareRouteMap,
  isAppPPREnabled,
  isAppClientSegmentCacheEnabled,
  isAppClientParamParsingEnabled,
  prerenderManifest,
}: {
  entryPath: string;
  entryDirectory: string;
  dynamicPages: string[];
  isDev?: boolean;
  routesManifest?: RoutesManifest;
  omittedRoutes?: ReadonlySet<string>;
  canUsePreviewMode?: boolean;
  bypassToken?: string;
  isServerMode?: boolean;
  dynamicMiddlewareRouteMap?: ReadonlyMap<string, RouteWithSrc>;
  isAppPPREnabled: boolean;
  isAppClientSegmentCacheEnabled: boolean;
  isAppClientParamParsingEnabled: boolean;
  prerenderManifest: NextPrerenderedRoutes;
}): Promise<RouteWithSrc[]> {
  if (routesManifest) {
    switch (routesManifest.version) {
      case 1:
      case 2: {
        return routesManifest.dynamicRoutes
          .filter(({ page }) => canUsePreviewMode || !omittedRoutes?.has(page))
          .map(({ page, regex }: { page: string; regex: string }) => {
            return {
              src: regex,
              dest: !isDev ? path.posix.join('/', entryDirectory, page) : page,
              check: true,
              status:
                canUsePreviewMode && omittedRoutes?.has(page) ? 404 : undefined,
            };
          });
      }
      case 3:
      case 4: {
        const routes: RouteWithSrc[] = [];

        // for static routes check if there is a .prefetch or .rsc
        // for the corresponding segment request that matches
        // exactly before continuing to process dynamic routes
        if (isAppClientSegmentCacheEnabled && !isAppPPREnabled) {
          routes.push({
            src: '^/(?<path>.+)(?<rscSuffix>\\.segments/.+\\.segment\\.rsc)(?:/)?$',
            dest: `/$path${isAppPPREnabled ? '.prefetch.rsc' : '.rsc'}`,
            check: true,
            override: true,
          });
        }

        for (const dynamicRoute of routesManifest.dynamicRoutes) {
          if (!canUsePreviewMode && omittedRoutes?.has(dynamicRoute.page)) {
            continue;
          }
          const params = dynamicRoute;

          if ('isMiddleware' in params) {
            const route = dynamicMiddlewareRouteMap?.get(params.page);
            if (!route) {
              throw new Error(
                `Could not find dynamic middleware route for ${params.page}`
              );
            }

            routes.push(route);
            continue;
          }

          const {
            page,
            namedRegex,
            regex,
            routeKeys,
            prefetchSegmentDataRoutes,
            hasFallbackRootParams,
          } = params;
          const route: RouteWithSrc = {
            src: namedRegex || regex,
            dest: `${
              !isDev ? path.posix.join('/', entryDirectory, page) : page
            }${
              routeKeys
                ? `?${Object.keys(routeKeys)
                    .map(key => `${routeKeys[key]}=$${key}`)
                    .join('&')}`
                : ''
            }`,
          };

          // Determine if the route is PPR enabled. This is a dynamic route (as
          // it's listed in the routes manifest as dynamic) so we only need to
          // check the prerender manifest.
          const { renderingMode, prefetchDataRoute } =
            prerenderManifest.fallbackRoutes[page] ??
            prerenderManifest.blockingFallbackRoutes[page] ??
            prerenderManifest.omittedRoutes[page] ??
            {};

          const isRoutePPREnabled =
            renderingMode === RenderingMode.PARTIALLY_STATIC;

          if (!isServerMode) {
            route.check = true;
          }

          // We must use check: true and override to ensure the
          // correct route priority with PPR or segment cache
          if (isAppPPREnabled || isAppClientSegmentCacheEnabled) {
            route.check = true;
            route.override = true;
          }

          if (isServerMode && canUsePreviewMode && omittedRoutes?.has(page)) {
            // only match this route when in preview mode so
            // preview works for non-prerender fallback: false pages
            route.has = [
              {
                type: 'cookie',
                key: '__prerender_bypass',
                value: bypassToken || undefined,
              },
              {
                type: 'cookie',
                key: '__next_preview_data',
              },
            ];
          }

          if (
            isAppClientSegmentCacheEnabled &&
            prefetchSegmentDataRoutes &&
            prefetchSegmentDataRoutes.length > 0
          ) {
            for (const prefetchSegmentDataRoute of prefetchSegmentDataRoutes) {
              routes.push({
                src: prefetchSegmentDataRoute.source,
                dest: getDestinationForSegmentRoute(
                  isDev === true,
                  entryDirectory,
                  routeKeys,
                  prefetchSegmentDataRoute
                ),
                check: true,
                override: true,
              });
            }
          }

          // use combined regex for .rsc, .prefetch.rsc, and .segments
          // if PPR or client segment cache is enabled
          if (isAppPPREnabled || isAppClientSegmentCacheEnabled) {
            // If we have fallback root params (implying we've already
            // emitted a rewrite for the /_tree request), or if the route
            // has PPR enabled and client param parsing is enabled, then
            // we don't need to include any other suffixes.
            const shouldSkipSuffixes =
              hasFallbackRootParams ||
              (isRoutePPREnabled &&
                isAppClientParamParsingEnabled &&
                !prefetchDataRoute);

            routes.push({
              src: route.src.replace(
                new RegExp(escapeStringRegexp('(?:/)?$')),
                // Now than the upstream issues has been resolved, we can safely
                // add the suffix back, this resolves a bug related to segment
                // rewrites not capturing the correct suffix values when
                // enabled.
                shouldSkipSuffixes
                  ? '(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$'
                  : '(?<rscSuffix>\\.rsc|\\.prefetch\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$'
              ),
              dest: route.dest?.replace(/($|\?)/, '$rscSuffix$1'),
              check: true,
              override: true,
            });
          } else {
            routes.push({
              ...route,
              src: route.src.replace(
                new RegExp(escapeStringRegexp('(?:/)?$')),
                '(?:\\.rsc)(?:/)?$'
              ),
              dest: route.dest?.replace(/($|\?)/, '.rsc$1'),
            });
          }

          routes.push(route);
        }

        return routes;
      }
      default: {
        // update MIN_ROUTES_MANIFEST_VERSION
        throw new NowBuildError({
          message:
            'This version of `@vercel/next` does not support the version of Next.js you are trying to deploy.\n' +
            'Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
          code: 'NEXT_VERSION_UPGRADE',
        });
      }
    }
  }

  // FALLBACK:
  // When `routes-manifest.json` does not exist (old Next.js versions), we'll try to
  // require the methods we need from Next.js' internals.
  if (!dynamicPages.length) {
    return [];
  }

  let getRouteRegex: ((pageName: string) => { re: RegExp }) | undefined =
    undefined;

  let getSortedRoutes:
    | ((normalizedPages: ReadonlyArray<string>) => string[])
    | undefined;

  try {
    const resolved = require_.resolve('next-server/dist/lib/router/utils', {
      paths: [entryPath],
    });
    ({ getRouteRegex, getSortedRoutes } = require_(resolved));
    if (typeof getRouteRegex !== 'function') {
      getRouteRegex = undefined;
    }
  } catch (_) {} // eslint-disable-line no-empty

  if (!getRouteRegex || !getSortedRoutes) {
    try {
      const resolved = require_.resolve(
        'next/dist/next-server/lib/router/utils',
        { paths: [entryPath] }
      );
      ({ getRouteRegex, getSortedRoutes } = require_(resolved));
      if (typeof getRouteRegex !== 'function') {
        getRouteRegex = undefined;
      }
    } catch (_) {} // eslint-disable-line no-empty
  }

  if (!getRouteRegex || !getSortedRoutes) {
    throw new NowBuildError({
      message:
        'Found usage of dynamic routes but not on a new enough version of Next.js.',
      code: 'NEXT_DYNAMIC_ROUTES_OUTDATED',
    });
  }

  const pageMatchers = getSortedRoutes(dynamicPages).map(pageName => ({
    pageName,
    matcher: getRouteRegex && getRouteRegex(pageName).re,
  }));

  const routes: RouteWithSrc[] = [];
  pageMatchers.forEach(pageMatcher => {
    // in `vercel dev` we don't need to prefix the destination
    const dest = !isDev
      ? path.posix.join('/', entryDirectory, pageMatcher.pageName)
      : pageMatcher.pageName;

    if (pageMatcher && pageMatcher.matcher) {
      routes.push({
        src: pageMatcher.matcher.source,
        dest,
        check: !isDev,
      });
    }
  });
  return routes;
}

export function localizeDynamicRoutes(
  dynamicRoutes: RouteWithSrc[],
  dynamicPrefix: string,
  entryDirectory: string,
  staticPages: Files,
  prerenderManifest: NextPrerenderedRoutes,
  routesManifest?: RoutesManifest,
  isServerMode?: boolean,
  isCorrectLocaleAPIRoutes?: boolean,
  inversedAppPathRoutesManifest?: Record<string, string>
): RouteWithSrc[] {
  const finalDynamicRoutes: RouteWithSrc[] = [];
  const nonLocalePrefixedRoutes: RouteWithSrc[] = [];

  for (const route of dynamicRoutes as RouteWithSrc[]) {
    // i18n is already handled for middleware
    if (route.middleware !== undefined || route.middlewarePath !== undefined) {
      finalDynamicRoutes.push(route);
      continue;
    }
    const { i18n } = routesManifest || {};

    if (i18n) {
      const { pathname } = url.parse(route.dest!);
      const pathnameNoPrefix = pathname?.replace(dynamicPrefix, '');
      const isFallback = prerenderManifest.fallbackRoutes[pathname!];
      const isBlocking = prerenderManifest.blockingFallbackRoutes[pathname!];
      const isApiRoute =
        pathnameNoPrefix === '/api' || pathnameNoPrefix?.startsWith('/api/');
      const isAutoExport =
        staticPages[addLocaleOrDefault(pathname!, routesManifest).substring(1)];

      const isAppRoute =
        inversedAppPathRoutesManifest?.[pathnameNoPrefix || ''];

      const isLocalePrefixed =
        isFallback || isBlocking || isAutoExport || isServerMode;

      // when locale detection is disabled we don't add the default locale
      // to the path while resolving routes so we need to be able to match
      // without it being present
      if (
        skipDefaultLocaleRewrite &&
        isLocalePrefixed &&
        routesManifest?.i18n?.localeDetection === false
      ) {
        const nonLocalePrefixedRoute = JSON.parse(JSON.stringify(route));
        nonLocalePrefixedRoute.src = nonLocalePrefixedRoute.src.replace(
          '^',
          `^${dynamicPrefix || ''}[/]?`
        );
        nonLocalePrefixedRoutes.push(nonLocalePrefixedRoute);
      }

      route.src = route.src.replace(
        '^',
        `^${dynamicPrefix ? `${dynamicPrefix}[/]?` : '[/]?'}(?${
          isLocalePrefixed ? '<nextLocale>' : ':'
        }${i18n.locales.map(locale => escapeStringRegexp(locale)).join('|')})${
          // the locale is not optional on this path with the skip default
          // locale rewrite flag otherwise can cause double slash in dest
          skipDefaultLocaleRewrite ? '' : '?'
        }`
      );

      if (
        isLocalePrefixed &&
        !(isCorrectLocaleAPIRoutes && isApiRoute) &&
        !isAppRoute
      ) {
        // ensure destination has locale prefix to match prerender output
        // path so that the prerender object is used
        route.dest = route.dest!.replace(
          `${path.posix.join('/', entryDirectory, '/')}`,
          `${path.posix.join('/', entryDirectory, '$nextLocale', '/')}`
        );
      }
    } else {
      route.src = route.src.replace('^', `^${dynamicPrefix}`);
    }
    finalDynamicRoutes.push(route);
  }

  if (nonLocalePrefixedRoutes.length > 0) {
    finalDynamicRoutes.push(...nonLocalePrefixedRoutes);
  }

  return finalDynamicRoutes;
}

type LoaderKey = 'imgix' | 'cloudinary' | 'akamai' | 'default';

export type NextImagesManifest = {
  version: number;
  images: {
    loader: LoaderKey;
    sizes: number[];
    domains: string[];
    remotePatterns: Images['remotePatterns'];
    localPatterns: Images['localPatterns'];
    minimumCacheTTL?: Images['minimumCacheTTL'];
    formats?: Images['formats'];
    qualities?: Images['qualities'];
    unoptimized?: boolean;
    dangerouslyAllowSVG?: Images['dangerouslyAllowSVG'];
    contentSecurityPolicy?: Images['contentSecurityPolicy'];
    contentDispositionType?: Images['contentDispositionType'];
  };
};

export async function getImagesManifest(
  entryPath: string,
  outputDirectory: string
): Promise<NextImagesManifest | undefined> {
  const pathImagesManifest = path.join(
    entryPath,
    outputDirectory,
    'images-manifest.json'
  );

  const hasImagesManifest = await fs
    .access(pathImagesManifest)
    .then(() => true)
    .catch(() => false);

  if (!hasImagesManifest) {
    return undefined;
  }

  return fs.readJson(pathImagesManifest);
}

type FileMap = { [page: string]: FileFsRef };

export function filterStaticPages(
  staticPageFiles: FileMap,
  dynamicPages: string[],
  entryDirectory: string,
  htmlContentType: string,
  prerenderManifest: NextPrerenderedRoutes,
  routesManifest?: RoutesManifest
) {
  const staticPages: FileMap = {};

  Object.keys(staticPageFiles).forEach((page: string) => {
    const pathname = page.replace(/\.html$/, '');
    const routeName = normalizeLocalePath(
      normalizePage(pathname),
      routesManifest?.i18n?.locales
    ).pathname;

    // Prerendered routes emit a `.html` file but should not be treated as a
    // static page.
    // Lazily prerendered routes have a fallback `.html` file on newer
    // Next.js versions so we need to also not treat it as a static page here.
    if (
      prerenderManifest.staticRoutes[routeName] ||
      prerenderManifest.fallbackRoutes[routeName] ||
      prerenderManifest.staticRoutes[normalizePage(pathname)] ||
      prerenderManifest.fallbackRoutes[normalizePage(pathname)]
    ) {
      return;
    }

    const staticRoute = path.posix.join(entryDirectory, pathname);

    staticPages[staticRoute] = staticPageFiles[page];
    staticPages[staticRoute].contentType = htmlContentType;

    if (isDynamicRoute(pathname)) {
      dynamicPages.push(routeName);
      return;
    }
  });

  return staticPages;
}

export function getFilesMapFromReasons(
  fileList: ReadonlySet<string>,
  reasons: NodeFileTraceReasons,
  ignoreFn?: (file: string, parent?: string) => boolean
): ReadonlyMap<string, Set<string>> {
  // this uses the reasons tree to collect files specific to a
  // certain parent allowing us to not have to trace each parent
  // separately
  const parentFilesMap = new Map<string, Set<string>>();

  function propagateToParents(
    parents: Set<string>,
    file: string,
    seen = new Set<string>()
  ) {
    for (const parent of parents || []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        let parentFiles = parentFilesMap.get(parent);

        if (!parentFiles) {
          parentFiles = new Set();
          parentFilesMap.set(parent, parentFiles);
        }

        if (!ignoreFn?.(file, parent)) {
          parentFiles.add(file);
        }
        const parentReason = reasons.get(parent);

        if (parentReason?.parents) {
          propagateToParents(parentReason.parents, file, seen);
        }
      }
    }
  }

  for (const file of fileList!) {
    const reason = reasons!.get(file);
    const isInitial =
      reason?.type.length === 1 && reason.type.includes('initial');

    if (
      !reason ||
      !reason.parents ||
      (isInitial && reason.parents.size === 0)
    ) {
      continue;
    }
    propagateToParents(reason.parents, file);
  }
  return parentFilesMap;
}

export const collectTracedFiles =
  (
    baseDir: string,
    lstatResults: { [key: string]: ReturnType<typeof lstat> },
    lstatSema: Sema,
    reasons: NodeFileTraceReasons
  ) =>
  async (file: string) => {
    const reason = reasons.get(file);
    if (reason && reason.type.includes('initial')) {
      // Initial files are manually added to the lambda later
      return;
    }
    const filePath = path.join(baseDir, file);

    if (!lstatResults[filePath]) {
      lstatResults[filePath] = lstatSema
        .acquire()
        .then(() => lstat(filePath))
        .finally(() => lstatSema.release());
    }
    const { mode } = await lstatResults[filePath];

    return [
      file,
      new FileFsRef({
        fsPath: path.join(baseDir, file),
        mode,
      }),
    ];
  };

export const ExperimentalTraceVersion = `9.0.4-canary.1`;

export type PseudoLayer = {
  [fileName: string]: PseudoFile | PseudoSymbolicLink;
};

export type PseudoFile = {
  file: FileFsRef;
  isSymlink: false;
  crc32: number;
  uncompressedSize: number;
};

export type PseudoSymbolicLink = {
  file: FileFsRef;
  isSymlink: true;
  symlinkTarget: string;
};

export type PseudoLayerResult = {
  pseudoLayer: PseudoLayer;
  pseudoLayerBytes: number;
};

export async function createPseudoLayer(files: {
  [fileName: string]: FileFsRef;
}): Promise<PseudoLayerResult> {
  const pseudoLayer: PseudoLayer = {};
  let pseudoLayerBytes = 0;

  for (const fileName of Object.keys(files)) {
    const file = files[fileName];

    if (isSymbolicLink(file.mode)) {
      const symlinkTarget = await fs.readlink(file.fsPath);
      pseudoLayer[fileName] = {
        file,
        isSymlink: true,
        symlinkTarget,
      };
    } else {
      const origBuffer = await streamToBuffer(file.toStream());
      pseudoLayerBytes += origBuffer.byteLength;
      pseudoLayer[fileName] = {
        file,
        isSymlink: false,
        crc32: crc32.unsigned(origBuffer),
        uncompressedSize: origBuffer.byteLength,
      };
    }
  }

  return { pseudoLayer, pseudoLayerBytes };
}

export interface CreateLambdaFromPseudoLayersOptions
  extends LambdaOptionsWithFiles {
  layers: PseudoLayer[];
  isStreaming?: boolean;
  nextVersion?: string;
  experimentalAllowBundling?: boolean;
}

// measured with 1, 2, 5, 10, and `os.cpus().length || 5`
// and sema(1) produced the best results
const createLambdaSema = new Sema(1);

export async function createLambdaFromPseudoLayers({
  files: baseFiles,
  layers,
  isStreaming,
  nextVersion,
  experimentalAllowBundling,
  ...lambdaOptions
}: CreateLambdaFromPseudoLayersOptions) {
  await createLambdaSema.acquire();

  const files: Files = {};
  const addedFiles = new Set();

  // Add files from pseudo layers
  for (const layer of layers) {
    for (const seedKey of Object.keys(layer)) {
      if (addedFiles.has(seedKey)) {
        // File was already added in a previous pseudo layer
        continue;
      }
      const item = layer[seedKey];
      files[seedKey] = item.file;
      addedFiles.add(seedKey);
    }
  }

  for (const fileName of Object.keys(baseFiles)) {
    if (addedFiles.has(fileName)) {
      // File was already added in a previous pseudo layer
      continue;
    }
    const file = baseFiles[fileName];
    files[fileName] = file;
    addedFiles.add(fileName);
  }

  createLambdaSema.release();

  return new NodejsLambda({
    ...lambdaOptions,
    ...(isStreaming
      ? {
          supportsResponseStreaming: true,
        }
      : {}),
    files,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    supportsMultiPayloads: true,
    framework: {
      slug: 'nextjs',
      version: nextVersion,
    },
    experimentalAllowBundling,
  });
}

export type NextRequiredServerFilesManifest = {
  appDir?: string;
  relativeAppDir?: string;
  files: string[];
  ignore: string[];
  config: Record<string, any>;
};

/**
 * The rendering mode for a route.
 */
export const enum RenderingMode {
  /**
   * `STATIC` rendering mode will output a fully static HTML page or error if
   * anything dynamic is used.
   */
  STATIC = 'STATIC',

  /**
   * `PARTIALLY_STATIC` rendering mode will output a fully static HTML page if
   * the route is fully static, but will output a partially static HTML page if
   * the route uses uses any dynamic API's.
   */
  PARTIALLY_STATIC = 'PARTIALLY_STATIC',
}

export type NextPrerenderedRoutes = {
  bypassToken: string | null;

  staticRoutes: {
    [route: string]: {
      initialRevalidate: number | false;
      initialExpire?: number;
      dataRoute: string | null;
      prefetchDataRoute?: string | null;
      srcRoute: string | null;
      initialStatus?: number;
      initialHeaders?: Record<string, string>;
      experimentalBypassFor?: HasField;
      renderingMode: RenderingMode;
      allowHeader: string[] | undefined;
    };
  };

  blockingFallbackRoutes: {
    [route: string]: {
      routeRegex: string;
      dataRoute: string | null;
      fallback: string | boolean | null;
      fallbackRootParams?: string[];
      dataRouteRegex: string | null;
      prefetchDataRoute?: string | null;
      prefetchDataRouteRegex?: string | null;
      experimentalBypassFor?: HasField;
      renderingMode: RenderingMode;
      allowHeader: string[] | undefined;
    };
  };

  fallbackRoutes: {
    [route: string]: {
      fallback: string;
      fallbackStatus?: number;
      fallbackHeaders?: Record<string, string>;
      fallbackRevalidate?: number | false;
      fallbackExpire?: number;
      fallbackRootParams?: string[];
      fallbackSourceRoute?: string;
      routeRegex: string;
      dataRoute: string | null;
      dataRouteRegex: string | null;
      prefetchDataRoute?: string | null;
      prefetchDataRouteRegex?: string | null;
      experimentalBypassFor?: HasField;
      renderingMode: RenderingMode;
      allowHeader: string[] | undefined;
    };
  };

  /**
   * Routes that have their fallback behavior is disabled. All routes would've
   * been provided in the top-level `routes` key (`staticRoutes`).
   */
  omittedRoutes: {
    [route: string]: {
      routeRegex: string;
      dataRoute: string | null;
      dataRouteRegex: string | null;
      prefetchDataRoute: string | null | undefined;
      prefetchDataRouteRegex: string | null | undefined;
      experimentalBypassFor?: HasField;
      renderingMode: RenderingMode;
      allowHeader: string[] | undefined;
    };
  };

  notFoundRoutes: string[];

  isLocalePrefixed: boolean;
};

export async function getExportIntent(
  entryPath: string
): Promise<false | { trailingSlash: boolean }> {
  const pathExportMarker = path.join(entryPath, '.next', 'export-marker.json');
  const hasExportMarker: boolean = await fs
    .access(pathExportMarker, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasExportMarker) {
    return false;
  }

  const manifest: {
    version: 1;
    exportTrailingSlash: boolean;
    hasExportPathMap: boolean;
  } = JSON.parse(await fs.readFile(pathExportMarker, 'utf8'));

  switch (manifest.version) {
    case 1: {
      if (manifest.hasExportPathMap !== true) {
        return false;
      }

      return { trailingSlash: manifest.exportTrailingSlash };
    }

    default: {
      return false;
    }
  }
}

export async function getExportStatus(
  entryPath: string
): Promise<false | { success: boolean; outDirectory: string }> {
  const pathExportDetail = path.join(entryPath, '.next', 'export-detail.json');
  const hasExportDetail: boolean = await fs
    .access(pathExportDetail, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasExportDetail) {
    return false;
  }

  const manifest: {
    version: 1;
    success: boolean;
    outDirectory: string;
  } = JSON.parse(await fs.readFile(pathExportDetail, 'utf8'));

  switch (manifest.version) {
    case 1: {
      return {
        success: !!manifest.success,
        outDirectory: manifest.outDirectory,
      };
    }

    default: {
      return false;
    }
  }
}

export async function getRequiredServerFilesManifest(
  entryPath: string,
  outputDirectory: string
): Promise<NextRequiredServerFilesManifest | false> {
  const pathRequiredServerFilesManifest = path.join(
    entryPath,
    outputDirectory,
    'required-server-files.json'
  );

  const hasManifest: boolean = await fs
    .access(pathRequiredServerFilesManifest, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasManifest) {
    return false;
  }

  const manifestData = JSON.parse(
    await fs.readFile(pathRequiredServerFilesManifest, 'utf8')
  );

  const requiredServerFiles = {
    files: [],
    ignore: [],
    config: {},
    appDir: manifestData.appDir,
    relativeAppDir: manifestData.relativeAppDir,
  };

  switch (manifestData.version) {
    case 1: {
      requiredServerFiles.files = manifestData.files;
      requiredServerFiles.ignore = manifestData.ignore;
      requiredServerFiles.config = manifestData.config;
      requiredServerFiles.appDir = manifestData.appDir;
      break;
    }
    default: {
      throw new Error(
        `Invalid required-server-files manifest version ${manifestData.version}, please contact support if this error persists`
      );
    }
  }
  return requiredServerFiles;
}

export async function getPrerenderManifest(
  entryPath: string,
  outputDirectory: string
): Promise<NextPrerenderedRoutes> {
  const pathPrerenderManifest = path.join(
    entryPath,
    outputDirectory,
    'prerender-manifest.json'
  );

  const hasManifest: boolean = await fs
    .access(pathPrerenderManifest, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasManifest) {
    return {
      staticRoutes: {},
      blockingFallbackRoutes: {},
      fallbackRoutes: {},
      bypassToken: null,
      omittedRoutes: {},
      notFoundRoutes: [],
      isLocalePrefixed: false,
    };
  }

  const manifest:
    | {
        version: 1;
        routes: {
          [key: string]: {
            initialRevalidateSeconds: number | false;
            dataRoute: string;
            srcRoute: string | null;
          };
        };
        dynamicRoutes: {
          [key: string]: {
            fallback?: string;
            fallbackRootParams?: string[];
            routeRegex: string;
            dataRoute: string;
            dataRouteRegex: string;
          };
        };
        preview?: {
          previewModeId: string;
        };
      }
    | {
        version: 2 | 3;
        routes: {
          [route: string]: {
            initialRevalidateSeconds: number | false;
            srcRoute: string | null;
            dataRoute: string;
          };
        };
        dynamicRoutes: {
          [route: string]: {
            routeRegex: string;
            fallback: string | false;
            dataRoute: string;
            dataRouteRegex: string;
          };
        };
        preview: {
          previewModeId: string;
        };
        notFoundRoutes?: string[];
      }
    | {
        version: 4;
        routes: {
          [route: string]: {
            initialRevalidateSeconds: number | false;
            initialExpireSeconds?: number;
            srcRoute: string | null;
            dataRoute: string | null;
            prefetchDataRoute: string | null | undefined;
            initialStatus?: number;
            initialHeaders?: Record<string, string>;
            experimentalBypassFor?: HasField;
            experimentalPPR?: boolean;
            renderingMode?: RenderingMode;
            allowHeader?: string[];
          };
        };
        dynamicRoutes: {
          [route: string]: {
            routeRegex: string;
            fallback: string | false;
            fallbackStatus?: number;
            fallbackHeaders?: Record<string, string>;
            fallbackRevalidate: number | false | undefined;
            fallbackExpire?: number;
            fallbackRootParams: string[] | undefined;
            fallbackSourceRoute?: string;
            dataRoute: string | null;
            dataRouteRegex: string | null;
            prefetchDataRoute: string | null | undefined;
            prefetchDataRouteRegex: string | null | undefined;
            experimentalBypassFor?: HasField;
            experimentalPPR?: boolean;
            renderingMode?: RenderingMode;
            allowHeader?: string[];
          };
        };
        preview: {
          previewModeId: string;
        };
        notFoundRoutes?: string[];
      } = JSON.parse(await fs.readFile(pathPrerenderManifest, 'utf8'));

  switch (manifest.version) {
    case 1: {
      const routes = Object.keys(manifest.routes);
      const lazyRoutes = Object.keys(manifest.dynamicRoutes);

      const ret: NextPrerenderedRoutes = {
        staticRoutes: {},
        blockingFallbackRoutes: {},
        fallbackRoutes: {},
        bypassToken:
          (manifest.preview && manifest.preview.previewModeId) || null,
        omittedRoutes: {},
        notFoundRoutes: [],
        isLocalePrefixed: false,
      };

      routes.forEach(route => {
        const { initialRevalidateSeconds, dataRoute, srcRoute } =
          manifest.routes[route];
        ret.staticRoutes[route] = {
          initialRevalidate:
            initialRevalidateSeconds === false
              ? false
              : Math.max(1, initialRevalidateSeconds),
          dataRoute,
          srcRoute,
          renderingMode: RenderingMode.STATIC,
          allowHeader: undefined,
        };
      });

      lazyRoutes.forEach(lazyRoute => {
        const {
          routeRegex,
          fallback,
          dataRoute,
          dataRouteRegex,
          fallbackRootParams,
        } = manifest.dynamicRoutes[lazyRoute];

        if (fallback) {
          ret.fallbackRoutes[lazyRoute] = {
            routeRegex,
            fallback,
            dataRoute,
            dataRouteRegex,
            renderingMode: RenderingMode.STATIC,
            allowHeader: undefined,
          };
        } else {
          ret.blockingFallbackRoutes[lazyRoute] = {
            routeRegex,
            dataRoute,
            fallback: null,
            fallbackRootParams,
            dataRouteRegex,
            renderingMode: RenderingMode.STATIC,
            allowHeader: undefined,
          };
        }
      });

      return ret;
    }
    case 2:
    case 3:
    case 4: {
      const routes = Object.keys(manifest.routes);
      const lazyRoutes = Object.keys(manifest.dynamicRoutes);

      const ret: NextPrerenderedRoutes = {
        staticRoutes: {},
        blockingFallbackRoutes: {},
        fallbackRoutes: {},
        bypassToken: manifest.preview.previewModeId,
        omittedRoutes: {},
        notFoundRoutes: [],
        isLocalePrefixed: manifest.version > 2,
      };

      if (manifest.notFoundRoutes) {
        ret.notFoundRoutes.push(...manifest.notFoundRoutes);
      }

      routes.forEach(route => {
        const { initialRevalidateSeconds, dataRoute, srcRoute } =
          manifest.routes[route];

        let initialExpireSeconds: undefined | number;
        let initialStatus: undefined | number;
        let initialHeaders: undefined | Record<string, string>;
        let experimentalBypassFor: undefined | HasField;
        let prefetchDataRoute: undefined | string | null;
        let allowHeader: undefined | string[];
        let renderingMode: RenderingMode;

        if (manifest.version === 4) {
          initialExpireSeconds = manifest.routes[route].initialExpireSeconds;
          initialStatus = manifest.routes[route].initialStatus;
          initialHeaders = manifest.routes[route].initialHeaders;
          experimentalBypassFor = manifest.routes[route].experimentalBypassFor;
          prefetchDataRoute = manifest.routes[route].prefetchDataRoute;
          allowHeader = manifest.routes[route].allowHeader;
          renderingMode =
            manifest.routes[route].renderingMode ??
            (manifest.routes[route].experimentalPPR
              ? RenderingMode.PARTIALLY_STATIC
              : RenderingMode.STATIC);
        } else {
          renderingMode = RenderingMode.STATIC;
          allowHeader = undefined;
        }

        ret.staticRoutes[route] = {
          initialRevalidate:
            initialRevalidateSeconds === false
              ? false
              : Math.max(1, initialRevalidateSeconds),
          initialExpire: initialExpireSeconds,
          dataRoute,
          prefetchDataRoute,
          srcRoute,
          initialStatus,
          initialHeaders,
          allowHeader,
          experimentalBypassFor,
          renderingMode,
        };
      });

      lazyRoutes.forEach(lazyRoute => {
        const { routeRegex, fallback, dataRoute, dataRouteRegex } =
          manifest.dynamicRoutes[lazyRoute];
        let experimentalBypassFor: undefined | HasField;
        let prefetchDataRoute: undefined | string | null;
        let prefetchDataRouteRegex: undefined | string | null;
        let fallbackStatus: undefined | number;
        let fallbackHeaders: undefined | Record<string, string>;
        let renderingMode: RenderingMode = RenderingMode.STATIC;
        let fallbackRevalidate: number | false | undefined;
        let fallbackExpire: number | undefined;
        let fallbackRootParams: undefined | string[];
        let allowHeader: undefined | string[];
        let fallbackSourceRoute: undefined | string;
        if (manifest.version === 4) {
          experimentalBypassFor =
            manifest.dynamicRoutes[lazyRoute].experimentalBypassFor;
          prefetchDataRoute =
            manifest.dynamicRoutes[lazyRoute].prefetchDataRoute;
          prefetchDataRouteRegex =
            manifest.dynamicRoutes[lazyRoute].prefetchDataRouteRegex;
          fallbackStatus = manifest.dynamicRoutes[lazyRoute].fallbackStatus;
          fallbackHeaders = manifest.dynamicRoutes[lazyRoute].fallbackHeaders;
          renderingMode =
            manifest.dynamicRoutes[lazyRoute].renderingMode ??
            // By default, when the rendering mode isn't specified, fallback to
            // using the `experimentalPPR` flag.
            (manifest.dynamicRoutes[lazyRoute].experimentalPPR
              ? RenderingMode.PARTIALLY_STATIC
              : RenderingMode.STATIC);
          fallbackRevalidate =
            manifest.dynamicRoutes[lazyRoute].fallbackRevalidate;
          fallbackExpire = manifest.dynamicRoutes[lazyRoute].fallbackExpire;
          fallbackRootParams =
            manifest.dynamicRoutes[lazyRoute].fallbackRootParams;
          allowHeader = manifest.dynamicRoutes[lazyRoute].allowHeader;
          fallbackSourceRoute =
            manifest.dynamicRoutes[lazyRoute].fallbackSourceRoute;
        }

        if (typeof fallback === 'string') {
          ret.fallbackRoutes[lazyRoute] = {
            experimentalBypassFor,
            routeRegex,
            fallback,
            fallbackStatus,
            fallbackHeaders,
            dataRoute,
            dataRouteRegex,
            prefetchDataRoute,
            prefetchDataRouteRegex,
            fallbackRevalidate,
            fallbackExpire,
            fallbackRootParams,
            fallbackSourceRoute,
            renderingMode,
            allowHeader,
          };
        } else if (fallback === null) {
          ret.blockingFallbackRoutes[lazyRoute] = {
            experimentalBypassFor,
            routeRegex,
            dataRoute,
            dataRouteRegex,
            prefetchDataRoute,
            prefetchDataRouteRegex,
            renderingMode,
            allowHeader,
            fallbackRootParams,
            fallback: null,
          };
        } else {
          ret.omittedRoutes[lazyRoute] = {
            experimentalBypassFor,
            routeRegex,
            dataRoute,
            dataRouteRegex,
            prefetchDataRoute,
            prefetchDataRouteRegex,
            renderingMode,
            allowHeader,
          };
        }
      });

      return ret;
    }
    default: {
      return {
        staticRoutes: {},
        blockingFallbackRoutes: {},
        fallbackRoutes: {},
        bypassToken: null,
        omittedRoutes: {},
        notFoundRoutes: [],
        isLocalePrefixed: false,
      };
    }
  }
}

// We only need this once per build
let _usesSrcCache: boolean | undefined;

async function usesSrcDirectory(workPath: string): Promise<boolean> {
  if (!_usesSrcCache) {
    const sourcePages = path.join(workPath, 'src', 'pages');

    try {
      if ((await fs.stat(sourcePages)).isDirectory()) {
        _usesSrcCache = true;
      }
    } catch (_err) {
      _usesSrcCache = false;
    }
  }

  if (!_usesSrcCache) {
    const sourceAppdir = path.join(workPath, 'src', 'app');

    try {
      if ((await fs.stat(sourceAppdir)).isDirectory()) {
        _usesSrcCache = true;
      }
    } catch (_err) {
      _usesSrcCache = false;
    }
  }

  return Boolean(_usesSrcCache);
}

async function getSourceFilePathFromPage({
  workPath,
  page,
  pageExtensions,
}: {
  workPath: string;
  page: string;
  pageExtensions?: ReadonlyArray<string>;
}) {
  const usesSrcDir = await usesSrcDirectory(workPath);
  const extensionsToTry = pageExtensions || ['js', 'jsx', 'ts', 'tsx'];

  for (const pageType of [
    // middleware is not nested in pages/app
    ...(page === 'middleware' ? [''] : ['pages', 'app']),
  ]) {
    let fsPath = path.join(workPath, pageType, page);
    if (usesSrcDir) {
      fsPath = path.join(workPath, 'src', pageType, page);
    }

    if (fs.existsSync(fsPath)) {
      return path.relative(workPath, fsPath);
    }
    const extensionless = fsPath.replace(path.extname(fsPath), '');

    for (const ext of extensionsToTry) {
      fsPath = `${extensionless}.${ext}`;
      // for appDir, we need to treat "index.js" as root-level "page.js"
      if (
        pageType === 'app' &&
        extensionless ===
          path.join(workPath, `${usesSrcDir ? 'src/' : ''}app/index`)
      ) {
        fsPath = `${extensionless.replace(/index$/, 'page')}.${ext}`;
      }
      if (fs.existsSync(fsPath)) {
        return path.relative(workPath, fsPath);
      }
    }

    if (isDirectory(extensionless)) {
      if (pageType === 'pages') {
        for (const ext of extensionsToTry) {
          fsPath = path.join(extensionless, `index.${ext}`);
          if (fs.existsSync(fsPath)) {
            return path.relative(workPath, fsPath);
          }
        }
        // appDir
      } else {
        for (const ext of extensionsToTry) {
          // RSC
          fsPath = path.join(extensionless, `page.${ext}`);
          if (fs.existsSync(fsPath)) {
            return path.relative(workPath, fsPath);
          }
          // Route Handlers
          fsPath = path.join(extensionless, `route.${ext}`);
          if (fs.existsSync(fsPath)) {
            return path.relative(workPath, fsPath);
          }
        }
      }
    }
  }

  // if we got here, and didn't find a source not-found file, then it was the one injected
  // by Next.js. There's no need to warn or return a source file in this case, as it won't have
  // any configuration applied to it.
  if (page === '/_not-found/page') {
    return '';
  }
  // if we got here, and didn't find a source global-error file, then it was the one injected
  // by Next.js for App Router 500 page. There's no need to warn or return a source file in this case, as it won't have
  // any configuration applied to it.
  if (page === '/_global-error/page') {
    return '';
  }

  // Skip warning for internal pages (_app.js, _error.js, _document.js)
  if (!INTERNAL_PAGES.includes(page)) {
    console.log(
      `WARNING: Unable to find source file for page ${page} with extensions: ${extensionsToTry.join(
        ', '
      )}, this can cause functions config from \`vercel.json\` to not be applied`
    );
  }
  return '';
}

function isDirectory(path: string) {
  return fs.existsSync(path) && fs.lstatSync(path).isDirectory();
}

export function normalizeLocalePath(
  pathname: string,
  locales?: string[]
): {
  detectedLocale?: string;
  pathname: string;
} {
  let detectedLocale: string | undefined;
  // first item will be empty string from splitting at first char
  const pathnameParts = pathname.split('/');

  (locales || []).some(locale => {
    if (pathnameParts[1].toLowerCase() === locale.toLowerCase()) {
      detectedLocale = locale;
      pathnameParts.splice(1, 1);
      pathname = pathnameParts.join('/') || '/';
      return true;
    }
    return false;
  });

  return {
    pathname,
    detectedLocale,
  };
}

export function addLocaleOrDefault(
  pathname: string,
  routesManifest?: RoutesManifest,
  locale?: string
) {
  if (!routesManifest?.i18n) return pathname;
  if (!locale) locale = routesManifest.i18n.defaultLocale;

  return locale
    ? `/${locale}${pathname === '/index' ? '' : pathname}`
    : pathname;
}

export type LambdaGroup = {
  pages: string[];
  memory?: number;
  maxDuration?: number;
  supportsCancellation?: boolean;
  isAppRouter?: boolean;
  isAppRouteHandler?: boolean;
  isStreaming?: boolean;
  readonly isPrerenders: boolean;
  readonly isExperimentalPPR: boolean;
  isActionLambda?: boolean;
  isPages?: boolean;
  isApiLambda: boolean;
  pseudoLayer: PseudoLayer;
  pseudoLayerBytes: number;
  pseudoLayerUncompressedBytes: number;
  experimentalTriggers?: NodejsLambda['experimentalTriggers'];
};

export async function getPageLambdaGroups({
  entryPath,
  config,
  functionsConfigManifest,
  pages,
  prerenderRoutes,
  experimentalPPRRoutes,
  pageTraces,
  compressedPages,
  tracedPseudoLayer,
  initialPseudoLayer,
  initialPseudoLayerUncompressed,
  internalPages,
  pageExtensions,
  inversedAppPathManifest,
  experimentalAllowBundling,
  isRouteHandlers,
}: {
  isRouteHandlers?: boolean;
  entryPath: string;
  config: Config;
  functionsConfigManifest?: FunctionsConfigManifestV1;
  pages: ReadonlyArray<string>;
  prerenderRoutes: ReadonlySet<string>;
  experimentalPPRRoutes: ReadonlySet<string> | undefined;
  pageTraces: {
    [page: string]: {
      [key: string]: FileFsRef;
    };
  };
  compressedPages: {
    [page: string]: PseudoFile;
  };
  tracedPseudoLayer: PseudoLayer;
  initialPseudoLayer: PseudoLayerResult;
  initialPseudoLayerUncompressed: number;
  internalPages: ReadonlyArray<string>;
  pageExtensions?: ReadonlyArray<string>;
  inversedAppPathManifest?: Record<string, string>;
  experimentalAllowBundling?: boolean;
  experimentalTriggers?: Lambda['experimentalTriggers'];
}) {
  const groups: Array<LambdaGroup> = [];

  for (const page of pages) {
    const newPages = [...internalPages, page];
    const routeName = normalizePage(page.replace(/\.js$/, ''));
    const isPrerenderRoute = prerenderRoutes.has(routeName);
    const isExperimentalPPR = experimentalPPRRoutes?.has(routeName) ?? false;

    let opts: {
      architecture?: NodejsLambda['architecture'];
      memory?: number;
      maxDuration?: number;
      experimentalTriggers?: NodejsLambda['experimentalTriggers'];
      supportsCancellation?: boolean;
    } = {};

    if (
      functionsConfigManifest &&
      functionsConfigManifest.functions[routeName]
    ) {
      opts = functionsConfigManifest.functions[routeName];
    }

    if (config && config.functions) {
      const sourceFile = await getSourceFilePathFromPage({
        workPath: entryPath,
        page: normalizeSourceFilePageFromManifest(
          routeName,
          page,
          inversedAppPathManifest
        ),
        pageExtensions,
      });

      const vercelConfigOpts = await getLambdaOptionsFromFunction({
        sourceFile,
        config,
      });

      opts = { ...vercelConfigOpts, ...opts };
    }

    const isGeneratedSteps =
      routeName.includes('.well-known/workflow/v1/step') ||
      routeName.includes('api/generated/steps');
    const isGeneratedWorkflows =
      routeName.includes('.well-known/workflow/v1/flow') ||
      routeName.includes('api/generated/workflows');

    if (isGeneratedSteps || isGeneratedWorkflows) {
      const sourceFile = await getSourceFilePathFromPage({
        workPath: entryPath,
        page: normalizeSourceFilePageFromManifest(
          routeName,
          page,
          inversedAppPathManifest
        ),
        pageExtensions,
      });
      const config = JSON.parse(
        await fs
          .readFile(
            path.join(entryPath, path.dirname(sourceFile), '../config.json'),
            'utf8'
          )
          .catch(() => '{}')
      ) as {
        steps?: LambdaOptions;
        workflows?: LambdaOptions;
      };

      if (isGeneratedSteps && config.steps) {
        Object.assign(opts, config.steps);
      } else if (isGeneratedWorkflows && config.workflows) {
        Object.assign(opts, config.workflows);
      }
    }

    let matchingGroup = experimentalAllowBundling
      ? undefined
      : groups.find(group => {
          const matches =
            group.maxDuration === opts.maxDuration &&
            group.memory === opts.memory &&
            group.isPrerenders === isPrerenderRoute &&
            group.isExperimentalPPR === isExperimentalPPR &&
            JSON.stringify(group.experimentalTriggers) ===
              JSON.stringify(opts.experimentalTriggers) &&
            group.supportsCancellation === opts.supportsCancellation;

          if (matches) {
            let newTracedFilesUncompressedSize =
              group.pseudoLayerUncompressedBytes;

            for (const newPage of newPages) {
              Object.keys(pageTraces[newPage] || {}).map(file => {
                if (!group.pseudoLayer[file]) {
                  const item = tracedPseudoLayer[file] as PseudoFile;

                  newTracedFilesUncompressedSize += item.uncompressedSize || 0;
                }
              });
              newTracedFilesUncompressedSize +=
                compressedPages[newPage].uncompressedSize;
            }

            const underUncompressedLimit =
              newTracedFilesUncompressedSize <
              MAX_UNCOMPRESSED_LAMBDA_SIZE - LAMBDA_RESERVED_UNCOMPRESSED_SIZE;

            return underUncompressedLimit;
          }
          return false;
        });

    if (matchingGroup) {
      matchingGroup.pages.push(page);
    } else {
      const newGroup: LambdaGroup = {
        pages: [page],
        ...opts,
        isPrerenders: isPrerenderRoute,
        isExperimentalPPR,
        isApiLambda: !!isApiPage(page) || !!isRouteHandlers,
        pseudoLayerBytes: initialPseudoLayer.pseudoLayerBytes,
        pseudoLayerUncompressedBytes: initialPseudoLayerUncompressed,
        pseudoLayer: Object.assign({}, initialPseudoLayer.pseudoLayer),
        experimentalTriggers: opts.experimentalTriggers,
        supportsCancellation: opts.supportsCancellation,
      };
      groups.push(newGroup);
      matchingGroup = newGroup;
    }

    for (const newPage of newPages) {
      Object.keys(pageTraces[newPage] || {}).map(file => {
        const pseudoItem = tracedPseudoLayer[file] as PseudoFile;

        if (!matchingGroup!.pseudoLayer[file]) {
          matchingGroup!.pseudoLayer[file] = pseudoItem;
          matchingGroup!.pseudoLayerUncompressedBytes +=
            pseudoItem.uncompressedSize || 0;
        }
      });

      // ensure the page file itself is accounted for when grouping as
      // large pages can be created that can push the group over the limit
      matchingGroup!.pseudoLayerUncompressedBytes +=
        compressedPages[newPage].uncompressedSize;
    }
  }

  return groups;
}

// `pages` are normalized without route groups (e.g., /app/(group)/page.js).
// we keep track of that mapping in `inversedAppPathManifest`
// `getSourceFilePathFromPage` needs to use the path from source to properly match the config
function normalizeSourceFilePageFromManifest(
  routeName: string,
  page: string,
  inversedAppPathManifest?: Record<string, string>
) {
  const pageFromManifest = inversedAppPathManifest?.[routeName];
  if (!pageFromManifest) {
    // since this function is used by both `pages` and `app`, the manifest might not be provided
    // so fallback to normal behavior of just checking the `page`.
    return page;
  }

  const metadataConventions = [
    '/favicon.',
    '/icon.',
    '/apple-icon.',
    '/opengraph-image.',
    '/twitter-image.',
    '/sitemap.',
    '/robots.',
  ];

  // these special metadata files for will not contain `/route` or `/page` suffix, so return the routeName as-is.
  const isSpecialFile = metadataConventions.some(convention =>
    routeName.startsWith(convention)
  );

  if (isSpecialFile) {
    return routeName;
  }

  return pageFromManifest;
}

export const outputFunctionFileSizeInfo = (
  pages: string[],
  pseudoLayer: PseudoLayer,
  pseudoLayerUncompressedBytes: number,
  compressedPages: {
    [page: string]: PseudoFile;
  }
) => {
  const exceededLimitOutput: Array<string[]> = [];

  console.log(
    `Serverless Function's page${pages.length === 1 ? '' : 's'}: ${pages.join(
      ', '
    )}`
  );
  exceededLimitOutput.push(['Large Dependencies', 'Uncompressed size']);

  const dependencies: {
    [key: string]: {
      uncompressed: number;
    };
  } = {};

  for (const fileKey of Object.keys(pseudoLayer)) {
    if (!pseudoLayer[fileKey].isSymlink) {
      const fileItem = pseudoLayer[fileKey] as PseudoFile;
      const depKey = fileKey.split('/').slice(0, 3).join('/');

      if (!dependencies[depKey]) {
        dependencies[depKey] = {
          uncompressed: 0,
        };
      }

      dependencies[depKey].uncompressed += fileItem.uncompressedSize;
    }
  }

  for (const page of pages) {
    dependencies[`pages/${page}`] = {
      uncompressed: compressedPages[page].uncompressedSize,
    };
  }
  let numLargeDependencies = 0;

  Object.keys(dependencies)
    .sort((a, b) => {
      // move largest dependencies to the top
      const aDep = dependencies[a];
      const bDep = dependencies[b];

      if (aDep.uncompressed > bDep.uncompressed) {
        return -1;
      }
      if (aDep.uncompressed < bDep.uncompressed) {
        return 1;
      }
      return 0;
    })
    .forEach(depKey => {
      const dep = dependencies[depKey];

      if (dep.uncompressed < 500 * KIB) {
        // ignore smaller dependencies to reduce noise
        return;
      }
      exceededLimitOutput.push([depKey, prettyBytes(dep.uncompressed)]);
      numLargeDependencies += 1;
    });

  if (numLargeDependencies === 0) {
    exceededLimitOutput.push([
      'No large dependencies found (> 500KB compressed)',
    ]);
  }

  exceededLimitOutput.push([]);
  exceededLimitOutput.push([
    'All dependencies',
    prettyBytes(pseudoLayerUncompressedBytes),
  ]);

  console.log(
    textTable(exceededLimitOutput, {
      align: ['l', 'r'],
    })
  );
};

export const detectLambdaLimitExceeding = async (
  lambdaGroups: LambdaGroup[],
  compressedPages: {
    [page: string]: PseudoFile;
  }
) => {
  // show debug info if within 5 MB of exceeding the limit
  const UNCOMPRESSED_SIZE_LIMIT_CLOSE = MAX_UNCOMPRESSED_LAMBDA_SIZE - 5 * MIB;

  let numExceededLimit = 0;
  let numCloseToLimit = 0;
  let loggedHeadInfo = false;

  // pre-iterate to see if we are going to exceed the limit
  // or only get close so our first log line can be correct
  const filteredGroups = lambdaGroups.filter(group => {
    const exceededLimit =
      group.pseudoLayerUncompressedBytes > MAX_UNCOMPRESSED_LAMBDA_SIZE;

    const closeToLimit =
      group.pseudoLayerUncompressedBytes > UNCOMPRESSED_SIZE_LIMIT_CLOSE;

    if (
      closeToLimit ||
      exceededLimit ||
      getPlatformEnv('BUILDER_DEBUG') ||
      process.env.NEXT_DEBUG_FUNCTION_SIZE
    ) {
      if (exceededLimit) {
        numExceededLimit += 1;
      }
      if (closeToLimit) {
        numCloseToLimit += 1;
      }
      return true;
    }
  });

  for (const group of filteredGroups) {
    if (!loggedHeadInfo) {
      if (numExceededLimit || numCloseToLimit) {
        console.log(
          `Warning: Max serverless function size of ${prettyBytes(
            MAX_UNCOMPRESSED_LAMBDA_SIZE
          )} uncompressed${numExceededLimit ? '' : ' almost'} reached`
        );
      } else {
        console.log(`Serverless function size info`);
      }
      loggedHeadInfo = true;
    }

    outputFunctionFileSizeInfo(
      group.pages,
      group.pseudoLayer,
      group.pseudoLayerUncompressedBytes,
      compressedPages
    );
  }

  if (numExceededLimit) {
    console.log(
      `Max serverless function size was exceeded for ${numExceededLimit} function${
        numExceededLimit === 1 ? '' : 's'
      }`
    );
  }
};

// checks if prerender files are all static or not before creating lambdas
export const onPrerenderRouteInitial = (
  prerenderManifest: NextPrerenderedRoutes,
  canUsePreviewMode: boolean,
  entryDirectory: string,
  nonLambdaSsgPages: Set<string>,
  routeKey: string,
  hasPages404: boolean,
  routesManifest?: RoutesManifest,
  appDir?: string | null
) => {
  let static404Page: string | undefined;
  let static500Page: string | undefined;

  // Get the route file as it'd be mounted in the builder output
  const pr = prerenderManifest.staticRoutes[routeKey];
  const { initialRevalidate, srcRoute, dataRoute } = pr;
  const route = srcRoute || routeKey;

  const isAppPathRoute = appDir && (!dataRoute || dataRoute?.endsWith('.rsc'));

  const routeNoLocale = routesManifest?.i18n
    ? normalizeLocalePath(routeKey, routesManifest.i18n.locales).pathname
    : routeKey;

  // if the 404 page used getStaticProps we need to update static404Page
  // since it wasn't populated from the staticPages group
  if (routeNoLocale === '/404') {
    static404Page = path.posix.join(entryDirectory, routeKey);
  }

  if (routeNoLocale === '/500') {
    static500Page = path.posix.join(entryDirectory, routeKey);
  }

  if (
    // App paths must be Prerenders to ensure Vary header is
    // correctly added
    !isAppPathRoute &&
    initialRevalidate === false &&
    (!canUsePreviewMode || (hasPages404 && routeNoLocale === '/404')) &&
    !prerenderManifest.fallbackRoutes[route] &&
    !prerenderManifest.blockingFallbackRoutes[route]
  ) {
    if (
      routesManifest?.i18n &&
      Object.keys(prerenderManifest.staticRoutes).some(route => {
        const staticRoute = prerenderManifest.staticRoutes[route];

        return (
          staticRoute.srcRoute === srcRoute &&
          staticRoute.initialRevalidate !== false
        );
      })
    ) {
      // if any locale static routes are using revalidate the page
      // requires a lambda
      return {
        static404Page,
        static500Page,
      };
    }

    nonLambdaSsgPages.add(route === '/' ? '/index' : route);
  }

  return {
    static404Page,
    static500Page,
  };
};

type OnPrerenderRouteArgs = {
  appDir: string | null;
  pagesDir: string;
  localePrefixed404?: boolean;
  static404Page?: string;
  hasPages404: boolean;
  entryDirectory: string;
  appPathRoutesManifest?: Record<string, string>;
  prerenderManifest: NextPrerenderedRoutes;
  isSharedLambdas: boolean;
  isServerMode: boolean;
  canUsePreviewMode: boolean;
  lambdas: { [key: string]: Lambda };
  experimentalStreamingLambdaPaths:
    | ReadonlyMap<
        string,
        {
          pathname: string;
          output: string;
        }
      >
    | undefined;
  prerenders: { [key: string]: Prerender | File };
  pageLambdaMap: { [key: string]: string };
  routesManifest?: RoutesManifest;
  isCorrectNotFoundRoutes?: boolean;
  isEmptyAllowQueryForPrendered?: boolean;
  isAppPPREnabled: boolean;
  isAppClientSegmentCacheEnabled: boolean;
  isAppClientParamParsingEnabled: boolean;
  appPathnameFilesMap: Map<string, FileFsRef>;
};
let prerenderGroup = 1;

export const onPrerenderRoute =
  (prerenderRouteArgs: OnPrerenderRouteArgs) =>
  async (
    routeKey: string,
    {
      isBlocking,
      isFallback,
      isOmitted,
      locale,
    }: {
      /**
       * A route is a blocking fallback route if its value in the prerender
       * manifest is `null`. This means that unless the page has been
       * prerendered (no dynamic params), we can't serve a fallback page for the
       * route as it depends on the dynamic params values.
       */
      isBlocking?: boolean;

      /**
       * A route is a fallback route if its value in the prerender manifest is
       * a string (meaning there is a fallback value/page). This occurs when
       * the page is rendered with dynamic params but it's rendered in such a
       * way that it's value can be reused for all variants of the dynamic
       * params.
       */
      isFallback?: boolean;

      /**
       * A route is omitted if its value in the prerender manifest is `false`.
       * This can only be set when the `dynamicParams` is set to `false` for
       * the dynamic route.
       */
      isOmitted?: boolean;
      locale?: string;
    }
  ) => {
    const {
      appDir,
      pagesDir,
      static404Page,
      localePrefixed404,
      entryDirectory,
      prerenderManifest,
      isSharedLambdas,
      isServerMode,
      canUsePreviewMode,
      lambdas,
      experimentalStreamingLambdaPaths,
      prerenders,
      pageLambdaMap,
      routesManifest,
      isCorrectNotFoundRoutes,
      isEmptyAllowQueryForPrendered,
      isAppPPREnabled,
      isAppClientSegmentCacheEnabled,
      isAppClientParamParsingEnabled,
      appPathnameFilesMap,
    } = prerenderRouteArgs;

    if (isBlocking && isFallback) {
      throw new NowBuildError({
        code: 'NEXT_ISBLOCKING_ISFALLBACK',
        message: 'invariant: isBlocking and isFallback cannot both be true',
      });
    }

    if (isFallback && isOmitted) {
      throw new NowBuildError({
        code: 'NEXT_ISOMITTED_ISFALLBACK',
        message: 'invariant: isOmitted and isFallback cannot both be true',
      });
    }

    // Get the route file as it'd be mounted in the builder output
    let routeFileNoExt = routeKey === '/' ? '/index' : routeKey;
    let origRouteFileNoExt = routeFileNoExt;
    const { isLocalePrefixed } = prerenderManifest;

    if (!locale && isLocalePrefixed) {
      const localePathResult = normalizeLocalePath(
        routeKey,
        routesManifest?.i18n?.locales || []
      );

      locale = localePathResult.detectedLocale;
      origRouteFileNoExt =
        localePathResult.pathname === '/'
          ? '/index'
          : localePathResult.pathname;
    }

    const nonDynamicSsg =
      !isFallback &&
      !isBlocking &&
      !isOmitted &&
      !prerenderManifest.staticRoutes[routeKey].srcRoute;

    // if there isn't a srcRoute then it's a non-dynamic SSG page
    if ((nonDynamicSsg && !isLocalePrefixed) || isFallback || isOmitted) {
      routeFileNoExt = addLocaleOrDefault(
        // root index files are located without folder/index.html
        routeFileNoExt,
        routesManifest,
        locale
      );
    }

    const isNotFound = prerenderManifest.notFoundRoutes.includes(routeKey);

    let initialRevalidate: false | number;
    let initialExpire: number | undefined;
    let srcRoute: string | null;
    let dataRoute: string | null;
    let prefetchDataRoute: string | null | undefined;
    let initialStatus: number | undefined;
    let initialHeaders: Record<string, string> | undefined;
    let experimentalBypassFor: HasField | undefined;
    let renderingMode: RenderingMode;
    let allowHeader: string[] | undefined;

    if (isFallback || isBlocking) {
      const pr = isFallback
        ? prerenderManifest.fallbackRoutes[routeKey]
        : prerenderManifest.blockingFallbackRoutes[routeKey];
      initialRevalidate = 1; // TODO: should Next.js provide this default?
      // @ts-ignore
      if (initialRevalidate === false) {
        // Lazy routes cannot be "snapshotted" in time.
        throw new NowBuildError({
          code: 'NEXT_ISLAZY_INITIALREVALIDATE',
          message: 'invariant isLazy: initialRevalidate !== false',
        });
      }
      srcRoute = null;
      dataRoute = pr.dataRoute;
      allowHeader = pr.allowHeader;
      experimentalBypassFor = pr.experimentalBypassFor;
      renderingMode = pr.renderingMode;
      prefetchDataRoute = pr.prefetchDataRoute;
    } else if (isOmitted) {
      initialRevalidate = false;
      srcRoute = routeKey;
      dataRoute = prerenderManifest.omittedRoutes[routeKey].dataRoute;
      allowHeader = prerenderManifest.omittedRoutes[routeKey].allowHeader;
      experimentalBypassFor =
        prerenderManifest.omittedRoutes[routeKey].experimentalBypassFor;
      renderingMode = prerenderManifest.omittedRoutes[routeKey].renderingMode;
      prefetchDataRoute =
        prerenderManifest.omittedRoutes[routeKey].prefetchDataRoute;
    } else {
      const pr = prerenderManifest.staticRoutes[routeKey];
      ({
        initialRevalidate,
        initialExpire,
        srcRoute,
        dataRoute,
        initialHeaders,
        initialStatus,
        allowHeader,
        experimentalBypassFor,
        renderingMode,
        prefetchDataRoute,
      } = pr);
    }

    let isAppPathRoute = false;

    // `renderingMode === RenderingMode.PARTIALLY_STATIC` signals app path route
    if (appDir && renderingMode === RenderingMode.PARTIALLY_STATIC) {
      isAppPathRoute = true;

      // When the route has PPR enabled and has a fallback defined, we should
      // read the value from the manifest and use it as the value for the route.
      if (isFallback) {
        const {
          fallbackStatus,
          fallbackHeaders,
          fallbackRevalidate,
          fallbackExpire,
          fallbackSourceRoute,
        } = prerenderManifest.fallbackRoutes[routeKey];

        if (fallbackStatus) {
          initialStatus = fallbackStatus;
        }

        if (fallbackHeaders) {
          initialHeaders = fallbackHeaders;
        }

        if (fallbackSourceRoute) {
          srcRoute = fallbackSourceRoute;
        }

        // If we're rendering with PPR and as this is a fallback, we should use
        // the revalidate and expire times to also apply to the fallback shell.
        if (
          renderingMode === RenderingMode.PARTIALLY_STATIC &&
          typeof fallbackRevalidate !== 'undefined'
        ) {
          initialRevalidate = fallbackRevalidate;
          initialExpire = fallbackExpire;
        }
      }
    }

    // TODO: leverage manifest to determine app paths more accurately
    if (appDir && srcRoute && (!dataRoute || dataRoute?.endsWith('.rsc'))) {
      isAppPathRoute = true;
    }

    const isOmittedOrNotFound = isOmitted || isNotFound;
    let htmlFallbackFsRef: File | null = null;

    // If enabled, try to get the postponed route information from the file
    // system and use it to assemble the prerender.
    let postponedPrerender: string | undefined;
    let postponedState: string | null = null;
    let didPostpone = false;
    if (
      renderingMode === RenderingMode.PARTIALLY_STATIC &&
      appDir &&
      // TODO(NAR-402): Investigate omitted routes
      !isBlocking
    ) {
      postponedState = getHTMLPostponedState({ appDir, routeFileNoExt });

      const htmlPath = path.join(appDir, `${routeFileNoExt}.html`);
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');

        initialHeaders ??= {};

        if (postponedState) {
          initialHeaders['content-type'] =
            `application/x-nextjs-pre-render; state-length=${postponedState.length}; origin="text/html; charset=utf-8"`;

          postponedPrerender = postponedState + html;
          didPostpone = true;
        } else {
          initialHeaders['content-type'] = 'text/html; charset=utf-8';

          postponedPrerender = html;
          didPostpone = false;
        }
      }

      // NOTE: we don't validate the extension suffix of the data routes because
      // some routes (like those that have PPR client segment cache, and client
      // parsing all enabled) may be null because they only contain segment
      // data.
    }

    if (postponedPrerender) {
      const contentType = initialHeaders?.['content-type'];
      if (!contentType) {
        throw new Error("Invariant: contentType can't be undefined");
      }

      // Assemble the prerendered file.
      htmlFallbackFsRef = new FileBlob({
        contentType,
        data: postponedPrerender,
      });
    } else if (
      appDir &&
      !dataRoute &&
      !prefetchDataRoute &&
      isAppPathRoute &&
      !(isBlocking || isFallback)
    ) {
      const contentType = initialHeaders?.['content-type'];

      // If the route has a body file, use it as the fallback, otherwise it may
      // not have an associated fallback. This could be the case for routes that
      // have dynamic segments.
      const fsPath = path.join(appDir, `${routeFileNoExt}.body`);
      if (fs.existsSync(fsPath)) {
        htmlFallbackFsRef = new FileFsRef({
          fsPath,
          contentType: contentType || 'text/html;charset=utf-8',
        });
      }
    } else {
      htmlFallbackFsRef =
        isBlocking || (isNotFound && !static404Page)
          ? // Blocking pages do not have an HTML fallback
            null
          : new FileFsRef({
              fsPath: path.join(
                isAppPathRoute && !isOmittedOrNotFound && appDir
                  ? appDir
                  : pagesDir,
                isFallback
                  ? // Fallback pages have a special file.
                    addLocaleOrDefault(
                      prerenderManifest.fallbackRoutes[routeKey].fallback,
                      routesManifest,
                      locale
                    )
                  : // Otherwise, the route itself should exist as a static HTML
                    // file.
                    `${
                      isOmittedOrNotFound
                        ? localePrefixed404
                          ? addLocaleOrDefault('/404', routesManifest, locale)
                          : '/404'
                        : routeFileNoExt
                    }.html`
              ),
            });
    }

    /**
     * The file that's associated with the data part of the page prerender. This
     * could be a JSON file in Pages Router, or an RSC file in App Router.
     */
    let dataFallbackFsRef: File | null = null;

    // Data does not exist for fallback or blocking pages
    if (
      !isFallback &&
      !isBlocking &&
      (!isNotFound || static404Page) &&
      dataRoute &&
      (!isAppClientParamParsingEnabled || prefetchDataRoute)
    ) {
      const basePath =
        isAppPathRoute && !isOmittedOrNotFound && appDir ? appDir : pagesDir;

      dataFallbackFsRef = new FileFsRef({
        fsPath: path.join(
          basePath,
          `${
            isOmittedOrNotFound
              ? localePrefixed404
                ? addLocaleOrDefault('/404.html', routesManifest, locale)
                : '/404.html'
              : isAppPathRoute
                ? // When experimental PPR is enabled, we expect that the data
                  // that should be served as a part of the prerender should
                  // be from the prefetch data route. If this isn't enabled
                  // for ppr, the only way to get the data is from the data
                  // route.
                  renderingMode === RenderingMode.PARTIALLY_STATIC
                  ? prefetchDataRoute
                  : dataRoute
                : routeFileNoExt + '.json'
          }`
        ),
      });
    }

    if (isOmittedOrNotFound) {
      initialStatus = 404;
    }

    let outputPathPage = path.posix.join(entryDirectory, routeFileNoExt);

    if (!isAppPathRoute) {
      outputPathPage = normalizeIndexOutput(outputPathPage, isServerMode);
    }

    const outputPathPageOrig = path.posix.join(
      entryDirectory,
      origRouteFileNoExt
    );

    let lambda: undefined | Lambda;

    function normalizeDataRoute(route: string) {
      let normalized = path.posix.join(entryDirectory, route);

      if (nonDynamicSsg || isFallback || isOmitted) {
        normalized = normalized.replace(
          new RegExp(`${escapeStringRegexp(origRouteFileNoExt)}.json$`),
          // ensure we escape "$" correctly while replacing as "$" is a special
          // character, we need to do double escaping as first is for the initial
          // replace on the routeFile and then the second on the outputPath
          `${routeFileNoExt.replace(/\$/g, '$$$$')}.json`
        );
      }

      return normalized;
    }

    let outputPathData: null | string = null;
    if (dataRoute) {
      outputPathData = normalizeDataRoute(dataRoute);
    }

    let outputPathPrefetchData: null | string = null;
    if (prefetchDataRoute) {
      if (!isAppPPREnabled) {
        throw new Error(
          "Invariant: prefetchDataRoute can't be set without PPR"
        );
      }

      outputPathPrefetchData = normalizeDataRoute(prefetchDataRoute);
    } else if (
      renderingMode === RenderingMode.PARTIALLY_STATIC &&
      !isAppClientParamParsingEnabled
    ) {
      throw new Error('Invariant: expected to find prefetch data route PPR');
    }

    if (isSharedLambdas) {
      const outputSrcPathPage = normalizeIndexOutput(
        path.join(
          '/',
          srcRoute == null
            ? outputPathPageOrig
            : path.posix.join(
                entryDirectory,
                srcRoute === '/' ? '/index' : srcRoute
              )
        ),
        isServerMode
      );

      const lambdaId = pageLambdaMap[outputSrcPathPage];
      lambda = lambdas[lambdaId];
    } else {
      let outputSrcPathPage =
        srcRoute == null
          ? outputPathPageOrig
          : path.posix.join(
              entryDirectory,
              srcRoute === '/' ? '/index' : srcRoute
            );

      if (!isAppPathRoute) {
        outputSrcPathPage = normalizeIndexOutput(
          outputSrcPathPage,
          isServerMode
        );
      }

      lambda = lambdas[outputSrcPathPage];
    }

    if (!isAppPathRoute && !isNotFound && initialRevalidate === false) {
      if (htmlFallbackFsRef == null || dataFallbackFsRef == null) {
        throw new NowBuildError({
          code: 'NEXT_HTMLFSREF_JSONFSREF',
          message: `invariant: htmlFsRef != null && jsonFsRef != null ${routeFileNoExt}`,
        });
      }

      // if preview mode/On-Demand ISR can't be leveraged
      // we can output pure static outputs instead of prerenders
      if (
        !canUsePreviewMode ||
        (routeKey === '/404' && !lambdas[outputPathPage])
      ) {
        htmlFallbackFsRef.contentType = htmlContentType;
        prerenders[outputPathPage] = htmlFallbackFsRef;

        if (outputPathPrefetchData) {
          prerenders[outputPathPrefetchData] = dataFallbackFsRef;
        }

        // If experimental ppr is not enabled for this route, then add the data
        // route as a target for the prerender as well.
        if (
          outputPathData &&
          renderingMode !== RenderingMode.PARTIALLY_STATIC
        ) {
          prerenders[outputPathData] = dataFallbackFsRef;
        }
      }
    }
    const isNotFoundPreview =
      isCorrectNotFoundRoutes &&
      !initialRevalidate &&
      canUsePreviewMode &&
      isServerMode &&
      isNotFound;

    if (
      prerenders[outputPathPage] == null &&
      (!isNotFound || initialRevalidate || isNotFoundPreview)
    ) {
      if (lambda == null) {
        throw new NowBuildError({
          code: 'NEXT_MISSING_LAMBDA',
          message: `Unable to find lambda for route: ${routeFileNoExt}`,
        });
      }

      // `allowQuery` is an array of query parameter keys that are allowed for
      // a given path. All other query keys will be striped. We can automatically
      // detect this for prerender (ISR) pages by reading the routes manifest file.
      const pageKey = srcRoute || routeKey;
      const route = routesManifest?.dynamicRoutes.find(
        (r): r is RoutesManifestRoute =>
          r.page === pageKey && !('isMiddleware' in r)
      ) as RoutesManifestRoute | undefined;
      const isDynamic = isDynamicRoute(routeKey);
      const routeKeys = route?.routeKeys;

      // by default allowQuery should be undefined and only set when
      // we have sufficient information to set it
      let allowQuery: string[] | undefined;

      if (isEmptyAllowQueryForPrendered) {
        if (!isDynamic) {
          // for non-dynamic routes we use an empty array since
          // no query values bust the cache for non-dynamic prerenders
          // prerendered paths also do not pass allowQuery as they match
          // during handle: 'filesystem' so should not cache differently
          // by query values
          allowQuery = [];
        } else if (routeKeys) {
          // if we have routeKeys in the routes-manifest we use those
          // for allowQuery for dynamic routes
          allowQuery = Object.values(routeKeys);
        }
      } else {
        const isDynamic = isDynamicRoute(pageKey);

        if (routeKeys) {
          // if we have routeKeys in the routes-manifest we use those
          // for allowQuery for dynamic routes
          allowQuery = Object.values(routeKeys);
        } else if (!isDynamic) {
          // for non-dynamic routes we use an empty array since
          // no query values bust the cache for non-dynamic prerenders
          allowQuery = [];
        }
      }

      const rscEnabled = !!routesManifest?.rsc;
      const rscVaryHeader =
        routesManifest?.rsc?.varyHeader ||
        'RSC, Next-Router-State-Tree, Next-Router-Prefetch';
      const rscContentTypeHeader =
        routesManifest?.rsc?.contentTypeHeader || RSC_CONTENT_TYPE;
      const rscDidPostponeHeader = routesManifest?.rsc?.didPostponeHeader;

      let sourcePath: string | undefined;
      if (`/${outputPathPage}` !== srcRoute && srcRoute) {
        sourcePath = srcRoute;
      }

      let chain: Chain | undefined;
      let experimentalStreamingLambdaPath: string | undefined;
      if (
        renderingMode === RenderingMode.PARTIALLY_STATIC &&
        routesManifest?.ppr?.chain?.headers
      ) {
        // When the chain is present in the routes manifest, we use the
        // output path as the target for the chain and assign all the provided
        // headers to the chain.
        chain = {
          outputPath: pathnameToOutputName(entryDirectory, routeKey),
          headers: routesManifest.ppr.chain.headers,
        };
      } else if (
        renderingMode === RenderingMode.PARTIALLY_STATIC &&
        experimentalStreamingLambdaPaths
      ) {
        // Try to get the experimental streaming lambda path for the specific
        // static route first, then try the srcRoute if it doesn't exist. If we
        // can't find it at all, this constitutes an error.
        let paths = experimentalStreamingLambdaPaths.get(
          pathnameToOutputName(entryDirectory, routeKey)
        );
        if (!paths && srcRoute) {
          paths = experimentalStreamingLambdaPaths.get(
            pathnameToOutputName(entryDirectory, srcRoute)
          );
        }
        if (!paths) {
          throw new Error(
            `Invariant: experimentalStreamingLambdaPath is undefined for routeKey=${routeKey} and srcRoute=${
              srcRoute ?? 'null'
            }`
          );
        }

        // The experimentalStreamingLambdaPath must always be the one found from
        // this array, and not the one below attached to the chain. If Vercel is
        // using this for routing, it won't be using the below chain to route,
        // and this should be the pathname that will work for those cases.
        experimentalStreamingLambdaPath = paths.output;

        // When the chain is not present in the routes manifest, we use the
        // experimental streaming lambda path as the target for the chain and
        // assign the pathname as the matched path to the headers. This allows
        // for deployments to upgrade to working when Vercel supports reading
        // the chain parameter.
        chain = {
          outputPath: paths.output,
          headers: { 'x-matched-path': paths.pathname },
        };
      }

      // If this is a fallback page with PPR enabled, we should not have the
      // cache key vary based on the route parameters to ensure that we always
      // have a HIT for the fallback page.
      let htmlAllowQuery = allowQuery;
      if (
        renderingMode === RenderingMode.PARTIALLY_STATIC &&
        // TODO(NAR-402): Investigate omitted routes
        (isFallback || isBlocking)
      ) {
        const { fallbackRootParams, fallback } = isFallback
          ? prerenderManifest.fallbackRoutes[routeKey]
          : prerenderManifest.blockingFallbackRoutes[routeKey];

        if (
          // We only want to vary on the shell contents if there is a fallback
          // present and able to be served.
          fallback &&
          typeof fallback === 'string' &&
          fallbackRootParams &&
          fallbackRootParams.length > 0
        ) {
          htmlAllowQuery = fallbackRootParams;
        } else if (postponedPrerender) {
          htmlAllowQuery = [];
        }
      }

      // If this is a static metadata file that should output FileRef instead of Prerender
      const staticMetadataFile = getSourceFileRefOfStaticMetadata(
        routeKey,
        appPathnameFilesMap
      );
      if (staticMetadataFile) {
        const metadataFsRef = new FileFsRef({
          fsPath: staticMetadataFile.fsPath,
        });
        const contentType = getContentTypeFromFile(staticMetadataFile);
        if (contentType) {
          metadataFsRef.contentType = contentType;
        }
        prerenders[outputPathPage] = metadataFsRef;
      } else {
        prerenders[outputPathPage] = new Prerender({
          expiration: initialRevalidate,
          staleExpiration: initialExpire,
          lambda,
          allowQuery: htmlAllowQuery,
          fallback: htmlFallbackFsRef,
          group: prerenderGroup,
          bypassToken: prerenderManifest.bypassToken,
          experimentalBypassFor,
          initialStatus,
          initialHeaders,
          sourcePath,
          experimentalStreamingLambdaPath,
          chain,
          allowHeader,

          ...(isNotFound
            ? {
                initialStatus: 404,
              }
            : {}),

          ...(rscEnabled
            ? {
                initialHeaders: {
                  ...initialHeaders,
                  vary: rscVaryHeader,
                },
              }
            : {}),
        });
      }

      const normalizePathData = (pathData: string) => {
        if (
          (srcRoute === '/' || srcRoute == '/index') &&
          pathData.endsWith(RSC_PREFETCH_SUFFIX)
        ) {
          delete lambdas[pathData];
          return pathData.replace(/([^/]+\.prefetch\.rsc)$/, '__$1');
        }

        return pathData;
      };

      if (outputPathData || outputPathPrefetchData) {
        // If the allowQuery is different than the original allowQuery, then we
        // shouldn't use the same prerender group as the HTML prerender because
        // they should not be revalidated together (one needs to be revalidated
        // when the allowQuery changes, one does not).
        if (htmlAllowQuery !== allowQuery) {
          prerenderGroup++;
        }

        const prerender = new Prerender({
          expiration: initialRevalidate,
          staleExpiration: initialExpire,
          lambda,
          allowQuery,
          fallback: dataFallbackFsRef,
          group: prerenderGroup,
          bypassToken: prerenderManifest.bypassToken,
          experimentalBypassFor,
          allowHeader,

          ...(isNotFound
            ? {
                initialStatus: 404,
              }
            : {}),

          ...(rscEnabled
            ? {
                initialHeaders: {
                  ...initialHeaders,
                  vary: rscVaryHeader,
                  ...((outputPathData || outputPathPrefetchData)?.endsWith(
                    '.json'
                  )
                    ? {
                        'content-type': 'application/json',
                      }
                    : {}),
                  ...(isAppPathRoute
                    ? {
                        'content-type': rscContentTypeHeader,
                      }
                    : {}),
                  ...(didPostpone && rscDidPostponeHeader && !isFallback
                    ? { [rscDidPostponeHeader]: '1' }
                    : {}),
                },
              }
            : {}),
        });

        if (outputPathPrefetchData) {
          prerenders[normalizePathData(outputPathPrefetchData)] = prerender;
        }

        // If experimental ppr is not enabled for this route, then add the data
        // route as a target for the prerender as well.
        if (
          outputPathData &&
          renderingMode !== RenderingMode.PARTIALLY_STATIC
        ) {
          prerenders[normalizePathData(outputPathData)] = prerender;
        }
        // If this route had a postponed state associated with it, then we
        // should also associate its data route with the postponed state too,
        // ensuring that it will get the postponed state when it's requested.
        else if (
          outputPathData &&
          routesManifest?.rsc?.dynamicRSCPrerender &&
          routesManifest?.ppr?.chain?.headers &&
          postponedState
        ) {
          const contentType = `application/x-nextjs-pre-render; state-length=${postponedState.length}; origin=${JSON.stringify(
            rscContentTypeHeader
          )}`;

          // If the application has client segment cache, client segment
          // parsing, and ppr enabled, then we can use a blank allowQuery
          // for the segment prerenders. This is because we know that the
          // segments do not vary based on the route parameters. It's important
          // that this mirrors the logic in the segment prerender below so that
          // they are both part of the same prerender group and are revalidated
          // together.
          let rdcRSCAllowQuery = allowQuery;
          if (isAppClientParamParsingEnabled) {
            rdcRSCAllowQuery = [];
          }

          prerenders[normalizePathData(outputPathData)] = new Prerender({
            expiration: initialRevalidate,
            staleExpiration: initialExpire,
            lambda,
            allowQuery: rdcRSCAllowQuery,
            fallback:
              // Use the fallback value for the RSC route if the route doesn't
              // vary based on the route parameters.
              rdcRSCAllowQuery && rdcRSCAllowQuery.length === 0
                ? new FileBlob({
                    data: postponedState,
                    contentType,
                  })
                : null,
            group: prerenderGroup,
            bypassToken: prerenderManifest.bypassToken,
            experimentalBypassFor,
            allowHeader,
            chain: {
              outputPath: normalizePathData(outputPathData),
              headers: routesManifest.ppr.chain.headers,
            },
            ...(isNotFound ? { initialStatus: 404 } : {}),
            initialHeaders: {
              ...initialHeaders,
              'content-type': contentType,
              // Dynamic RSC requests cannot be cached, so we explicity set it
              // here to ensure that the response is not cached by the browser.
              'cache-control':
                'private, no-store, no-cache, max-age=0, must-revalidate',
              vary: rscVaryHeader,
            },
          });
        }
      }

      const prefetchSegmentSuffix = routesManifest?.rsc?.prefetchSegmentSuffix;
      const prefetchSegmentDirSuffix =
        routesManifest?.rsc?.prefetchSegmentDirSuffix;

      if (
        isAppClientSegmentCacheEnabled &&
        prefetchSegmentSuffix &&
        prefetchSegmentDirSuffix &&
        rscDidPostponeHeader &&
        appDir
      ) {
        const metaPath = path.join(appDir, `${routeFileNoExt}.meta`);
        if (fs.existsSync(metaPath)) {
          // Important that this is a sync read to avoid races where the
          // prerender group ID would be incremented before the meta file is
          // read.
          const meta: unknown = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (
            typeof meta === 'object' &&
            meta !== null &&
            'segmentPaths' in meta &&
            typeof meta.segmentPaths === 'object' &&
            meta.segmentPaths !== null &&
            Array.isArray(meta.segmentPaths)
          ) {
            const segmentsDir = path.join(
              appDir,
              routeFileNoExt + prefetchSegmentDirSuffix
            );

            // If the application has client segment cache, client segment
            // parsing, and ppr enabled, then we can use a blank allowQuery
            // for the segment prerenders. This is because we know that the
            // segments do not vary based on the route parameters.
            let segmentAllowQuery = allowQuery;
            // TODO(NAR-402): Investigate omitted routes
            if (isAppClientParamParsingEnabled && (isFallback || isBlocking)) {
              segmentAllowQuery = [];
            }

            for (const segmentPath of meta.segmentPaths) {
              const outputSegmentPath =
                path.join(
                  outputPathPage + prefetchSegmentDirSuffix,
                  segmentPath
                ) + prefetchSegmentSuffix;

              let fallback: FileFsRef | null = null;

              // Only use the fallback value when the allowQuery is defined and
              // is empty, which means that the segments do not vary based on
              // the route parameters. This is safer than ensuring that we only
              // use the fallback when this is not a fallback because we know in
              // this new logic that it doesn't vary based on the route
              // parameters and therefore can be used for all requests instead.
              if (segmentAllowQuery && segmentAllowQuery.length === 0) {
                const fsPath = path.join(
                  segmentsDir,
                  segmentPath + prefetchSegmentSuffix
                );

                fallback = new FileFsRef({ fsPath });
              }

              prerenders[outputSegmentPath] = new Prerender({
                expiration: initialRevalidate,
                staleExpiration: initialExpire,
                lambda,
                allowQuery: segmentAllowQuery,
                fallback,

                // Use the same prerender group as the JSON/data prerender.
                group: prerenderGroup,
                allowHeader,

                // These routes are always only static, so they should not
                // permit any bypass unless it's for preview
                bypassToken: prerenderManifest.bypassToken,
                experimentalBypassFor: undefined,

                initialHeaders: {
                  ...initialHeaders,
                  vary: rscVaryHeader,
                  'content-type': rscContentTypeHeader,
                  [rscDidPostponeHeader]: '2',
                },
              });
            }
          }
        }
      }

      // we need to ensure all prerenders have a matching .rsc output
      // otherwise routing could fall through unexpectedly for the
      // fallback: false case as it doesn't have a dynamic route
      // to catch the `.rsc` request for app -> pages routing
      if (outputPathData?.endsWith('.json') && appDir) {
        const dummyOutput = new FileBlob({
          data: '{}',
          contentType: 'application/json',
        });
        const rscKey = `${outputPathPage}.rsc`;
        const prefetchRscKey = `${outputPathPage}${RSC_PREFETCH_SUFFIX}`;

        prerenders[rscKey] = dummyOutput;
        prerenders[prefetchRscKey] = dummyOutput;
      }

      prerenderGroup++;

      if (routesManifest?.i18n && isBlocking) {
        for (const locale of routesManifest.i18n.locales) {
          const localeRouteFileNoExt = addLocaleOrDefault(
            routeFileNoExt,
            routesManifest,
            locale
          );
          let localeOutputPathPage = path.posix.join(
            entryDirectory,
            localeRouteFileNoExt
          );

          if (!isAppPathRoute) {
            localeOutputPathPage = normalizeIndexOutput(
              localeOutputPathPage,
              isServerMode
            );
          }

          const origPrerenderPage = prerenders[outputPathPage];
          prerenders[localeOutputPathPage] = {
            ...origPrerenderPage,
            group: prerenderGroup,
          } as Prerender;

          if (outputPathData) {
            const localeOutputPathData = outputPathData.replace(
              new RegExp(`${escapeStringRegexp(origRouteFileNoExt)}.json$`),
              `${localeRouteFileNoExt}${
                localeRouteFileNoExt !== origRouteFileNoExt &&
                origRouteFileNoExt === '/index'
                  ? '/index'
                  : ''
              }.json`
            );
            const origPrerenderData = prerenders[outputPathData];

            prerenders[localeOutputPathData] = {
              ...origPrerenderData,
              group: prerenderGroup,
            } as Prerender;
          }
          prerenderGroup++;
        }
      }
    }

    if (
      ((nonDynamicSsg && !isLocalePrefixed) || isFallback || isOmitted) &&
      routesManifest?.i18n &&
      !locale
    ) {
      // load each locale
      for (const locale of routesManifest.i18n.locales) {
        if (locale === routesManifest.i18n.defaultLocale) continue;
        onPrerenderRoute(prerenderRouteArgs)(routeKey, {
          isBlocking,
          isFallback,
          isOmitted,
          locale,
        });
      }
    }
  };

export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

export async function getStaticFiles(
  entryPath: string,
  entryDirectory: string,
  outputDirectory: string
) {
  const collectLabel =
    'Collected static files (public/, static/, .next/static)';
  console.time(collectLabel);

  const nextStaticFiles = await glob(
    '**',
    path.join(entryPath, outputDirectory, 'static')
  );
  const staticFolderFiles = await glob('**', path.join(entryPath, 'static'));

  let publicFolderFiles: UnwrapPromise<ReturnType<typeof glob>> = {};
  let publicFolderPath: string | undefined;

  if (await fs.pathExists(path.join(entryPath, 'public'))) {
    publicFolderPath = path.join(entryPath, 'public');
  } else if (
    // check at the same level as the output directory also
    await fs.pathExists(path.join(entryPath, outputDirectory, '../public'))
  ) {
    publicFolderPath = path.join(entryPath, outputDirectory, '../public');
  }

  if (publicFolderPath) {
    debug(`Using public folder at ${publicFolderPath}`);
    publicFolderFiles = await glob('**/*', publicFolderPath);
  } else {
    debug('No public folder found');
  }
  const staticFiles: Record<string, FileFsRef> = {};
  const staticDirectoryFiles: Record<string, FileFsRef> = {};
  const publicDirectoryFiles: Record<string, FileFsRef> = {};

  for (const file of Object.keys(nextStaticFiles)) {
    const outputPath = path.posix.join(entryDirectory, `_next/static/${file}`);
    staticFiles[outputPath] = nextStaticFiles[file];
  }

  for (const file of Object.keys(staticFolderFiles)) {
    const outputPath = path.posix.join(entryDirectory, 'static', file);
    staticDirectoryFiles[outputPath] = staticFolderFiles[file];
  }

  for (const file of Object.keys(publicFolderFiles)) {
    const outputPath = path.posix.join(entryDirectory, file);
    publicDirectoryFiles[outputPath] = publicFolderFiles[file];
  }

  console.timeEnd(collectLabel);
  return {
    staticFiles,
    staticDirectoryFiles,
    publicDirectoryFiles,
  };
}

/**
 * Strips the trailing `/index` from the output name if it's not the root if
 * the server mode is enabled.
 */
export function normalizeIndexOutput(
  outputName: string,
  isServerMode: boolean
) {
  if (outputName !== 'index' && outputName !== '/index' && isServerMode) {
    return outputName.replace(/\/index$/, '');
  }
  return outputName;
}

/**
 * The path to next-server was changed in
 * https://github.com/vercel/next.js/pull/26756
 */
export function getNextServerPath(nextVersion: string) {
  return semver.gte(nextVersion, 'v11.0.2-canary.4')
    ? 'next/dist/server'
    : 'next/dist/next-server/server';
}

function pathnameToOutputName(entryDirectory: string, pathname: string) {
  if (pathname === '/') {
    pathname = '/index';
  }

  return path.posix.join(entryDirectory, pathname);
}

export function getPostponeResumePathname(pathname: string): string {
  if (pathname === '/') pathname = '/index';
  return path.posix.join('_next/postponed/resume', pathname);
}

export function getPostponeResumeOutput(
  entryDirectory: string,
  pathname: string
): string {
  if (pathname === '/') pathname = '/index';
  return path.posix.join(entryDirectory, '_next/postponed/resume', pathname);
}

// update to leverage
export function updateRouteSrc(
  route: Route,
  index: number,
  manifestItems: Array<{ regex: string }>
) {
  if (route.src) {
    route.src = manifestItems[index].regex;
  }
  return route;
}

export async function getPrivateOutputs(
  dir: string,
  entries: Record<string, string>
) {
  const files: Files = {};
  const routes: Route[] = [];

  for (const [existingFile, outputFile] of Object.entries(entries)) {
    const fsPath = path.join(dir, existingFile);

    try {
      const { mode, size } = await stat(fsPath);
      if (size > 30 * 1024 * 1024) {
        throw new Error(`Exceeds maximum file size: ${size}`);
      }
      files[outputFile] = new FileFsRef({ mode, fsPath });
      routes.push({
        src: `/${outputFile}`,
        dest: '/404',
        status: 404,
        continue: true,
      });
    } catch (error) {
      debug(
        `Private file ${existingFile} had an error and will not be uploaded: ${error}`
      );
    }
  }

  return { files, routes };
}

export {
  excludeFiles,
  validateEntrypoint,
  normalizePackageJson,
  getNextConfig,
  getImagesConfig,
  stringMap,
  normalizePage,
  isDynamicRoute,
  getSourceFilePathFromPage,
};

export type FunctionsConfigManifestV1 = {
  version: 1;
  functions: Record<
    string,
    {
      maxDuration?: number | undefined;
      runtime?: 'nodejs';
      matchers?: Array<{
        regexp: string;
        originalSource: string;
        has?: Rewrite['has'];
        missing?: Rewrite['has'];
      }>;
    }
  >;
};

type MiddlewareManifest =
  | MiddlewareManifestV1
  | MiddlewareManifestV2
  | MiddlewareManifestV3;

interface MiddlewareManifestV1 {
  version: 1;
  sortedMiddleware: string[];
  middleware: { [page: string]: EdgeFunctionInfoV1 };
  functions?: { [page: string]: EdgeFunctionInfoV1 };
}

interface MiddlewareManifestV2 {
  version: 2;
  sortedMiddleware: string[];
  middleware: { [page: string]: EdgeFunctionInfoV2 };
  functions?: { [page: string]: EdgeFunctionInfoV2 };
}

interface MiddlewareManifestV3 {
  version: 3;
  sortedMiddleware: string[];
  middleware: { [page: string]: EdgeFunctionInfoV3 };
  functions?: { [page: string]: EdgeFunctionInfoV3 };
}

type Regions = 'home' | 'global' | 'auto' | string[] | 'all' | 'default';

interface BaseEdgeFunctionInfo {
  files: string[];
  name: string;
  page: string;
  wasm?: { filePath: string; name: string }[];
  assets?: { filePath: string; name: string }[];
  regions?: Regions;
}

interface EdgeFunctionInfoV1 extends BaseEdgeFunctionInfo {
  regexp: string;
}

interface EdgeFunctionInfoV2 extends BaseEdgeFunctionInfo {
  matchers: EdgeFunctionMatcher[];
}

interface EdgeFunctionInfoV3 extends BaseEdgeFunctionInfo {
  matchers: EdgeFunctionMatcher[];
  env: Record<string, string>;
}

interface EdgeFunctionMatcher {
  regexp: string;
  has?: HasField;
  missing?: HasField;
  originalSource?: string;
}

const vercelFunctionRegionsVar = process.env.VERCEL_FUNCTION_REGIONS;
let vercelFunctionRegions: string[] | undefined;
if (vercelFunctionRegionsVar) {
  vercelFunctionRegions = vercelFunctionRegionsVar.split(',');
}

/**
 * Normalizes the regions config that comes from the Next.js edge functions manifest.
 * Ensures that config like `home` and `global` are converted to the corresponding Vercel region config.
 * In the future we'll want to make `home` and `global` part of the Build Output API.
 * - `home` refers to the regions set in vercel.json or on the Vercel dashboard project config.
 * - `global` refers to all regions.
 */
function normalizeRegions(regions: Regions): undefined | string | string[] {
  if (typeof regions === 'string') {
    regions = [regions];
  }

  const newRegions: string[] = [];
  for (const region of regions) {
    // Explicitly mentioned as `home` is one of the explicit values for preferredRegion in Next.js.
    if (region === 'home') {
      if (vercelFunctionRegions) {
        // Includes the regions from the VERCEL_FUNCTION_REGIONS env var.
        newRegions.push(...vercelFunctionRegions);
      }
      continue;
    }

    // Explicitly mentioned as `global` is one of the explicit values for preferredRegion in Next.js.
    if (region === 'global') {
      // Uses `all` instead as that's how it's implemented on Vercel.
      // Returns here as when all is provided all regions will be matched.
      return 'all';
    }

    // Explicitly mentioned as `auto` is one of the explicit values for preferredRegion in Next.js.
    if (region === 'auto') {
      // Returns here as when auto is provided all regions will be matched.
      return 'auto';
    }

    newRegions.push(region);
  }

  // Ensure we don't pass an empty array as that is not supported.
  if (newRegions.length === 0) {
    return undefined;
  }

  return newRegions;
}

export function normalizeEdgeFunctionPath(
  shortPath: string,
  appPathRoutesManifest: Record<string, string>
) {
  if (
    shortPath.startsWith('app/') &&
    (shortPath.endsWith('/page') ||
      shortPath.endsWith('/route') ||
      shortPath === 'app/_not-found')
  ) {
    const ogRoute = shortPath.replace(/^app\//, '/');
    shortPath = (
      appPathRoutesManifest[ogRoute] ||
      shortPath.replace(/(^|\/)(page|route)$/, '')
    ).replace(/^\//, '');

    if (!shortPath || shortPath === '/') {
      shortPath = 'index';
    }
  }

  if (shortPath.startsWith('pages/')) {
    shortPath = shortPath.replace(/^pages\//, '');
  }

  return shortPath;
}

export async function getNodeMiddleware({
  config,
  baseDir,
  projectDir,
  entryPath,
  nextVersion,
  nodeVersion,
  lstatSema,
  lstatResults,
  pageExtensions,
  routesManifest,
  outputDirectory,
  prerenderBypassToken,
  isCorrectMiddlewareOrder,
  functionsConfigManifest,
  requiredServerFilesManifest,
}: {
  config: Config;
  baseDir: string;
  projectDir: string;
  lstatSema: Sema;
  lstatResults: { [key: string]: ReturnType<typeof lstat> };
  entryPath: string;
  nodeVersion: string;
  pageExtensions: string[];
  nextVersion: string;
  outputDirectory: string;
  prerenderBypassToken: string;
  isCorrectMiddlewareOrder: boolean;
  routesManifest: RoutesManifest;
  functionsConfigManifest?: FunctionsConfigManifestV1;
  requiredServerFilesManifest: NextRequiredServerFilesManifest;
}): Promise<null | {
  lambdas: Record<string, NodejsLambda>;
  routes: RouteWithSrc[];
}> {
  const middlewareFunctionConfig =
    functionsConfigManifest?.functions['/_middleware'];

  if (!middlewareFunctionConfig || !middlewareFunctionConfig.matchers) {
    return null;
  }
  const routes: RouteWithSrc[] = [];
  const routeMatchers = getRouteMatchers(
    { matchers: middlewareFunctionConfig.matchers },
    routesManifest
  );

  for (const matcher of routeMatchers) {
    const route: Route = {
      continue: true,
      src: matcher.regexp,
      has: matcher.has,
      missing: [
        {
          type: 'header',
          key: 'x-prerender-revalidate',
          value: prerenderBypassToken,
        },
        ...(matcher.missing || []),
      ],
    };

    route.middlewarePath = '/_middleware';
    route.middlewareRawSrc = matcher.originalSource
      ? [matcher.originalSource]
      : [];

    if (isCorrectMiddlewareOrder) {
      route.override = true;
    }
    routes.push(route);
  }

  const sourceFile = await getSourceFilePathFromPage({
    workPath: entryPath,
    page: normalizeSourceFilePageFromManifest('/middleware', 'middleware', {}),
    pageExtensions,
  });

  const vercelConfigOpts = await getLambdaOptionsFromFunction({
    sourceFile,
    config,
  });

  const middlewareFile = path.join(
    entryPath,
    outputDirectory,
    'server',
    'middleware.js'
  );
  const middlewareTrace = `${middlewareFile}.nft.json`;
  const middlewareTraceDir = path.dirname(middlewareTrace);

  const { files } = JSON.parse(await fs.readFile(middlewareTrace, 'utf8'));

  const fileList: string[] = [];
  const normalizedBaseDir = `${baseDir}${
    baseDir.endsWith(path.sep) ? '' : path.sep
  }`;
  files.forEach((file: string) => {
    const absolutePath = path.join(middlewareTraceDir, file);

    // ensure we don't attempt including files outside
    // of the base dir e.g. `/bin/sh`
    if (absolutePath.startsWith(normalizedBaseDir)) {
      fileList.push(path.relative(baseDir, absolutePath));
    } else {
      console.log('outside base dir', absolutePath);
    }
  });
  const reasons = new Map();

  const tracedFiles: {
    [filePath: string]: FileFsRef;
  } = Object.fromEntries(
    (
      await Promise.all(
        fileList.map(
          collectTracedFiles(baseDir, lstatResults, lstatSema, reasons)
        )
      )
    ).filter((entry): entry is [string, FileFsRef] => !!entry)
  );

  const absoluteOutputDirectory = path.posix.join(entryPath, outputDirectory);

  const launcherData = (
    await fs.readFile(path.join(__dirname, 'middleware-launcher.js'), 'utf8')
  )
    .replace(
      /(?:var|const) conf = __NEXT_CONFIG__/,
      `const conf = ${JSON.stringify({
        ...requiredServerFilesManifest.config,
        distDir: path.relative(projectDir, absoluteOutputDirectory),
      })}`
    )
    .replace(
      '__NEXT_MIDDLEWARE_PATH__',
      './' +
        path.posix.join(
          path.posix.relative(projectDir, absoluteOutputDirectory),
          `server/middleware.js`
        )
    );

  const lambda = new NodejsLambda({
    ...vercelConfigOpts,
    runtime: nodeVersion,
    handler: path.join(
      path.relative(baseDir, projectDir),
      '___next_launcher.cjs'
    ),
    useWebApi: true,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    framework: {
      slug: 'nextjs',
      version: nextVersion,
    },
    files: {
      ...tracedFiles,
      [path.relative(baseDir, middlewareFile)]: new FileFsRef({
        fsPath: middlewareFile,
      }),
      [path.join(path.relative(baseDir, projectDir), '___next_launcher.cjs')]:
        new FileBlob({ data: launcherData }),
    },
  });

  return {
    routes,
    lambdas: {
      _middleware: lambda,
    },
  };
}

export async function getMiddlewareBundle({
  entryPath,
  outputDirectory,
  routesManifest,
  isCorrectMiddlewareOrder,
  prerenderBypassToken,
  nextVersion,
  appPathRoutesManifest,
}: {
  config: Config;
  entryPath: string;
  outputDirectory: string;
  prerenderBypassToken: string;
  routesManifest: RoutesManifest;
  isCorrectMiddlewareOrder: boolean;
  nextVersion: string;
  appPathRoutesManifest: Record<string, string>;
}): Promise<{
  staticRoutes: Route[];
  dynamicRouteMap: ReadonlyMap<string, RouteWithSrc>;
  edgeFunctions: Record<string, EdgeFunction>;
}> {
  const middlewareManifest = await getMiddlewareManifest(
    entryPath,
    outputDirectory
  );
  const sortedFunctions = [
    ...(!middlewareManifest
      ? []
      : middlewareManifest.sortedMiddleware.map(key => ({
          key,
          edgeFunction: middlewareManifest?.middleware[key],
          type: 'middleware' as const,
        }))),

    ...Object.entries(middlewareManifest?.functions ?? {}).map(
      ([key, edgeFunction]) => {
        return {
          key,
          edgeFunction,
          type: 'function' as const,
        };
      }
    ),
  ];

  if (middlewareManifest && sortedFunctions.length > 0) {
    const workerConfigs = await Promise.all(
      sortedFunctions.map(async ({ key, edgeFunction, type }) => {
        try {
          const wrappedModuleSource = await getNextjsEdgeFunctionSource(
            edgeFunction.files,
            {
              name: edgeFunction.name,
              staticRoutes: routesManifest.staticRoutes,
              dynamicRoutes: routesManifest.dynamicRoutes.filter(
                r => !('isMiddleware' in r)
              ),
              nextConfig: {
                basePath: routesManifest.basePath,
                i18n: routesManifest.i18n,
              },
            },
            path.resolve(entryPath, outputDirectory),
            edgeFunction.wasm
          );

          return {
            type,
            page: edgeFunction.page,
            name: edgeFunction.name,
            edgeFunction: (() => {
              const { source, map } = wrappedModuleSource.sourceAndMap();
              const transformedMap = stringifySourceMap(
                transformSourceMap(map)
              );

              const wasmFiles = (edgeFunction.wasm ?? []).reduce(
                (acc: Files, { filePath, name }) => {
                  const fullFilePath = path.join(
                    entryPath,
                    outputDirectory,
                    filePath
                  );
                  acc[`wasm/${name}.wasm`] = new FileFsRef({
                    mode: 0o644,
                    contentType: 'application/wasm',
                    fsPath: fullFilePath,
                  });
                  return acc;
                },
                {}
              );

              const assetFiles = (edgeFunction.assets ?? []).reduce(
                (acc: Files, { filePath, name }) => {
                  const fullFilePath = path.join(
                    entryPath,
                    outputDirectory,
                    filePath
                  );
                  acc[`assets/${name}`] = new FileFsRef({
                    mode: 0o644,
                    contentType: 'application/octet-stream',
                    fsPath: fullFilePath,
                  });
                  return acc;
                },
                {}
              );

              return new EdgeFunction({
                deploymentTarget: 'v8-worker',
                name: edgeFunction.name,
                files: {
                  'index.js': new FileBlob({
                    data: source,
                    contentType: 'application/javascript',
                    mode: 0o644,
                  }),
                  ...(transformedMap && {
                    'index.js.map': new FileBlob({
                      data: transformedMap,
                      contentType: 'application/json',
                      mode: 0o644,
                    }),
                  }),
                  ...wasmFiles,
                  ...assetFiles,
                },
                regions: edgeFunction.regions
                  ? normalizeRegions(edgeFunction.regions)
                  : undefined,
                entrypoint: 'index.js',
                assets: (edgeFunction.assets ?? []).map(({ name }) => {
                  return {
                    name,
                    path: `assets/${name}`,
                  };
                }),
                framework: {
                  slug: 'nextjs',
                  version: nextVersion,
                },
                environment: edgeFunction.env,
              });
            })(),
            routeMatchers: getRouteMatchers(edgeFunction, routesManifest),
          };
        } catch (e: any) {
          e.message = `Can't build edge function ${key}: ${e.message}`;
          throw e;
        }
      })
    );

    const source: {
      staticRoutes: Route[];
      dynamicRouteMap: Map<string, RouteWithSrc>;
      edgeFunctions: Record<string, EdgeFunction>;
    } = {
      staticRoutes: [],
      dynamicRouteMap: new Map(),
      edgeFunctions: {},
    };

    for (const worker of workerConfigs.values()) {
      let shortPath = worker.name;

      // Replacing the folder prefix for the page
      //
      // For `pages/`, use file base name directly:
      //    pages/index -> index
      // For `app/`, use folder name, handle the root page as index:
      //    app/route/page -> route
      //    app/page -> index
      //    app/index/page -> index/index
      if (shortPath.startsWith('pages/')) {
        shortPath = shortPath.replace(/^pages\//, '');
      } else {
        shortPath = normalizeEdgeFunctionPath(shortPath, appPathRoutesManifest);
      }

      if (routesManifest?.basePath) {
        const isAppPathRoute = !!appPathRoutesManifest[shortPath];

        shortPath = path.posix.join(
          './',
          routesManifest?.basePath,
          shortPath.replace(/^\//, '')
        );

        if (!isAppPathRoute) {
          shortPath = normalizeIndexOutput(shortPath, true);
        }
      }

      worker.edgeFunction.name = shortPath;
      source.edgeFunctions[shortPath] = worker.edgeFunction;

      // we don't add the route for edge functions as these
      // are already added in the routes-manifest under dynamicRoutes
      if (worker.type === 'function') {
        continue;
      }

      for (const matcher of worker.routeMatchers) {
        const route: Route = {
          continue: true,
          src: matcher.regexp,
          has: matcher.has,
          missing: [
            {
              type: 'header',
              key: 'x-prerender-revalidate',
              value: prerenderBypassToken,
            },
            ...(matcher.missing || []),
          ],
        };

        route.middlewarePath = shortPath;
        route.middlewareRawSrc = matcher.originalSource
          ? [matcher.originalSource]
          : [];
        if (isCorrectMiddlewareOrder) {
          route.override = true;
        }

        if (routesManifest.version > 3 && isDynamicRoute(worker.page)) {
          source.dynamicRouteMap.set(worker.page, route);
        } else {
          source.staticRoutes.push(route);
        }
      }
    }
    return source;
  }

  return {
    staticRoutes: [],
    dynamicRouteMap: new Map(),
    edgeFunctions: {},
  };
}

/**
 * Attempts to read the functions config manifest from the pre-defined
 * location. If the manifest can't be found it will resolve to
 * undefined.
 */
export async function getFunctionsConfigManifest(
  entryPath: string,
  outputDirectory: string
): Promise<FunctionsConfigManifestV1 | undefined> {
  const functionConfigManifestPath = path.join(
    entryPath,
    outputDirectory,
    './server/functions-config-manifest.json'
  );

  const hasManifest = await fs
    .access(functionConfigManifestPath)
    .then(() => true)
    .catch(() => false);

  if (!hasManifest) {
    return;
  }

  const manifest: FunctionsConfigManifestV1 = await fs.readJSON(
    functionConfigManifestPath
  );

  return manifest.version === 1 ? manifest : undefined;
}

/**
 * Attempts to read the middleware manifest from the pre-defined
 * location. If the manifest can't be found it will resolve to
 * undefined.
 */
export async function getMiddlewareManifest(
  entryPath: string,
  outputDirectory: string
): Promise<MiddlewareManifestV3 | undefined> {
  const middlewareManifestPath = path.join(
    entryPath,
    outputDirectory,
    './server/middleware-manifest.json'
  );

  const hasManifest = await fs
    .access(middlewareManifestPath)
    .then(() => true)
    .catch(() => false);

  if (!hasManifest) {
    return;
  }

  const manifest = (await fs.readJSON(
    middlewareManifestPath
  )) as MiddlewareManifest;

  if (manifest.version === 1) {
    return upgradeMiddlewareManifestV1(manifest);
  }

  if (manifest.version === 2) {
    return upgradeMiddlewareManifestV2(manifest);
  }

  return manifest;
}

export function upgradeMiddlewareManifestV1(
  v1: MiddlewareManifestV1
): MiddlewareManifestV3 {
  function updateInfo(v1Info: EdgeFunctionInfoV1): EdgeFunctionInfoV3 {
    const { regexp, ...rest } = v1Info;
    return {
      ...rest,
      matchers: [{ regexp }],
      env: {},
    };
  }

  const middleware = Object.fromEntries(
    Object.entries(v1.middleware).map(([p, info]) => [p, updateInfo(info)])
  );
  const functions = v1.functions
    ? Object.fromEntries(
        Object.entries(v1.functions).map(([p, info]) => [p, updateInfo(info)])
      )
    : undefined;

  return {
    ...v1,
    version: 3,
    middleware,
    functions,
  };
}

export function upgradeMiddlewareManifestV2(
  v2: MiddlewareManifestV2
): MiddlewareManifestV3 {
  function updateInfo(v2Info: EdgeFunctionInfoV2): EdgeFunctionInfoV3 {
    const { ...rest } = v2Info;
    return {
      ...rest,
      env: {},
    };
  }

  const middleware = Object.fromEntries(
    Object.entries(v2.middleware).map(([p, info]) => [p, updateInfo(info)])
  );
  const functions = v2.functions
    ? Object.fromEntries(
        Object.entries(v2.functions).map(([p, info]) => [p, updateInfo(info)])
      )
    : undefined;

  return {
    ...v2,
    version: 3,
    middleware,
    functions,
  };
}

/**
 * For an object containing middleware info and a routes manifest this will
 * generate a string with the route that will activate the middleware on
 * Vercel Proxy.
 *
 * @param param0 The middleware info including matchers and page.
 * @param param1 The routes manifest
 * @returns matchers for the middleware route.
 */
function getRouteMatchers(
  info: { matchers: EdgeFunctionInfoV2['matchers']; page?: string },
  { basePath = '', i18n }: RoutesManifest
): EdgeFunctionMatcher[] {
  function getRegexp(regexp: string) {
    if (info.page === '/') {
      return regexp;
    }

    const locale = i18n?.locales.length
      ? `(?:/(${i18n.locales
          .map(locale => escapeStringRegexp(locale))
          .join('|')}))?`
      : '';

    return `(?:^${basePath}${locale}${regexp.substring(1)})`;
  }

  function normalizeHas(has: HasField): HasField {
    return has.map(v =>
      v.type === 'header'
        ? {
            ...v,
            key: v.key.toLowerCase(),
          }
        : v
    );
  }

  return info.matchers.map(matcher => {
    const m: EdgeFunctionMatcher = {
      regexp: getRegexp(matcher.regexp),
      originalSource: matcher.originalSource,
    };
    if (matcher.has) {
      m.has = normalizeHas(matcher.has);
    }
    if (matcher.missing) {
      m.missing = normalizeHas(matcher.missing);
    }
    return m;
  });
}

/**
 * Makes the sources more human-readable in the source map
 * by removing webpack-specific prefixes
 */
function transformSourceMap(
  sourcemap: RawSourceMap | null
): RawSourceMap | undefined {
  if (!sourcemap) return;
  const sources = sourcemap.sources
    ?.map(source => {
      return source.replace(/^webpack:\/\/?_N_E\/(?:\.\/)?/, '');
    })
    // Hide the Next.js entrypoint
    .map(source => {
      return source.startsWith('?') ? '[native code]' : source;
    });

  return { ...sourcemap, sources };
}

interface LambdaGroupTypeInterface {
  isApiLambda: boolean;
  isPrerenders?: boolean;
}

export function getOperationType({
  group,
  prerenderManifest,
  pageFileName,
}: {
  group?: LambdaGroupTypeInterface;
  prerenderManifest?: NextPrerenderedRoutes;
  pageFileName?: string;
}) {
  if (group?.isApiLambda || isApiPage(pageFileName)) {
    return 'API';
  }

  if (group?.isPrerenders) {
    return 'ISR';
  }

  if (pageFileName && prerenderManifest) {
    const { blockingFallbackRoutes = {}, fallbackRoutes = {} } =
      prerenderManifest;
    if (
      pageFileName in blockingFallbackRoutes ||
      pageFileName in fallbackRoutes
    ) {
      return 'ISR';
    }
  }

  return 'Page'; // aka SSR
}

export function isApiPage(page: string | undefined) {
  if (!page) {
    return false;
  }

  return page
    .replace(/\\/g, '/')
    .match(/(serverless|server)\/pages\/api(\/|\.js$)/);
}

export type VariantsManifest = {
  definitions: FlagDefinitions;
};

export async function getVariantsManifest(
  entryPath: string,
  outputDirectory: string
): Promise<null | VariantsManifest> {
  const pathVariantsManifest = path.join(
    entryPath,
    outputDirectory,
    'variants-manifest.json'
  );

  const hasVariantsManifest = await fs
    .access(pathVariantsManifest)
    .then(() => true)
    .catch(() => false);

  if (!hasVariantsManifest) return null;

  const variantsManifest: VariantsManifest =
    await fs.readJSON(pathVariantsManifest);

  return variantsManifest;
}

export async function getServerlessPages(params: {
  pagesDir: string;
  entryPath: string;
  outputDirectory: string;
  appPathRoutesManifest?: Record<string, string>;
}) {
  const appDir = path.join(params.pagesDir, '../app');
  const [pages, appPaths, middlewareManifest] = await Promise.all([
    glob('**/!(_middleware).js', params.pagesDir),
    params.appPathRoutesManifest
      ? Promise.all([
          glob('**/page.js', appDir),
          glob('**/route.js', appDir),
          glob('**/_not-found.js', appDir),
        ]).then(items => Object.assign(...items))
      : Promise.resolve({} as Record<string, FileFsRef>),
    getMiddlewareManifest(params.entryPath, params.outputDirectory),
  ]);

  const normalizedAppPaths: typeof appPaths = {};

  if (params.appPathRoutesManifest) {
    for (const [entry, normalizedEntry] of Object.entries(
      params.appPathRoutesManifest
    )) {
      const normalizedPath = `${path.join(
        '.',
        normalizedEntry === '/' ? '/index' : normalizedEntry
      )}.js`;
      const globPath = `${path.posix.join('.', entry)}.js`;

      if (appPaths[globPath]) {
        normalizedAppPaths[normalizedPath] = appPaths[globPath];
      }
    }
  }

  // Edge Functions do not consider as Serverless Functions
  for (const edgeFunctionFile of Object.keys(
    middlewareManifest?.functions ?? {}
  )) {
    let edgePath =
      middlewareManifest?.functions?.[edgeFunctionFile].name ||
      edgeFunctionFile;

    edgePath = normalizeEdgeFunctionPath(
      edgePath,
      params.appPathRoutesManifest || {}
    );
    edgePath = (edgePath || 'index') + '.js';
    delete normalizedAppPaths[edgePath];
    delete pages[edgePath];
  }

  return { pages, appPaths: normalizedAppPaths };
}

// to avoid any conflict with route matching/resolving, we prefix all prefetches (ie, __index.prefetch.rsc)
// this is to ensure that prefetches are never matched for things like a greedy match on `index.{ext}`
export function normalizePrefetches(prefetches: Record<string, FileFsRef>) {
  const updatedPrefetches: Record<string, FileFsRef> = {};

  for (const key in prefetches) {
    if (key === 'index.prefetch.rsc') {
      const newKey = key.replace(/([^/]+\.prefetch\.rsc)$/, '__$1');
      updatedPrefetches[newKey] = prefetches[key];
    } else {
      updatedPrefetches[key] = prefetches[key];
    }
  }

  return updatedPrefetches;
}

/**
 * Get the postponed state for a route.
 *
 * @param appDir - The app directory.
 * @param routeFileNoExt - The route file name without the extension.
 * @returns The postponed state for the route.
 */
function getHTMLPostponedState({
  appDir,
  routeFileNoExt,
}: {
  appDir: string;
  routeFileNoExt: string;
}) {
  const metaPath = path.join(appDir, `${routeFileNoExt}.meta`);
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const meta: unknown = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  if (
    typeof meta !== 'object' ||
    meta === null ||
    !('postponed' in meta) ||
    typeof meta.postponed !== 'string'
  ) {
    return null;
  }

  return meta.postponed;
}

export async function getServerActionMetaRoutes(
  distDir: string
): Promise<Route[]> {
  const manifestPath = path.join(
    distDir,
    'server',
    'server-reference-manifest.json'
  );

  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf8');

    type ActionItem = {
      filename?: string;
      exportedName?: string;
    };
    const manifest = JSON.parse(manifestContent) as {
      node?: Record<string, ActionItem>;
      edge?: Record<string, ActionItem>;
    };

    const routes: Route[] = [];

    // Process both node and edge entries
    for (const runtimeType of ['node', 'edge'] as const) {
      const runtime = manifest[runtimeType];
      if (!runtime) continue;

      for (const [id, entry] of Object.entries(runtime)) {
        // Skip entries without filename or exportedName
        if (!entry.filename || !entry.exportedName) continue;

        let exportedName = entry.exportedName;

        if (exportedName === '$$RSC_SERVER_ACTION_0') {
          exportedName = 'anonymous_fn';
        }

        const route: Route = {
          src: '/(.*)',
          has: [
            {
              type: 'header',
              key: 'next-action',
              value: id,
            },
          ],
          transforms: [
            {
              type: 'request.headers',
              op: 'append',
              target: {
                key: 'x-server-action-name',
              },
              args: `${entry.filename}#${exportedName}`,
            },
          ],
        };

        routes.push(route);
      }
    }

    return routes;
  } catch (error) {
    // If manifest doesn't exist or can't be read, return empty routes
    return [];
  }
}
