import path from 'path';
import semver from 'semver';
import { Sema } from 'async-sema';
import {
  Config,
  FileBlob,
  FileFsRef,
  Lambda,
  NodeVersion,
  NowBuildError,
  Prerender,
  debug,
  glob,
  Files,
  BuildResultV2Typical as BuildResult,
  NodejsLambda,
} from '@vercel/build-utils';
import { Route, RouteWithHandle } from '@vercel/routing-utils';
import { MAX_AGE_ONE_YEAR } from '.';
import {
  NextRequiredServerFilesManifest,
  NextImagesManifest,
  NextPrerenderedRoutes,
  RoutesManifest,
  collectTracedFiles,
  createPseudoLayer,
  createLambdaFromPseudoLayers,
  getPageLambdaGroups,
  getDynamicRoutes,
  localizeDynamicRoutes,
  isDynamicRoute,
  normalizePage,
  getStaticFiles,
  onPrerenderRouteInitial,
  onPrerenderRoute,
  normalizeLocalePath,
  PseudoFile,
  detectLambdaLimitExceeding,
  outputFunctionFileSizeInfo,
  normalizeIndexOutput,
  getImagesConfig,
  getNextServerPath,
  getMiddlewareBundle,
  getFilesMapFromReasons,
  UnwrapPromise,
  getOperationType,
  FunctionsConfigManifestV1,
  VariantsManifest,
  RSC_CONTENT_TYPE,
  RSC_PREFETCH_SUFFIX,
  normalizePrefetches,
  CreateLambdaFromPseudoLayersOptions,
  getPostponeResumePathname,
  LambdaGroup,
  MAX_UNCOMPRESSED_LAMBDA_SIZE,
} from './utils';
import {
  nodeFileTrace,
  NodeFileTraceReasons,
  NodeFileTraceResult,
} from '@vercel/nft';
import resolveFrom from 'resolve-from';
import fs, { lstat } from 'fs-extra';
import escapeStringRegexp from 'escape-string-regexp';
import prettyBytes from 'pretty-bytes';

// related PR: https://github.com/vercel/next.js/pull/30046
const CORRECT_NOT_FOUND_ROUTES_VERSION = 'v12.0.1';
const CORRECT_MIDDLEWARE_ORDER_VERSION = 'v12.1.7-canary.29';
const NEXT_DATA_MIDDLEWARE_RESOLVING_VERSION = 'v12.1.7-canary.33';
const EMPTY_ALLOW_QUERY_FOR_PRERENDERED_VERSION = 'v12.2.0';
const ACTION_OUTPUT_SUPPORT_VERSION = 'v14.2.2';
const CORRECTED_MANIFESTS_VERSION = 'v12.2.0';

// Ideally this should be in a Next.js manifest so we can change it in
// the future but this also allows us to improve existing versions
const PRELOAD_CHUNKS = {
  APP_ROUTER_PAGES: [
    '.next/server/webpack-runtime.js',
    'next/dist/client/components/action-async-storage.external.js',
    'next/dist/client/components/request-async-storage.external.js',
    'next/dist/client/components/static-generation-async-storage.external.js',
    'next/dist/compiled/next-server/app-page.runtime.prod.js',
  ],
  APP_ROUTER_HANDLER: [
    '.next/server/webpack-runtime.js',
    'next/dist/compiled/next-server/app-route.runtime.prod.js',
  ],
  PAGES_ROUTER_PAGES: [
    '.next/server/webpack-runtime.js',
    'next/dist/compiled/next-server/pages.runtime.prod.js',
  ],
  PAGES_ROUTER_API: [
    '.next/server/webpack-api-runtime.js',
    'next/dist/compiled/next-server/pages-api.runtime.prod.js',
  ],
};

// related PR: https://github.com/vercel/next.js/pull/52997
// and https://github.com/vercel/next.js/pull/56318
const BUNDLED_SERVER_NEXT_VERSION = 'v13.5.4';

const BUNDLED_SERVER_NEXT_PATH =
  'next/dist/compiled/next-server/server.runtime.prod.js';

export async function serverBuild({
  dynamicPages,
  pagesDir,
  config = {},
  functionsConfigManifest,
  privateOutputs,
  baseDir,
  workPath,
  entryPath,
  nodeVersion,
  buildId,
  escapedBuildId,
  dynamicPrefix,
  entryDirectory,
  outputDirectory,
  redirects,
  beforeFilesRewrites,
  afterFilesRewrites,
  fallbackRewrites,
  headers,
  dataRoutes,
  hasIsr404Page,
  hasIsr500Page,
  imagesManifest,
  wildcardConfig,
  routesManifest,
  staticPages,
  lambdaPages,
  localePrefixed404,
  nextVersion,
  lambdaAppPaths,
  canUsePreviewMode,
  trailingSlash,
  prerenderManifest,
  appPathRoutesManifest,
  omittedPrerenderRoutes,
  trailingSlashRedirects,
  isCorrectLocaleAPIRoutes,
  requiredServerFilesManifest,
  variantsManifest,
  experimentalPPRRoutes,
}: {
  appPathRoutesManifest?: Record<string, string>;
  dynamicPages: string[];
  trailingSlash: boolean;
  config: Config;
  functionsConfigManifest?: FunctionsConfigManifestV1;
  pagesDir: string;
  baseDir: string;
  canUsePreviewMode: boolean;
  omittedPrerenderRoutes: ReadonlySet<string>;
  localePrefixed404: boolean;
  staticPages: { [key: string]: FileFsRef };
  lambdaAppPaths: { [key: string]: FileFsRef };
  lambdaPages: { [key: string]: FileFsRef };
  privateOutputs: { files: Files; routes: Route[] };
  entryPath: string;
  dynamicPrefix: string;
  buildId: string;
  escapedBuildId: string;
  wildcardConfig: BuildResult['wildcard'];
  nodeVersion: NodeVersion;
  entryDirectory: string;
  outputDirectory: string;
  headers: Route[];
  workPath: string;
  beforeFilesRewrites: Route[];
  afterFilesRewrites: Route[];
  fallbackRewrites: Route[];
  redirects: Route[];
  dataRoutes: Route[];
  nextVersion: string;
  hasIsr404Page: boolean;
  hasIsr500Page: boolean;
  trailingSlashRedirects: Route[];
  routesManifest: RoutesManifest;
  isCorrectLocaleAPIRoutes: boolean;
  imagesManifest?: NextImagesManifest;
  prerenderManifest: NextPrerenderedRoutes;
  requiredServerFilesManifest: NextRequiredServerFilesManifest;
  variantsManifest: VariantsManifest | null;
  experimentalPPRRoutes: ReadonlySet<string>;
}): Promise<BuildResult> {
  lambdaPages = Object.assign({}, lambdaPages, lambdaAppPaths);

  const experimentalAllowBundling = Boolean(
    process.env.NEXT_EXPERIMENTAL_FUNCTION_BUNDLING
  );

  const lambdas: { [key: string]: Lambda } = {};
  const prerenders: { [key: string]: Prerender } = {};
  const lambdaPageKeys = Object.keys(lambdaPages);
  const internalPages = ['_app.js', '_error.js', '_document.js'];
  const pageBuildTraces = await glob('**/*.js.nft.json', pagesDir);
  const isEmptyAllowQueryForPrendered = semver.gte(
    nextVersion,
    EMPTY_ALLOW_QUERY_FOR_PRERENDERED_VERSION
  );
  const hasActionOutputSupport = semver.gte(
    nextVersion,
    ACTION_OUTPUT_SUPPORT_VERSION
  );
  const projectDir = requiredServerFilesManifest.relativeAppDir
    ? path.join(baseDir, requiredServerFilesManifest.relativeAppDir)
    : requiredServerFilesManifest.appDir || entryPath;

  // allow looking up original route from normalized route
  const inversedAppPathManifest: Record<string, string> = {};

  if (appPathRoutesManifest) {
    for (const ogRoute of Object.keys(appPathRoutesManifest)) {
      inversedAppPathManifest[appPathRoutesManifest[ogRoute]] = ogRoute;
    }
  }

  const experimental = {
    ppr: requiredServerFilesManifest.config.experimental?.ppr === true,
  };

  let appRscPrefetches: UnwrapPromise<ReturnType<typeof glob>> = {};
  let appBuildTraces: UnwrapPromise<ReturnType<typeof glob>> = {};
  let appDir: string | null = null;

  if (appPathRoutesManifest) {
    appDir = path.join(pagesDir, '../app');
    appBuildTraces = await glob('**/*.js.nft.json', appDir);

    // TODO: maybe?
    appRscPrefetches = experimental.ppr
      ? {}
      : await glob(`**/*${RSC_PREFETCH_SUFFIX}`, appDir);

    const rscContentTypeHeader =
      routesManifest?.rsc?.contentTypeHeader || RSC_CONTENT_TYPE;

    appRscPrefetches = normalizePrefetches(appRscPrefetches);

    // ensure all appRscPrefetches have a contentType since this is used by Next.js
    // to determine if it's a valid response
    for (const value of Object.values(appRscPrefetches)) {
      if (!value.contentType) {
        value.contentType = rscContentTypeHeader;
      }
    }

    for (const rewrite of afterFilesRewrites) {
      if (rewrite.src && rewrite.dest) {
        rewrite.src = rewrite.src.replace(
          /\/?\(\?:\/\)\?/,
          '(?<rscsuff>(\\.prefetch)?\\.rsc)?(?:/)?'
        );
        let destQueryIndex = rewrite.dest.indexOf('?');

        if (destQueryIndex === -1) {
          destQueryIndex = rewrite.dest.length;
        }

        rewrite.dest =
          rewrite.dest.substring(0, destQueryIndex) +
          '$rscsuff' +
          rewrite.dest.substring(destQueryIndex);
      }
    }
  }

  const isCorrectNotFoundRoutes = semver.gte(
    nextVersion,
    CORRECT_NOT_FOUND_ROUTES_VERSION
  );
  const isCorrectMiddlewareOrder = semver.gte(
    nextVersion,
    CORRECT_MIDDLEWARE_ORDER_VERSION
  );
  // experimental bundling prevents filtering manifests
  // as we don't know what to filter by at this stage
  const isCorrectManifests =
    !experimentalAllowBundling &&
    semver.gte(nextVersion, CORRECTED_MANIFESTS_VERSION);

  let hasStatic500 = !!staticPages[path.posix.join(entryDirectory, '500')];

  if (lambdaPageKeys.length === 0) {
    throw new NowBuildError({
      code: 'NEXT_NO_SERVER_PAGES',
      message: 'No server pages were built',
      link: 'https://err.sh/vercel/vercel/now-next-no-serverless-pages-built',
    });
  }

  const pageMatchesApi = (page: string) => {
    const normalizedPage = `/${page.replace(/\.js$/, '')}`;
    return (
      !inversedAppPathManifest[normalizedPage] &&
      (page.startsWith('api/') || page === 'api.js')
    );
  };

  const { i18n } = routesManifest;
  const hasPages404 = routesManifest.pages404;

  let static404Page =
    staticPages[path.posix.join(entryDirectory, '404')] && hasPages404
      ? path.posix.join(entryDirectory, '404')
      : staticPages[path.posix.join(entryDirectory, '_errors/404')]
      ? path.posix.join(entryDirectory, '_errors/404')
      : undefined;

  if (
    !static404Page &&
    i18n &&
    staticPages[path.posix.join(entryDirectory, i18n.defaultLocale, '404')]
  ) {
    static404Page = path.posix.join(entryDirectory, i18n.defaultLocale, '404');
  }

  if (!hasStatic500 && i18n) {
    hasStatic500 =
      !!staticPages[path.posix.join(entryDirectory, i18n.defaultLocale, '500')];
  }

  const lstatSema = new Sema(25);
  const lstatResults: { [key: string]: ReturnType<typeof lstat> } = {};
  const nonLambdaSsgPages = new Set<string>();

  Object.keys(prerenderManifest.staticRoutes).forEach(route => {
    const result = onPrerenderRouteInitial(
      prerenderManifest,
      canUsePreviewMode,
      entryDirectory,
      nonLambdaSsgPages,
      route,
      routesManifest.pages404,
      routesManifest,
      appDir
    );

    if (result && result.static404Page) {
      static404Page = result.static404Page;
    }

    if (result && result.static500Page) {
      hasStatic500 = true;
    }
  });
  const hasLambdas =
    !static404Page ||
    lambdaPageKeys.some(
      page =>
        !internalPages.includes(page) &&
        !nonLambdaSsgPages.has('/' + page.replace(/\.js$/, ''))
    );

  if (lambdaPages['404.js']) {
    internalPages.push('404.js');
  }

  const prerenderRoutes: ReadonlySet<string> = new Set<string>([
    ...(canUsePreviewMode ? omittedPrerenderRoutes : []),
    ...Object.keys(prerenderManifest.blockingFallbackRoutes),
    ...Object.keys(prerenderManifest.fallbackRoutes),
    ...Object.keys(prerenderManifest.staticRoutes).map(route => {
      const staticRoute = prerenderManifest.staticRoutes[route];
      return staticRoute.srcRoute || route;
    }),
  ]);

  const experimentalStreamingLambdaPaths = new Map<string, string>();

  if (hasLambdas) {
    const initialTracingLabel = 'Traced Next.js server files in';

    console.time(initialTracingLabel);

    const initialTracedFiles: {
      [filePath: string]: FileFsRef;
    } = {};

    let initialFileList: string[];
    let initialFileReasons: NodeFileTraceReasons;
    let nextServerBuildTrace;
    let instrumentationHookBuildTrace;

    const useBundledServer =
      semver.gte(nextVersion, BUNDLED_SERVER_NEXT_VERSION) &&
      process.env.VERCEL_NEXT_BUNDLED_SERVER === '1';

    if (useBundledServer) {
      debug('Using bundled Next.js server');
    }

    const nextServerFile = resolveFrom(
      projectDir,
      useBundledServer
        ? BUNDLED_SERVER_NEXT_PATH
        : `${getNextServerPath(nextVersion)}/next-server.js`
    );

    try {
      // leverage next-server trace from build if available
      nextServerBuildTrace = JSON.parse(
        await fs.readFile(
          path.join(
            entryPath,
            outputDirectory,
            useBundledServer
              ? 'next-minimal-server.js.nft.json'
              : 'next-server.js.nft.json'
          ),
          'utf8'
        )
      );
    } catch (_) {
      // if the trace is unavailable we trace inside the runtime
    }

    try {
      instrumentationHookBuildTrace = JSON.parse(
        await fs.readFile(
          path.join(
            entryPath,
            outputDirectory,
            'server',
            'instrumentation.js.nft.json'
          ),
          'utf8'
        )
      );
    } catch (_) {
      // if the trace is unavailable it means `instrumentation.js` wasn't used
    }

    if (nextServerBuildTrace) {
      initialFileList = nextServerBuildTrace.files.map((file: string) => {
        return path.relative(
          baseDir,
          path.join(entryPath, outputDirectory, file)
        );
      });
      initialFileReasons = new Map();
      debug('Using next-server.js.nft.json trace from build');
    } else {
      debug('tracing initial Next.js server files');
      const result = await nodeFileTrace([nextServerFile], {
        base: baseDir,
        cache: {},
        processCwd: entryPath,
        ignore: [
          ...requiredServerFilesManifest.ignore.map(file =>
            path.join(entryPath, file)
          ),
          'node_modules/next/dist/pages/**/*',
          `node_modules/${getNextServerPath(
            nextVersion
          )}/lib/squoosh/**/*.wasm`,
          'node_modules/next/dist/compiled/webpack/(bundle4|bundle5).js',
          'node_modules/react/**/*.development.js',
          'node_modules/react-dom/**/*.development.js',
          'node_modules/use-subscription/**/*.development.js',
          'node_modules/sharp/**/*',
        ],
      });
      initialFileList = Array.from(result.fileList);
      initialFileReasons = result.reasons;
    }

    if (instrumentationHookBuildTrace) {
      initialFileList = initialFileList.concat(
        instrumentationHookBuildTrace.files.map((file: string) => {
          return path.relative(
            baseDir,
            path.join(entryPath, outputDirectory, 'server', file)
          );
        })
      );
      debug('Using instrumentation.js.nft.json trace from build');
    }

    debug('collecting initial Next.js server files');
    await Promise.all(
      initialFileList.map(
        collectTracedFiles(
          baseDir,
          lstatResults,
          lstatSema,
          initialFileReasons,
          initialTracedFiles
        )
      )
    );

    debug('creating initial pseudo layer');
    const initialPseudoLayer = await createPseudoLayer(initialTracedFiles);
    console.timeEnd(initialTracingLabel);

    const lambdaCreationLabel = 'Created all serverless functions in';
    console.time(lambdaCreationLabel);

    const apiPages: string[] = [];
    const nonApiPages: string[] = [];
    const appRouterPages: string[] = [];
    const appRouteHandlers: string[] = [];

    lambdaPageKeys.forEach(page => {
      if (
        internalPages.includes(page) &&
        page !== '404.js' &&
        !(page === '_error.js' && !(static404Page || lambdaPages['404.js']))
      ) {
        return;
      }
      const pathname = page.replace(/\.js$/, '');

      if (nonLambdaSsgPages.has(pathname)) {
        return;
      }
      const normalizedPathname = normalizePage(pathname);

      if (isDynamicRoute(normalizedPathname)) {
        dynamicPages.push(normalizedPathname);
      }

      if (lambdaAppPaths[page]) {
        if (lambdaAppPaths[page].fsPath.endsWith('route.js')) {
          appRouteHandlers.push(page);
        } else {
          appRouterPages.push(page);
        }
      } else if (pageMatchesApi(page)) {
        apiPages.push(page);
      } else {
        nonApiPages.push(page);
      }
    });

    const requiredFiles: { [key: string]: FileFsRef } = {};

    requiredFiles[path.relative(baseDir, nextServerFile)] = new FileFsRef({
      mode: (await fs.lstat(nextServerFile)).mode,
      fsPath: nextServerFile,
    });

    if (static404Page) {
      // ensure static 404 page file is included in all lambdas
      // for notFound GS(S)P support

      if (i18n) {
        for (const locale of i18n.locales) {
          let static404File =
            staticPages[path.posix.join(entryDirectory, locale, '/404')];

          if (!static404File) {
            static404File = new FileFsRef({
              fsPath: path.join(pagesDir, locale, '/404.html'),
            });
            if (!fs.existsSync(static404File.fsPath)) {
              static404File = new FileFsRef({
                fsPath: path.join(pagesDir, '/404.html'),
              });
            }
          }
          requiredFiles[path.relative(baseDir, static404File.fsPath)] =
            static404File;
        }
      } else {
        const static404File =
          staticPages[static404Page] ||
          new FileFsRef({
            fsPath: path.join(pagesDir, '/404.html'),
          });
        requiredFiles[path.relative(baseDir, static404File.fsPath)] =
          static404File;
      }
    }

    // TODO: move this into Next.js' required server files manifest
    const envFiles = [];

    for (const file of await fs.readdir(workPath)) {
      const isEnv = file === '.env' || file.startsWith('.env.');

      if (isEnv) {
        const statResult = await fs.lstat(path.join(workPath, file));

        if (statResult.isFile()) {
          envFiles.push(file);
        }
      }
    }

    for (const envFile of envFiles) {
      requiredFiles[path.join(path.relative(baseDir, entryPath), envFile)] =
        new FileFsRef({
          fsPath: path.join(workPath, envFile),
        });
    }

    await Promise.all(
      requiredServerFilesManifest.files.map(async file => {
        await lstatSema.acquire();
        let fsPath = path.join(
          entryPath,
          // remove last part of outputDirectory `.next` since this is already
          // included in the file path
          path.join(outputDirectory, '..'),
          file
        );

        if (projectDir) {
          fsPath = path.join(projectDir, file);
        }

        const relativePath = path.relative(baseDir, fsPath);
        const { mode } = await fs.lstat(fsPath);
        lstatSema.release();

        requiredFiles[relativePath] = new FileFsRef({
          mode,
          fsPath,
        });
      })
    );

    // add required files and internal pages to initial pseudo layer
    // so that we account for these in the size of each page group
    const requiredFilesLayer = await createPseudoLayer(requiredFiles);
    Object.assign(
      initialPseudoLayer.pseudoLayer,
      requiredFilesLayer.pseudoLayer
    );
    initialPseudoLayer.pseudoLayerBytes += requiredFilesLayer.pseudoLayerBytes;

    const uncompressedInitialSize = Object.keys(
      initialPseudoLayer.pseudoLayer
    ).reduce((prev, cur) => {
      const file = initialPseudoLayer.pseudoLayer[cur] as PseudoFile;
      return prev + file.uncompressedSize || 0;
    }, 0);

    debug(
      JSON.stringify(
        {
          uncompressedInitialSize,
          compressedInitialSize: initialPseudoLayer.pseudoLayerBytes,
        },
        null,
        2
      )
    );

    if (uncompressedInitialSize > MAX_UNCOMPRESSED_LAMBDA_SIZE) {
      console.log(
        `Warning: Max serverless function size of ${prettyBytes(
          MAX_UNCOMPRESSED_LAMBDA_SIZE
        )} uncompressed reached`
      );

      outputFunctionFileSizeInfo(
        [],
        initialPseudoLayer.pseudoLayer,
        uncompressedInitialSize,
        {}
      );

      throw new NowBuildError({
        message: `Required files read using Node.js fs library and node_modules exceed max lambda size of ${MAX_UNCOMPRESSED_LAMBDA_SIZE} bytes`,
        code: 'NEXT_REQUIRED_FILES_LIMIT',
        link: 'https://vercel.com/docs/platform/limits#serverless-function-size',
      });
    }

    const launcherData = await fs.readFile(
      path.join(__dirname, 'server-launcher.js'),
      'utf8'
    );
    let launcher = launcherData
      .replace(
        'const conf = __NEXT_CONFIG__',
        `const conf = ${JSON.stringify({
          ...requiredServerFilesManifest.config,
          distDir: path.relative(
            projectDir,
            path.join(entryPath, outputDirectory)
          ),
          compress: false,
        })}`
      )
      .replace(
        '__NEXT_SERVER_PATH__',
        useBundledServer
          ? BUNDLED_SERVER_NEXT_PATH
          : `${getNextServerPath(nextVersion)}/next-server.js`
      );

    const appLauncher = launcher.replace(
      '// @preserve pre-next-server-target',
      `process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = "${
        requiredServerFilesManifest.config?.experimental?.serverActions
          ? 'experimental'
          : 'next'
      }"`
    );

    if (
      entryDirectory !== '.' &&
      path.posix.join('/', entryDirectory) !== routesManifest.basePath
    ) {
      // we normalize the entryDirectory in the request URL since
      // Next.js isn't aware of it and it isn't included in the
      // x-matched-path header
      launcher = launcher.replace(
        '// @preserve entryDirectory handler',
        `req.url = req.url.replace(/^${path.posix
          .join('/', entryDirectory)
          .replace(/\//g, '\\/')}/, '')`
      );
    }

    const pageTraces: {
      [page: string]: { [key: string]: FileFsRef };
    } = {};
    const compressedPages: {
      [page: string]: PseudoFile;
    } = {};
    const mergedPageKeys = [
      ...nonApiPages,
      ...appRouterPages,
      ...appRouteHandlers,
      ...apiPages,
      ...internalPages,
    ];
    const traceCache = {};

    const getOriginalPagePath = (page: string) => {
      let originalPagePath = page;

      if (appDir && lambdaAppPaths[page]) {
        const { fsPath } = lambdaAppPaths[page];
        originalPagePath = path.relative(appDir, fsPath);
      }
      return originalPagePath;
    };

    const getBuildTraceFile = (page: string) => {
      return (
        pageBuildTraces[page + '.nft.json'] ||
        appBuildTraces[page + '.nft.json']
      );
    };

    const pathsToTrace: string[] = mergedPageKeys
      .map(page => {
        if (!getBuildTraceFile(page)) {
          return lambdaPages[page].fsPath;
        }
      })
      .filter(Boolean) as string[];

    let traceResult: NodeFileTraceResult | undefined;
    let parentFilesMap: ReadonlyMap<string, Set<string>> | undefined;

    if (pathsToTrace.length > 0) {
      traceResult = await nodeFileTrace(pathsToTrace, {
        base: baseDir,
        cache: traceCache,
        processCwd: projectDir,
      });
      traceResult.esmFileList.forEach(file => traceResult?.fileList.add(file));
      parentFilesMap = getFilesMapFromReasons(
        traceResult.fileList,
        traceResult.reasons
      );
    }

    for (const page of mergedPageKeys) {
      const tracedFiles: { [key: string]: FileFsRef } = {};
      const originalPagePath = getOriginalPagePath(page);
      const pageBuildTrace = getBuildTraceFile(originalPagePath);
      let fileList: string[];
      let reasons: NodeFileTraceReasons;

      if (pageBuildTrace) {
        const { files } = JSON.parse(
          await fs.readFile(pageBuildTrace.fsPath, 'utf8')
        );

        // TODO: this will be moved to a separate worker in the future
        // although currently this is needed in the lambda
        const isAppPath = appDir && lambdaAppPaths[page];
        const serverComponentFile = isAppPath
          ? pageBuildTrace.fsPath.replace(
              /\.js\.nft\.json$/,
              '.__sc_client__.js'
            )
          : null;

        if (serverComponentFile && (await fs.pathExists(serverComponentFile))) {
          files.push(
            path.relative(
              path.dirname(pageBuildTrace.fsPath),
              serverComponentFile
            )
          );

          try {
            const scTrace = JSON.parse(
              await fs.readFile(`${serverComponentFile}.nft.json`, 'utf8')
            );
            scTrace.files.forEach((file: string) => files.push(file));
          } catch (err) {
            /* non-fatal for now */
          }
        }

        fileList = [];
        const curPagesDir = isAppPath && appDir ? appDir : pagesDir;
        const pageDir = path.dirname(path.join(curPagesDir, originalPagePath));
        const normalizedBaseDir = `${baseDir}${
          baseDir.endsWith(path.sep) ? '' : path.sep
        }`;
        files.forEach((file: string) => {
          const absolutePath = path.join(pageDir, file);

          // ensure we don't attempt including files outside
          // of the base dir e.g. `/bin/sh`
          if (absolutePath.startsWith(normalizedBaseDir)) {
            fileList.push(path.relative(baseDir, absolutePath));
          }
        });
        reasons = new Map();
      } else {
        fileList = Array.from(
          parentFilesMap?.get(
            path.relative(baseDir, lambdaPages[page].fsPath)
          ) || []
        );

        if (!fileList) {
          throw new Error(
            `Invariant: Failed to trace ${page}, missing fileList`
          );
        }
        reasons = traceResult?.reasons || new Map();
      }

      await Promise.all(
        fileList.map(
          collectTracedFiles(
            baseDir,
            lstatResults,
            lstatSema,
            reasons,
            tracedFiles
          )
        )
      );
      pageTraces[page] = tracedFiles;
      compressedPages[page] = (
        await createPseudoLayer({
          [page]: lambdaPages[page],
        })
      ).pseudoLayer[page] as PseudoFile;
    }

    const tracedPseudoLayer = await createPseudoLayer(
      mergedPageKeys.reduce((prev, page) => {
        Object.assign(prev, pageTraces[page]);
        return prev;
      }, {})
    );

    const pageExtensions = requiredServerFilesManifest.config?.pageExtensions;

    const pageLambdaGroups = await getPageLambdaGroups({
      experimentalAllowBundling,
      entryPath: projectDir,
      config,
      functionsConfigManifest,
      pages: nonApiPages,
      prerenderRoutes,
      pageTraces,
      compressedPages,
      experimentalPPRRoutes: undefined,
      tracedPseudoLayer: tracedPseudoLayer.pseudoLayer,
      initialPseudoLayer,
      initialPseudoLayerUncompressed: uncompressedInitialSize,
      internalPages,
      pageExtensions,
    });

    for (const group of pageLambdaGroups) {
      group.isPages = true;
    }

    const appRouterLambdaGroups = await getPageLambdaGroups({
      experimentalAllowBundling,
      entryPath: projectDir,
      config,
      functionsConfigManifest,
      pages: appRouterPages,
      prerenderRoutes,
      pageTraces,
      compressedPages,
      experimentalPPRRoutes,
      tracedPseudoLayer: tracedPseudoLayer.pseudoLayer,
      initialPseudoLayer,
      initialPseudoLayerUncompressed: uncompressedInitialSize,
      internalPages,
      pageExtensions,
      inversedAppPathManifest,
    });

    const appRouteHandlersLambdaGroups = await getPageLambdaGroups({
      experimentalAllowBundling,
      entryPath: projectDir,
      config,
      functionsConfigManifest,
      pages: appRouteHandlers,
      prerenderRoutes,
      pageTraces,
      compressedPages,
      experimentalPPRRoutes: undefined,
      tracedPseudoLayer: tracedPseudoLayer.pseudoLayer,
      initialPseudoLayer,
      initialPseudoLayerUncompressed: uncompressedInitialSize,
      internalPages,
      pageExtensions,
      inversedAppPathManifest,
    });

    const appRouterStreamingPrerenderLambdaGroups: LambdaGroup[] = [];

    for (const group of appRouterLambdaGroups) {
      if (!group.isPrerenders || group.isExperimentalPPR) {
        group.isStreaming = true;
      }
      group.isAppRouter = true;

      // We create a streaming variant of the Prerender lambda group
      // to support actions that are part of a Prerender
      if (
        hasActionOutputSupport &&
        group.isPrerenders &&
        !group.isStreaming &&
        !group.isExperimentalPPR
      ) {
        appRouterStreamingPrerenderLambdaGroups.push({
          ...group,
          isActionPrerender: true,
          isStreaming: true,
        });
      }
    }

    for (const group of appRouteHandlersLambdaGroups) {
      if (!group.isPrerenders) {
        group.isStreaming = true;
      }
      group.isAppRouter = true;
      group.isAppRouteHandler = true;
    }

    const apiLambdaGroups = await getPageLambdaGroups({
      entryPath: projectDir,
      config,
      functionsConfigManifest,
      pages: apiPages,
      prerenderRoutes,
      pageTraces,
      compressedPages,
      experimentalPPRRoutes: undefined,
      tracedPseudoLayer: tracedPseudoLayer.pseudoLayer,
      initialPseudoLayer,
      initialPseudoLayerUncompressed: uncompressedInitialSize,
      internalPages,
      pageExtensions,
    });

    for (const group of apiLambdaGroups) {
      group.isApiLambda = true;
    }

    debug(
      JSON.stringify(
        {
          apiLambdaGroups: apiLambdaGroups.map(group => ({
            pages: group.pages,
            isPrerender: group.isPrerenders,
            pseudoLayerBytes: group.pseudoLayerBytes,
            uncompressedLayerBytes: group.pseudoLayerUncompressedBytes,
          })),
          pageLambdaGroups: pageLambdaGroups.map(group => ({
            pages: group.pages,
            isPrerender: group.isPrerenders,
            pseudoLayerBytes: group.pseudoLayerBytes,
            uncompressedLayerBytes: group.pseudoLayerUncompressedBytes,
          })),
          appRouterLambdaGroups: appRouterLambdaGroups.map(group => ({
            pages: group.pages,
            isPrerender: group.isPrerenders,
            pseudoLayerBytes: group.pseudoLayerBytes,
            uncompressedLayerBytes: group.pseudoLayerUncompressedBytes,
          })),
          appRouterStreamingPrerenderLambdaGroups:
            appRouterStreamingPrerenderLambdaGroups.map(group => ({
              pages: group.pages,
              isPrerender: group.isPrerenders,
              pseudoLayerBytes: group.pseudoLayerBytes,
              uncompressedLayerBytes: group.pseudoLayerUncompressedBytes,
            })),
          appRouteHandlersLambdaGroups: appRouteHandlersLambdaGroups.map(
            group => ({
              pages: group.pages,
              isPrerender: group.isPrerenders,
              pseudoLayerBytes: group.pseudoLayerBytes,
              uncompressedLayerBytes: group.pseudoLayerUncompressedBytes,
            })
          ),
          nextServerLayerSize: initialPseudoLayer.pseudoLayerBytes,
        },
        null,
        2
      )
    );
    const combinedGroups = [
      ...pageLambdaGroups,
      ...appRouterLambdaGroups,
      ...appRouterStreamingPrerenderLambdaGroups,
      ...apiLambdaGroups,
      ...appRouteHandlersLambdaGroups,
    ];

    await detectLambdaLimitExceeding(combinedGroups, compressedPages);

    const appNotFoundTraces = pageTraces['_not-found.js'];
    const appNotFoundPsuedoLayer =
      appNotFoundTraces && (await createPseudoLayer(appNotFoundTraces));

    for (const group of combinedGroups) {
      const groupPageFiles: { [key: string]: PseudoFile } = {};

      for (const page of [
        ...group.pages,
        ...internalPages,
        ...(group.isAppRouter && appNotFoundTraces ? ['_not-found.js'] : []),
      ]) {
        const pageFileName = path.normalize(
          path.relative(baseDir, lambdaPages[page].fsPath)
        );
        groupPageFiles[pageFileName] = compressedPages[page];
      }

      const updatedManifestFiles: { [name: string]: FileBlob } = {};

      if (isCorrectManifests) {
        // filter dynamic routes to only the included dynamic routes
        // in this specific serverless function so that we don't
        // accidentally match a dynamic route while resolving that
        // is not actually in this specific serverless function
        for (const manifest of [
          'routes-manifest.json',
          'server/pages-manifest.json',
        ] as const) {
          const fsPath = path.join(entryPath, outputDirectory, manifest);

          const relativePath = path.relative(baseDir, fsPath);
          delete group.pseudoLayer[relativePath];

          const manifestData = await fs.readJSON(fsPath);
          const normalizedPages = new Set(
            group.pages.map(page => {
              page = `/${page.replace(/\.js$/, '')}`;
              if (page === '/index') page = '/';
              return page;
            })
          );

          switch (manifest) {
            case 'routes-manifest.json': {
              const filterItem = (item: { page: string }) =>
                normalizedPages.has(item.page);

              manifestData.dynamicRoutes =
                manifestData.dynamicRoutes?.filter(filterItem);
              manifestData.staticRoutes =
                manifestData.staticRoutes?.filter(filterItem);
              break;
            }
            case 'server/pages-manifest.json': {
              for (const key of Object.keys(manifestData)) {
                if (isDynamicRoute(key) && !normalizedPages.has(key)) {
                  delete manifestData[key];
                }
              }
              break;
            }
            default: {
              throw new NowBuildError({
                message: `Unexpected manifest value ${manifest}, please contact support if this continues`,
                code: 'NEXT_MANIFEST_INVARIANT',
              });
            }
          }

          updatedManifestFiles[relativePath] = new FileBlob({
            contentType: 'application/json',
            data: JSON.stringify(manifestData),
          });
        }
      }

      let launcherData = group.isAppRouter ? appLauncher : launcher;
      let preloadChunks: string[] = [];

      if (process.env.VERCEL_NEXT_PRELOAD_COMMON === '1') {
        const nextPackageDir = path.dirname(
          resolveFrom(projectDir, 'next/package.json')
        );

        if (group.isPages) {
          preloadChunks = PRELOAD_CHUNKS.PAGES_ROUTER_PAGES;
        } else if (group.isApiLambda) {
          preloadChunks = PRELOAD_CHUNKS.PAGES_ROUTER_API;
        } else if (group.isAppRouter && !group.isAppRouteHandler) {
          preloadChunks = PRELOAD_CHUNKS.APP_ROUTER_PAGES;
        } else if (group.isAppRouteHandler) {
          preloadChunks = PRELOAD_CHUNKS.APP_ROUTER_HANDLER;
        }
        const normalizedPreloadChunks: string[] = [];

        for (const preloadChunk of preloadChunks) {
          const absoluteChunk = preloadChunk.startsWith('.next')
            ? path.join(projectDir, preloadChunk)
            : path.join(nextPackageDir, '..', preloadChunk);

          // ensure the chunks are actually in this layer
          if (
            group.pseudoLayer[
              path.join('.', path.relative(baseDir, absoluteChunk))
            ]
          ) {
            normalizedPreloadChunks.push(
              // relative files need to be prefixed with ./ for require
              preloadChunk.startsWith('.next')
                ? `./${preloadChunk}`
                : preloadChunk
            );
          }
        }

        if (normalizedPreloadChunks.length > 0) {
          launcherData = launcherData.replace(
            '// @preserve next-server-preload-target',
            normalizedPreloadChunks
              .map(name => `require('${name}');`)
              .join('\n')
          );
        }
      }

      const launcherFiles: { [name: string]: FileFsRef | FileBlob } = {
        [path.join(path.relative(baseDir, projectDir), '___next_launcher.cjs')]:
          new FileBlob({ data: launcherData }),
      };
      const operationType = getOperationType({ group, prerenderManifest });

      const options: CreateLambdaFromPseudoLayersOptions = {
        files: {
          ...launcherFiles,
          ...updatedManifestFiles,
        },
        layers: [group.pseudoLayer, groupPageFiles],
        handler: path.join(
          path.relative(baseDir, projectDir),
          '___next_launcher.cjs'
        ),
        operationType,
        memory: group.memory,
        runtime: nodeVersion.runtime,
        maxDuration: group.maxDuration,
        isStreaming: group.isStreaming,
        nextVersion,
        experimentalAllowBundling,
      };

      // the app _not-found output should always be included
      // if it was created otherwise notFound() handling could fail
      if (group.isAppRouter && appNotFoundPsuedoLayer) {
        options.layers.push(appNotFoundPsuedoLayer.pseudoLayer);
      }

      const lambda = await createLambdaFromPseudoLayers(options);

      // This is a PPR lambda if it's an App Page with the PPR experimental flag
      // enabled.
      const isPPR =
        experimental.ppr && group.isAppRouter && !group.isAppRouteHandler;

      // If PPR is enabled and this is an App Page, create the non-streaming
      // lambda for the page for revalidation.
      let revalidate: NodejsLambda | undefined;
      if (isPPR) {
        if (!options.isStreaming) {
          throw new Error("Invariant: PPR lambda isn't streaming");
        }

        // Create the non-streaming version of the same Lambda, this will be
        // used for revalidation.
        revalidate = await createLambdaFromPseudoLayers({
          ...options,
          isStreaming: false,
        });
      }

      for (const pageFilename of group.pages) {
        // This is the name of the page, where the root is `index`.
        const pageName = pageFilename.replace(/\.js$/, '');

        // This is the name of the page prefixed with a `/`, where the root is
        // `/index`.
        const pagePath = path.posix.join('/', pageName);

        // This is the routable pathname for the page, where the root is `/`.
        const pagePathname = pagePath === '/index' ? '/' : pagePath;

        let isPrerender = prerenderRoutes.has(pagePathname);

        if (!isPrerender && routesManifest?.i18n) {
          isPrerender = routesManifest.i18n.locales.some(locale => {
            return prerenderRoutes.has(
              path.join('/', locale, pageName === 'index' ? '' : pageName)
            );
          });
        }

        let outputName = path.posix.join(entryDirectory, pageName);

        if (group.isActionPrerender) {
          // give the streaming prerenders a .action suffix
          outputName = `${outputName}.action`;
        }

        // If this is a PPR page, then we should prefix the output name.
        if (isPPR) {
          if (!revalidate) {
            throw new Error("Invariant: PPR lambda isn't set");
          }

          // Assign the revalidate lambda to the output name. That's used to
          // perform the initial static shell render.
          lambdas[outputName] = revalidate;

          // If this isn't an omitted page, then we should add the link from the
          // page to the postpone resume lambda.
          if (!omittedPrerenderRoutes.has(pagePathname)) {
            const key = getPostponeResumePathname(entryDirectory, pageName);
            lambdas[key] = lambda;

            // We want to add the `experimentalStreamingLambdaPath` to this
            // output.
            experimentalStreamingLambdaPaths.set(outputName, key);
          }

          // For each static route that was generated, we should generate a
          // specific partial prerendering resume route. This is because any
          // static route that is matched will not hit the rewrite rules.
          for (const [
            routePathname,
            { srcRoute, experimentalPPR },
          ] of Object.entries(prerenderManifest.staticRoutes)) {
            // If the srcRoute doesn't match or this doesn't support
            // experimental partial prerendering, then we can skip this route.
            if (srcRoute !== pagePathname || !experimentalPPR) continue;

            // If this route is the same as the page route, then we can skip
            // it, because we've already added the lambda to the output.
            if (routePathname === pagePathname) continue;

            const key = getPostponeResumePathname(
              entryDirectory,
              routePathname
            );
            lambdas[key] = lambda;

            outputName = path.posix.join(entryDirectory, routePathname);
            experimentalStreamingLambdaPaths.set(outputName, key);
          }

          continue;
        }

        if (!group.isAppRouter && !group.isAppRouteHandler) {
          outputName = normalizeIndexOutput(outputName, true);
        }

        // we add locale prefixed outputs for SSR pages,
        // this is handled in onPrerenderRoute for SSG pages
        if (
          i18n &&
          !isPrerender &&
          !group.isAppRouter &&
          (!isCorrectLocaleAPIRoutes ||
            !(pageName === 'api' || pageName.startsWith('api/')))
        ) {
          for (const locale of i18n.locales) {
            lambdas[
              normalizeIndexOutput(
                path.posix.join(
                  entryDirectory,
                  locale,
                  pageName === 'index' ? '' : pageName
                ),
                true
              )
            ] = lambda;
          }
        } else {
          lambdas[outputName] = lambda;
        }
      }
    }
    console.timeEnd(lambdaCreationLabel);
  }

  const prerenderRoute = onPrerenderRoute({
    appDir,
    pagesDir,
    pageLambdaMap: {},
    lambdas,
    experimentalStreamingLambdaPaths,
    prerenders,
    entryDirectory,
    routesManifest,
    prerenderManifest,
    appPathRoutesManifest,
    isServerMode: true,
    isSharedLambdas: false,
    canUsePreviewMode,
    static404Page,
    localePrefixed404,
    hasPages404: routesManifest.pages404,
    isCorrectNotFoundRoutes,
    isEmptyAllowQueryForPrendered,
  });

  await Promise.all(
    Object.keys(prerenderManifest.staticRoutes).map(route =>
      prerenderRoute(route, {})
    )
  );

  await Promise.all(
    Object.keys(prerenderManifest.fallbackRoutes).map(route =>
      prerenderRoute(route, { isFallback: true })
    )
  );

  await Promise.all(
    Object.keys(prerenderManifest.blockingFallbackRoutes).map(route =>
      prerenderRoute(route, { isBlocking: true })
    )
  );

  if (static404Page && canUsePreviewMode) {
    await Promise.all(
      Array.from(omittedPrerenderRoutes).map(route =>
        prerenderRoute(route, { isOmitted: true })
      )
    );
  }

  prerenderRoutes.forEach(route => {
    if (experimentalPPRRoutes.has(route)) return;
    if (routesManifest?.i18n) {
      route = normalizeLocalePath(route, routesManifest.i18n.locales).pathname;
    }

    delete lambdas[
      normalizeIndexOutput(
        path.posix.join('./', entryDirectory, route === '/' ? '/index' : route),
        true
      )
    ];
  });

  const middleware = await getMiddlewareBundle({
    config,
    entryPath,
    outputDirectory,
    routesManifest,
    isCorrectMiddlewareOrder,
    prerenderBypassToken: prerenderManifest.bypassToken || '',
    nextVersion,
    appPathRoutesManifest: appPathRoutesManifest || {},
  });

  const isNextDataServerResolving =
    middleware.staticRoutes.length > 0 &&
    semver.gte(nextVersion, NEXT_DATA_MIDDLEWARE_RESOLVING_VERSION);

  const dynamicRoutes = await getDynamicRoutes({
    entryPath,
    entryDirectory,
    dynamicPages,
    isDev: false,
    routesManifest,
    omittedRoutes: omittedPrerenderRoutes,
    canUsePreviewMode,
    bypassToken: prerenderManifest.bypassToken || '',
    isServerMode: true,
    dynamicMiddlewareRouteMap: middleware.dynamicRouteMap,
    experimentalPPRRoutes,
  }).then(arr =>
    localizeDynamicRoutes(
      arr,
      dynamicPrefix,
      entryDirectory,
      staticPages,
      prerenderManifest,
      routesManifest,
      true,
      isCorrectLocaleAPIRoutes,
      inversedAppPathManifest
    )
  );

  const pagesPlaceholderRscEntries: Record<string, FileBlob> = {};

  if (appDir) {
    // since we attempt to rewrite all paths to an .rsc variant,
    // we need to create dummy rsc outputs for all pages entries
    // this is so that an RSC request to a `pages` entry will match
    // rather than falling back to a catchall `app` entry
    // on the nextjs side, invalid RSC response payloads will correctly trigger an mpa navigation
    const pagesManifest = path.join(
      entryPath,
      outputDirectory,
      `server/pages-manifest.json`
    );

    const pagesData = await fs.readJSON(pagesManifest);
    const pagesEntries = Object.keys(pagesData);

    for (const page of pagesEntries) {
      const pathName = page.startsWith('/') ? page.slice(1) : page;
      pagesPlaceholderRscEntries[`${pathName}.rsc`] = new FileBlob({
        data: '{}',
        contentType: 'application/json',
      });
    }
  }

  const { staticFiles, publicDirectoryFiles, staticDirectoryFiles } =
    await getStaticFiles(entryPath, entryDirectory, outputDirectory);

  const normalizeNextDataRoute = (isOverride = false) => {
    return isNextDataServerResolving
      ? [
          // strip _next/data prefix for resolving
          {
            src: `^${path.posix.join(
              '/',
              entryDirectory,
              '/_next/data/',
              escapedBuildId,
              '/(.*).json'
            )}`,
            dest: `${path.posix.join(
              '/',
              entryDirectory,
              '/$1',
              trailingSlash ? '/' : ''
            )}`,
            ...(isOverride ? { override: true } : {}),
            continue: true,
            has: [
              {
                type: 'header',
                key: 'x-nextjs-data',
              },
            ],
          },
          // normalize "/index" from "/_next/data/index.json" to -> just "/"
          // as matches a rewrite sources will expect just "/"
          {
            src: path.posix.join('^/', entryDirectory, '/index(?:/)?'),
            has: [
              {
                type: 'header',
                key: 'x-nextjs-data',
              },
            ],
            dest: path.posix.join(
              '/',
              entryDirectory,
              trailingSlash ? '/' : ''
            ),
            ...(isOverride ? { override: true } : {}),
            continue: true,
          },
        ]
      : [];
  };

  const denormalizeNextDataRoute = (isOverride = false) => {
    return isNextDataServerResolving
      ? [
          {
            src: path.posix.join(
              '^/',
              entryDirectory !== '.'
                ? `${entryDirectory}${trailingSlash ? '/$' : '$'}`
                : '$'
            ),
            has: [
              {
                type: 'header',
                key: 'x-nextjs-data',
              },
            ],
            dest: `${path.posix.join(
              '/',
              entryDirectory,
              '/_next/data/',
              buildId,
              '/index.json'
            )}`,
            continue: true,
            ...(isOverride ? { override: true } : {}),
          },
          {
            src: path.posix.join(
              '^/',
              entryDirectory,
              '((?!_next/)(?:.*[^/]|.*))/?$'
            ),
            has: [
              {
                type: 'header',
                key: 'x-nextjs-data',
              },
            ],
            dest: `${path.posix.join(
              '/',
              entryDirectory,
              '/_next/data/',
              buildId,
              '/$1.json'
            )}`,
            continue: true,
            ...(isOverride ? { override: true } : {}),
          },
        ]
      : [];
  };
  let nextDataCatchallOutput: FileFsRef | undefined = undefined;

  if (isNextDataServerResolving) {
    const catchallFsPath = path.join(
      entryPath,
      outputDirectory,
      '__next_data_catchall.json'
    );
    await fs.writeFile(catchallFsPath, '{}');
    nextDataCatchallOutput = new FileFsRef({
      contentType: 'application/json',
      fsPath: catchallFsPath,
    });
  }

  if (appPathRoutesManifest) {
    // create .rsc variant for app lambdas and edge functions
    // to match prerenders so we can route the same when the
    // __rsc__ header is present
    const edgeFunctions = middleware.edgeFunctions;

    for (const route of Object.values(appPathRoutesManifest)) {
      const ogRoute = inversedAppPathManifest[route];

      if (ogRoute.endsWith('/route')) {
        continue;
      }

      const pathname = path.posix.join(
        './',
        entryDirectory,
        route === '/' ? '/index' : route
      );

      if (lambdas[pathname]) {
        lambdas[`${pathname}.rsc`] = lambdas[pathname];
      }

      if (edgeFunctions[pathname]) {
        edgeFunctions[`${pathname}.rsc`] = edgeFunctions[pathname];
      }
    }
  }

  const rscHeader = routesManifest.rsc?.header?.toLowerCase() || '__rsc__';
  const rscPrefetchHeader = routesManifest.rsc?.prefetchHeader?.toLowerCase();
  const rscVaryHeader =
    routesManifest?.rsc?.varyHeader ||
    'RSC, Next-Router-State-Tree, Next-Router-Prefetch';
  const appNotFoundPath = path.posix.join('.', entryDirectory, '_not-found');

  if (experimental.ppr && !rscPrefetchHeader) {
    throw new Error("Invariant: cannot use PPR without 'rsc.prefetchHeader'");
  }

  // If we're using the Experimental Partial Prerendering, we should ensure that
  // all the routes that support it (and are listed) have configured lambdas.
  // This only applies to routes that do not have fallbacks enabled (these are
  // routes that have `dynamicParams =  false` defined.
  if (experimental.ppr) {
    for (const { srcRoute, dataRoute, experimentalPPR } of Object.values(
      prerenderManifest.staticRoutes
    )) {
      // Only apply this to the routes that support experimental PPR and
      // that also have their `dataRoute` and `srcRoute` defined.
      if (!experimentalPPR || !dataRoute || !srcRoute) continue;

      // If the srcRoute is not omitted, then we don't need to do anything. This
      // is the indicator that a route should only have it's prerender defined
      // and not a lambda.
      if (!omittedPrerenderRoutes.has(srcRoute)) continue;

      // The lambda paths have their leading `/` stripped.
      const srcPathname = srcRoute.substring(1);
      const dataPathname = dataRoute.substring(1);

      // If we already have an associated lambda for the `.rsc` route, then
      // we can skip this.
      const dataPathnameExists = dataPathname in lambdas;
      if (dataPathnameExists) continue;

      // We require that the source route has a lambda associated with it. If
      // it doesn't this is an error.
      const srcPathnameExists = srcPathname in lambdas;
      if (!srcPathnameExists) {
        throw new Error(
          `Invariant: Expected to have a lambda for the source route: ${srcPathname}`
        );
      }

      // Associate the data pathname with the source pathname's lambda.
      lambdas[dataPathname] = lambdas[srcPathname];
    }
  }

  return {
    wildcard: wildcardConfig,
    images: getImagesConfig(imagesManifest),
    output: {
      ...publicDirectoryFiles,
      ...lambdas,
      ...appRscPrefetches,
      ...pagesPlaceholderRscEntries,
      // Prerenders may override Lambdas -- this is an intentional behavior.
      ...prerenders,
      ...staticPages,
      ...staticFiles,
      ...staticDirectoryFiles,
      ...privateOutputs.files,
      ...middleware.edgeFunctions,
      ...(isNextDataServerResolving
        ? {
            __next_data_catchall: nextDataCatchallOutput,
          }
        : {}),
    },
    routes: [
      /*
        Desired routes order
        - Runtime headers
        - User headers and redirects
        - Runtime redirects
        - Runtime routes
        - Check filesystem, if nothing found continue
        - User rewrites
        - Builder rewrites
      */
      // force trailingSlashRedirect to the very top so it doesn't
      // conflict with i18n routes that don't have or don't have the
      // trailing slash
      ...trailingSlashRedirects,

      ...privateOutputs.routes,

      // normalize _next/data URL before processing redirects
      ...normalizeNextDataRoute(true),

      ...(i18n
        ? [
            // Handle auto-adding current default locale to path based on
            // $wildcard
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?!(?:_next/.*|${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(?:/.*|$))(.*)$`,
              // we aren't able to ensure trailing slash mode here
              // so ensure this comes after the trailing slash redirect
              dest: `${
                entryDirectory !== '.'
                  ? path.posix.join('/', entryDirectory)
                  : ''
              }$wildcard/$1`,
              continue: true,
            },

            // Handle redirecting to locale specific domains
            ...(i18n.domains &&
            i18n.domains.length > 0 &&
            i18n.localeDetection !== false
              ? [
                  {
                    src: `^${path.posix.join(
                      '/',
                      entryDirectory
                    )}/?(?:${i18n.locales
                      .map(locale => escapeStringRegexp(locale))
                      .join('|')})?/?$`,
                    locale: {
                      redirect: i18n.domains.reduce(
                        (prev: Record<string, string>, item) => {
                          prev[item.defaultLocale] = `http${
                            item.http ? '' : 's'
                          }://${item.domain}/`;

                          if (item.locales) {
                            item.locales.map(locale => {
                              prev[locale] = `http${item.http ? '' : 's'}://${
                                item.domain
                              }/${locale}`;
                            });
                          }
                          return prev;
                        },
                        {}
                      ),
                      cookie: 'NEXT_LOCALE',
                    },
                    continue: true,
                  },
                ]
              : []),

            // Handle redirecting to locale paths
            ...(i18n.localeDetection !== false
              ? [
                  {
                    // TODO: if default locale is included in this src it won't
                    // be visitable by users who prefer another language since a
                    // cookie isn't set signaling the default locale is
                    // preferred on redirect currently, investigate adding this
                    src: '/',
                    locale: {
                      redirect: i18n.locales.reduce(
                        (prev: Record<string, string>, locale) => {
                          prev[locale] =
                            locale === i18n.defaultLocale ? `/` : `/${locale}`;
                          return prev;
                        },
                        {}
                      ),
                      cookie: 'NEXT_LOCALE',
                    },
                    continue: true,
                  },
                ]
              : []),

            {
              src: `^${path.posix.join('/', entryDirectory)}$`,
              dest: `${path.posix.join(
                '/',
                entryDirectory,
                i18n.defaultLocale
              )}`,
              continue: true,
            },

            // Auto-prefix non-locale path with default locale
            // note for prerendered pages this will cause
            // x-now-route-matches to contain the path minus the locale
            // e.g. for /de/posts/[slug] x-now-route-matches would have
            // 1=posts%2Fpost-1
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?!(?:_next/.*|${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(?:/.*|$))(.*)$`,
              dest: `${path.posix.join(
                '/',
                entryDirectory,
                i18n.defaultLocale
              )}/$1`,
              continue: true,
            },
          ]
        : []),

      ...headers,

      ...redirects,

      // middleware comes directly after redirects but before
      // beforeFiles rewrites as middleware is not a "file" route
      ...(routesManifest?.skipMiddlewareUrlNormalize
        ? denormalizeNextDataRoute(true)
        : []),

      ...(isCorrectMiddlewareOrder ? middleware.staticRoutes : []),

      ...(routesManifest?.skipMiddlewareUrlNormalize
        ? normalizeNextDataRoute(true)
        : []),

      ...beforeFilesRewrites,

      // Make sure to 404 for the /404 path itself
      ...(i18n
        ? [
            {
              src: `${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})?[/]?404/?`,
              status: 404,
              continue: true,
              missing: [
                {
                  type: 'header',
                  key: 'x-prerender-revalidate',
                },
              ],
            },
          ]
        : [
            {
              src: path.posix.join('/', entryDirectory, '404/?'),
              status: 404,
              continue: true,
              missing: [
                {
                  type: 'header',
                  key: 'x-prerender-revalidate',
                },
              ],
            },
          ]),

      // Make sure to 500 when visiting /500 directly for static 500
      ...(!hasStatic500
        ? []
        : i18n
        ? [
            {
              src: `${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})?[/]?500`,
              status: 500,
              continue: true,
            },
          ]
        : [
            {
              src: path.posix.join('/', entryDirectory, '500'),
              status: 500,
              continue: true,
            },
          ]),

      // we need to undo _next/data normalize before checking filesystem
      ...denormalizeNextDataRoute(true),

      // while middleware was in beta the order came right before
      // handle: 'filesystem' we maintain this for older versions
      // to prevent a local/deploy mismatch
      ...(!isCorrectMiddlewareOrder ? middleware.staticRoutes : []),

      ...(appDir
        ? [
            ...(rscPrefetchHeader
              ? [
                  {
                    src: `^${path.posix.join('/', entryDirectory, '/')}`,
                    has: [
                      {
                        type: 'header',
                        key: rscPrefetchHeader,
                      },
                    ],
                    dest: path.posix.join(
                      '/',
                      entryDirectory,
                      `/__index${RSC_PREFETCH_SUFFIX}`
                    ),
                    headers: { vary: rscVaryHeader },
                    continue: true,
                    override: true,
                  },
                  {
                    src: `^${path.posix.join(
                      '/',
                      entryDirectory,
                      '/((?!.+\\.rsc).+?)(?:/)?$'
                    )}`,
                    has: [
                      {
                        type: 'header',
                        key: rscPrefetchHeader,
                      },
                    ],
                    dest: path.posix.join(
                      '/',
                      entryDirectory,
                      `/$1${RSC_PREFETCH_SUFFIX}`
                    ),
                    headers: { vary: rscVaryHeader },
                    continue: true,
                    override: true,
                  },
                ]
              : []),
            ...(hasActionOutputSupport
              ? [
                  // Create rewrites for streaming prerenders (.action routes)
                  // This contains separate rewrites for each possible "has" (action header, or content-type)
                  // Also includes separate handling for index routes which should match to /index.action.
                  // This follows the same pattern as the rewrites for .rsc files.
                  {
                    src: `^${path.posix.join('/', entryDirectory, '/')}`,
                    dest: path.posix.join('/', entryDirectory, '/index.action'),
                    has: [
                      {
                        type: 'header',
                        key: 'next-action',
                      },
                    ],
                    continue: true,
                    override: true,
                  },
                  {
                    src: `^${path.posix.join('/', entryDirectory, '/')}`,
                    dest: path.posix.join('/', entryDirectory, '/index.action'),
                    has: [
                      {
                        type: 'header',
                        key: 'content-type',
                        value: 'multipart/form-data;.*',
                      },
                    ],
                    continue: true,
                    override: true,
                  },
                  {
                    src: `^${path.posix.join(
                      '/',
                      entryDirectory,
                      '/((?!.+\\.action).+?)(?:/)?$'
                    )}`,
                    dest: path.posix.join('/', entryDirectory, '/$1.action'),
                    has: [
                      {
                        type: 'header',
                        key: 'next-action',
                      },
                    ],
                    continue: true,
                    override: true,
                  },
                  {
                    src: `^${path.posix.join(
                      '/',
                      entryDirectory,
                      '/((?!.+\\.action).+?)(?:/)?$'
                    )}`,
                    dest: path.posix.join('/', entryDirectory, '/$1.action'),
                    has: [
                      {
                        type: 'header',
                        key: 'content-type',
                        value: 'multipart/form-data;.*',
                      },
                    ],
                    continue: true,
                    override: true,
                  },
                ]
              : []),
            {
              src: `^${path.posix.join('/', entryDirectory, '/')}`,
              has: [
                {
                  type: 'header',
                  key: rscHeader,
                },
              ],
              dest: path.posix.join('/', entryDirectory, '/index.rsc'),
              headers: { vary: rscVaryHeader },
              continue: true,
              override: true,
            },
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                '/((?!.+\\.rsc).+?)(?:/)?$'
              )}`,
              has: [
                {
                  type: 'header',
                  key: rscHeader,
                },
              ],
              dest: path.posix.join('/', entryDirectory, '/$1.rsc'),
              headers: { vary: rscVaryHeader },
              continue: true,
              override: true,
            },
          ]
        : []),

      // Next.js page lambdas, `static/` folder, reserved assets, and `public/`
      // folder
      { handle: 'filesystem' },

      // ensure the basePath prefixed _next/image is rewritten to the root
      // _next/image path
      ...(routesManifest?.basePath
        ? [
            {
              src: path.posix.join('/', entryDirectory, '_next/image/?'),
              dest: '/_next/image',
              check: true,
            },
          ]
        : []),

      // normalize _next/data URL before processing rewrites
      ...normalizeNextDataRoute(),

      ...(!isNextDataServerResolving
        ? [
            // No-op _next/data rewrite to trigger handle: 'rewrites' and then 404
            // if no match to prevent rewriting _next/data unexpectedly
            {
              src: path.posix.join('/', entryDirectory, '_next/data/(.*)'),
              dest: path.posix.join('/', entryDirectory, '_next/data/$1'),
              check: true,
            },
          ]
        : []),

      ...(rscPrefetchHeader && !experimental.ppr
        ? [
            {
              src: path.posix.join(
                '/',
                entryDirectory,
                `/__index${RSC_PREFETCH_SUFFIX}`
              ),
              dest: path.posix.join('/', entryDirectory, '/index.rsc'),
              has: [
                {
                  type: 'header',
                  key: rscPrefetchHeader,
                },
              ],
              continue: true,
              override: true,
            },
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                `/(.+?)${RSC_PREFETCH_SUFFIX}(?:/)?$`
              )}`,
              dest: path.posix.join(
                '/',
                entryDirectory,
                `/$1${experimental.ppr ? RSC_PREFETCH_SUFFIX : '.rsc'}`
              ),
              has: [
                {
                  type: 'header',
                  key: rscPrefetchHeader,
                },
              ],
              continue: true,
              override: true,
            },
          ]
        : []),

      // These need to come before handle: miss or else they are grouped
      // with that routing section
      ...afterFilesRewrites,

      // ensure non-normalized /.rsc from rewrites is handled
      ...(appPathRoutesManifest
        ? [
            {
              src: path.posix.join('/', entryDirectory, '/\\.prefetch\\.rsc$'),
              dest: path.posix.join(
                '/',
                entryDirectory,
                `/__index${RSC_PREFETCH_SUFFIX}`
              ),
              check: true,
            },
            {
              src: path.posix.join('/', entryDirectory, '/\\.rsc$'),
              dest: path.posix.join('/', entryDirectory, `/index.rsc`),
              check: true,
            },
          ]
        : []),

      { handle: 'resource' },

      ...fallbackRewrites,

      // make sure 404 page is used when a directory is matched without
      // an index page
      { src: path.posix.join('/', entryDirectory, '.*'), status: 404 },

      { handle: 'miss' },

      // We need to make sure to 404 for /_next after handle: miss since
      // handle: miss is called before rewrites and to prevent rewriting /_next
      {
        src: path.posix.join(
          '/',
          entryDirectory,
          '_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media)/.+'
        ),
        status: 404,
        check: true,
        dest: '$0',
      },

      // remove locale prefixes to check public files and
      // to allow checking non-prefixed lambda outputs
      ...(i18n
        ? [
            {
              src: path.posix.join(
                '/',
                entryDirectory,
                escapeStringRegexp(i18n.defaultLocale)
              ),
              dest: '/',
              check: true,
            },
            {
              src: `^${path.posix.join('/', entryDirectory)}/?(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})/(.*)`,
              dest: `${path.posix.join('/', entryDirectory, '/')}$1`,
              check: true,
            },
          ]
        : []),

      // routes that are called after each rewrite or after routes
      // if there no rewrites
      { handle: 'rewrite' },

      // re-build /_next/data URL after resolving
      ...denormalizeNextDataRoute(),

      ...(isNextDataServerResolving
        ? dataRoutes.filter(route => {
            // filter to only static data routes as dynamic routes will be handled
            // below
            const { pathname } = new URL(route.dest || '/', 'http://n');
            return !isDynamicRoute(pathname.replace(/\.json$/, ''));
          })
        : []),

      // /_next/data routes for getServerProps/getStaticProps pages
      ...(isNextDataServerResolving
        ? // when resolving data routes for middleware we need to include
          // all dynamic routes including non-SSG/SSP so that the priority
          // is correct
          dynamicRoutes
            .filter(route => !route.src.includes('.rsc'))
            .map(route => {
              route = Object.assign({}, route);
              let normalizedSrc = route.src;

              if (routesManifest.basePath) {
                normalizedSrc = normalizedSrc.replace(
                  new RegExp(
                    `\\^${escapeStringRegexp(routesManifest.basePath)}`
                  ),
                  '^'
                );
              }

              route.src = path.posix.join(
                '^/',
                entryDirectory,
                '_next/data/',
                escapedBuildId,
                normalizedSrc
                  .replace(/\^\(\?:\/\(\?</, '(?:(?<')
                  .replace(/(^\^|\$$)/g, '') + '.json$'
              );

              const parsedDestination = new URL(route.dest || '/', 'http://n');
              let pathname = parsedDestination.pathname;
              const search = parsedDestination.search;

              let isPrerender = !!prerenders[path.join('./', pathname)];

              if (routesManifest.i18n) {
                for (const locale of routesManifest.i18n?.locales || []) {
                  const prerenderPathname = pathname.replace(
                    /^\/\$nextLocale/,
                    `/${locale}`
                  );
                  if (prerenders[path.join('./', prerenderPathname)]) {
                    isPrerender = true;
                    break;
                  }
                }
              }

              if (isPrerender) {
                if (routesManifest.basePath) {
                  pathname = pathname.replace(
                    new RegExp(
                      `^${escapeStringRegexp(routesManifest.basePath)}`
                    ),
                    ''
                  );
                }
                route.dest = `${
                  routesManifest.basePath || ''
                }/_next/data/${buildId}${pathname}.json${search || ''}`;
              }
              return route;
            })
            .filter(Boolean)
        : dataRoutes),

      ...(!isNextDataServerResolving
        ? [
            // ensure we 404 for non-existent _next/data routes before
            // trying page dynamic routes
            {
              src: path.posix.join('/', entryDirectory, '_next/data/(.*)'),
              dest: path.posix.join('/', entryDirectory, '404'),
              status: 404,
            },
          ]
        : []),

      // Dynamic routes (must come after dataRoutes as dataRoutes are more
      // specific)
      ...dynamicRoutes,

      ...(isNextDataServerResolving
        ? [
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                '/_next/data/',
                escapedBuildId,
                '/(.*).json'
              )}`,
              headers: {
                'x-nextjs-matched-path': '/$1',
              },
              continue: true,
              override: true,
            },
            // add a catch-all data route so we don't 404 when getting
            // middleware effects
            {
              src: `^${path.posix.join(
                '/',
                entryDirectory,
                '/_next/data/',
                escapedBuildId,
                '/(.*).json'
              )}`,
              dest: '__next_data_catchall',
            },
          ]
        : []),

      // routes to call after a file has been matched
      { handle: 'hit' },
      // Before we handle static files we need to set proper caching headers
      {
        // This ensures we only match known emitted-by-Next.js files and not
        // user-emitted files which may be missing a hash in their filename.
        src: path.posix.join(
          '/',
          entryDirectory,
          `_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media|${escapedBuildId})/.+`
        ),
        // Next.js assets contain a hash or entropy in their filenames, so they
        // are guaranteed to be unique and cacheable indefinitely.
        headers: {
          'cache-control': `public,max-age=${MAX_AGE_ONE_YEAR},immutable`,
        },
        continue: true,
        important: true,
      },

      {
        src: path.posix.join('/', entryDirectory, '/index'),
        headers: {
          'x-matched-path': '/',
        },
        continue: true,
        important: true,
      },
      {
        src: path.posix.join('/', entryDirectory, `/((?!index$).*)`),
        headers: {
          'x-matched-path': '/$1',
        },
        continue: true,
        important: true,
      },

      // error handling
      { handle: 'error' } as RouteWithHandle,

      // Custom Next.js 404 page

      ...(i18n && (static404Page || hasIsr404Page || lambdaPages['404.js'])
        ? [
            {
              src: `${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?<nextLocale>${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(/.*|$)`,
              dest: path.posix.join('/', entryDirectory, '/$nextLocale/404'),
              status: 404,
              caseSensitive: true,
            },
            {
              src: path.posix.join('/', entryDirectory, '.*'),
              dest: path.posix.join(
                '/',
                entryDirectory,
                `/${i18n.defaultLocale}/404`
              ),
              status: 404,
            },
          ]
        : [
            {
              src: path.posix.join('/', entryDirectory, '.*'),
              dest: path.posix.join(
                '/',
                entryDirectory,
                static404Page ||
                  hasIsr404Page ||
                  lambdas[path.posix.join(entryDirectory, '404')]
                  ? '/404'
                  : appPathRoutesManifest &&
                    (middleware.edgeFunctions[appNotFoundPath] ||
                      lambdas[appNotFoundPath])
                  ? '/_not-found'
                  : '/_error'
              ),
              status: 404,
            },
          ]),

      // custom 500 page if present
      ...(i18n && (hasStatic500 || hasIsr500Page || lambdaPages['500.js'])
        ? [
            {
              src: `${path.posix.join(
                '/',
                entryDirectory,
                '/'
              )}(?<nextLocale>${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(/.*|$)`,
              dest: path.posix.join('/', entryDirectory, '/$nextLocale/500'),
              status: 500,
              caseSensitive: true,
            },
            {
              src: path.posix.join('/', entryDirectory, '.*'),
              dest: path.posix.join(
                '/',
                entryDirectory,
                `/${i18n.defaultLocale}/500`
              ),
              status: 500,
            },
          ]
        : [
            {
              src: path.posix.join('/', entryDirectory, '.*'),
              dest: path.posix.join(
                '/',
                entryDirectory,
                hasStatic500 ||
                  hasIsr500Page ||
                  lambdas[path.posix.join(entryDirectory, '500')]
                  ? '/500'
                  : '/_error'
              ),
              status: 500,
            },
          ]),
    ],
    framework: { version: nextVersion },
    flags: variantsManifest || undefined,
  };
}
