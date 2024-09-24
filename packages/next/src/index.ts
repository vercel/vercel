import {
  Diagnostics,
  FileBlob,
  FileFsRef,
  Files,
  Lambda,
  NowBuildError,
  PackageJson,
  Prerender,
  debug,
  download,
  getLambdaOptionsFromFunction,
  getNodeVersion,
  getPrefixedEnvVars,
  getSpawnOptions,
  getScriptName,
  glob,
  runNpmInstall,
  runPackageJsonScript,
  execCommand,
  getEnvForPackageManager,
  getNodeBinPaths,
  scanParentDirs,
  BuildV2,
  PrepareCache,
  NodejsLambda,
  BuildResultV2Typical as BuildResult,
  BuildResultBuildOutput,
  getInstalledPackageVersion,
} from '@vercel/build-utils';
import { Route, RouteWithHandle, RouteWithSrc } from '@vercel/routing-utils';
import {
  convertHeaders,
  convertRedirects,
  convertRewrites,
} from '@vercel/routing-utils/dist/superstatic';
import { nodeFileTrace } from '@vercel/nft';
import { Sema } from 'async-sema';
// escape-string-regexp version must match Next.js version
import escapeStringRegexp from 'escape-string-regexp';
import findUp from 'find-up';
import {
  lstat,
  pathExists,
  readFile,
  readJSON,
  remove,
  writeFile,
} from 'fs-extra';
import path from 'path';
import semver from 'semver';
import url from 'url';
import createServerlessConfig from './create-serverless-config';
import nextLegacyVersions from './legacy-versions';
import { serverBuild } from './server-build';
import {
  collectTracedFiles,
  createLambdaFromPseudoLayers,
  createPseudoLayer,
  detectLambdaLimitExceeding,
  excludeFiles,
  ExperimentalTraceVersion,
  filterStaticPages,
  getDynamicRoutes,
  getExportIntent,
  getExportStatus,
  getFilesMapFromReasons,
  getImagesConfig,
  getImagesManifest,
  getNextConfig,
  getPageLambdaGroups,
  getPrerenderManifest,
  getPrivateOutputs,
  getRequiredServerFilesManifest,
  getRoutesManifest,
  getSourceFilePathFromPage,
  getStaticFiles,
  getVariantsManifest,
  isDynamicRoute,
  localizeDynamicRoutes,
  normalizeIndexOutput,
  normalizePackageJson,
  normalizePage,
  onPrerenderRoute,
  onPrerenderRouteInitial,
  PseudoFile,
  PseudoLayer,
  PseudoLayerResult,
  updateRouteSrc,
  validateEntrypoint,
  getOperationType,
  isApiPage,
  getFunctionsConfigManifest,
  require_,
  getServerlessPages,
  RenderingMode,
} from './utils';

export const version = 2;
export const htmlContentType = 'text/html; charset=utf-8';
const SERVER_BUILD_MINIMUM_NEXT_VERSION = 'v10.0.9-canary.4';
// related PR: https://github.com/vercel/next.js/pull/25418
const BEFORE_FILES_CONTINUE_NEXT_VERSION = 'v10.2.3-canary.1';
// related PR: https://github.com/vercel/next.js/pull/27143
const REDIRECTS_NO_STATIC_NEXT_VERSION = 'v11.0.2-canary.15';

export const MAX_AGE_ONE_YEAR = 31536000;

/**
 * Read package.json from files
 */
async function readPackageJson(entryPath: string): Promise<PackageJson> {
  const packagePath = path.join(entryPath, 'package.json');

  try {
    return JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (err) {
    debug('package.json not found in entry');
    return {};
  }
}

/**
 * Write package.json
 */
async function writePackageJson(workPath: string, packageJson: PackageJson) {
  await writeFile(
    path.join(workPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

/**
 * Write .npmrc with npm auth token
 */
async function writeNpmRc(workPath: string, token: string) {
  await writeFile(
    path.join(workPath, '.npmrc'),
    `//registry.npmjs.org/:_authToken=${token}`
  );
}

/**
 * Get the installed Next version.
 */
function getRealNextVersion(entryPath: string): string | false {
  try {
    // First try to resolve the `next` dependency and get the real version from its
    // package.json. This allows the builder to be used with frameworks like Blitz that
    // bundle Next but where Next isn't in the project root's package.json

    const resolved = require_.resolve('next/package.json', {
      paths: [entryPath],
    });
    const nextVersion: string = require_(resolved).version;
    console.log(`Detected Next.js version: ${nextVersion}`);
    return nextVersion;
  } catch (_ignored) {
    console.log(
      `Warning: Could not identify Next.js version, ensure it is defined as a project dependency.`
    );
    return false;
  }
}

/**
 * Get the package.json Next version.
 */
async function getNextVersionRange(entryPath: string): Promise<string | false> {
  let nextVersion: string | false = false;
  const pkg = await readPackageJson(entryPath);
  if (pkg.dependencies && pkg.dependencies.next) {
    nextVersion = pkg.dependencies.next;
  } else if (pkg.devDependencies && pkg.devDependencies.next) {
    nextVersion = pkg.devDependencies.next;
  }
  return nextVersion;
}

function isLegacyNext(nextVersion: string) {
  // If version is using the dist-tag instead of a version range
  if (nextVersion === 'canary' || nextVersion === 'latest') {
    return false;
  }

  // If the version is an exact match with the legacy versions
  if (nextLegacyVersions.indexOf(nextVersion) !== -1) {
    return true;
  }

  const maxSatisfying = semver.maxSatisfying(nextLegacyVersions, nextVersion);
  // When the version can't be matched with legacy versions, so it must be a newer version
  if (maxSatisfying === null) {
    return false;
  }

  return true;
}

export const build: BuildV2 = async buildOptions => {
  let { workPath, repoRootPath } = buildOptions;
  const {
    files,
    entrypoint,
    config = {},
    meta = {},
    buildCallback,
  } = buildOptions;

  validateEntrypoint(entrypoint);

  let entryDirectory = path.dirname(entrypoint);
  let entryPath = path.join(workPath, entryDirectory);

  // allow testing root directory setting with vercel.json
  if (config.rootDirectory) {
    repoRootPath = entryPath;
    entryPath = path.join(entryPath, config.rootDirectory as string);
  }
  const outputDirectory = path.join('./', config.outputDirectory || '.next');
  const dotNextStatic = path.join(entryPath, outputDirectory, 'static');
  // TODO: remove after testing used for simulating root directory monorepo
  // setting that can't be triggered with vercel.json
  const baseDir = repoRootPath || workPath;

  debug(
    JSON.stringify(
      {
        repoRootPath,
        baseDir,
        workPath,
        entryPath,
        entryDirectory,
        outputDirectory,
      },
      null,
      2
    )
  );

  const prefixedEnvs = getPrefixedEnvVars({
    envPrefix: 'NEXT_PUBLIC_',
    envs: process.env,
  });

  for (const [key, value] of Object.entries(prefixedEnvs)) {
    process.env[key] = value;
  }

  await download(files, workPath, meta);

  if (config.rootDirectory) {
    // this must come after the download step since files outside
    // the root directory will be excluded if we update workPath first.
    // This should not be used when the actual root directory setting
    // is being used since this is meant to simulate it while testing
    workPath = path.join(workPath, config.rootDirectory as string);
  }

  let pkg = await readPackageJson(entryPath);
  const nextVersionRange = await getNextVersionRange(entryPath);
  const nodeVersion = await getNodeVersion(entryPath, undefined, config, meta);
  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  const { cliType, lockfileVersion, packageJson } = await scanParentDirs(
    entryPath,
    true
  );

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager: packageJson?.packageManager,
    nodeVersion,
    env: spawnOpts.env || {},
  });

  const nowJsonPath = await findUp(['now.json', 'vercel.json'], {
    cwd: entryPath,
  });

  let hasLegacyRoutes = false;
  const hasFunctionsConfig = Boolean(config.functions);

  if (await pathExists(dotNextStatic)) {
    console.warn('WARNING: You should not upload the `.next` directory.');
  }

  const isLegacy = nextVersionRange && isLegacyNext(nextVersionRange);
  debug(`MODE: ${isLegacy ? 'legacy' : 'server(less)'}`);

  if (isLegacy) {
    console.warn(
      "WARNING: your application is being deployed in @vercel/next's legacy mode. http://err.sh/vercel/vercel/now-next-legacy-mode"
    );

    await Promise.all([
      remove(path.join(entryPath, 'yarn.lock')),
      remove(path.join(entryPath, 'package-lock.json')),
    ]);

    debug('Normalizing package.json');
    pkg = normalizePackageJson(pkg);
    debug('Normalized package.json result: ', pkg);
    await writePackageJson(entryPath, pkg);
  }

  let buildScriptName = getScriptName(pkg, [
    'vercel-build',
    'now-build',
    'build',
  ]);
  const { installCommand, buildCommand } = config;

  if (!buildScriptName && !buildCommand) {
    console.log(
      'Your application is being built using `next build`. ' +
        'If you need to define a different build step, please create a `vercel-build` script in your `package.json` ' +
        '(e.g. `{ "scripts": { "vercel-build": "npm run prepare && next build" } }`).'
    );

    await writePackageJson(entryPath, {
      ...pkg,
      scripts: {
        'vercel-build': 'next build',
        ...pkg.scripts,
      },
    });
    buildScriptName = 'vercel-build';
  }

  if (process.env.NPM_AUTH_TOKEN) {
    debug('Found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN);
  }

  if (typeof installCommand === 'string') {
    if (installCommand.trim()) {
      console.log(`Running "install" command: \`${installCommand}\`...`);

      await execCommand(installCommand, {
        ...spawnOpts,
        cwd: entryPath,
      });
    } else {
      console.log(`Skipping "install" command...`);
    }
  } else {
    await runNpmInstall(entryPath, [], spawnOpts, meta, nodeVersion);
  }

  if (spawnOpts.env.VERCEL_ANALYTICS_ID) {
    debug('Found VERCEL_ANALYTICS_ID in environment');

    const version = await getInstalledPackageVersion(
      '@vercel/speed-insights',
      entryPath
    );

    if (version) {
      // Next.js has a built-in integration with Vercel Speed Insights
      // with the new @vercel/speed-insights package this is no longer needed
      // and can be removed to avoid duplicate events
      delete spawnOpts.env.VERCEL_ANALYTICS_ID;
      delete process.env.VERCEL_ANALYTICS_ID;

      debug(
        '@vercel/speed-insights is installed, removing VERCEL_ANALYTICS_ID from environment'
      );
    }
  }

  // Refetch Next version now that dependencies are installed.
  // This will now resolve the actual installed Next version,
  // even if Next isn't in the project package.json
  const nextVersion = getRealNextVersion(entryPath);
  if (!nextVersion) {
    throw new NowBuildError({
      code: 'NEXT_NO_VERSION',
      message:
        'No Next.js version could be detected in your project. Make sure `"next"` is installed in "dependencies" or "devDependencies"',
    });
  }

  let isServerMode =
    !(config.framework === 'blitzjs') &&
    semver.gte(nextVersion, SERVER_BUILD_MINIMUM_NEXT_VERSION);

  const beforeFilesShouldContinue = semver.gte(
    nextVersion,
    BEFORE_FILES_CONTINUE_NEXT_VERSION
  );
  const isCorrectLocaleAPIRoutes = semver.gte(nextVersion, 'v11.0.2-canary.3');

  if (isServerMode) {
    debug(
      `Application is being built in server mode since ${nextVersion} meets minimum version of ${SERVER_BUILD_MINIMUM_NEXT_VERSION}`
    );
  } else {
    if (nowJsonPath) {
      const nowJsonData = JSON.parse(await readFile(nowJsonPath, 'utf8'));

      if (Array.isArray(nowJsonData.routes) && nowJsonData.routes.length > 0) {
        hasLegacyRoutes = true;
        console.warn(
          `WARNING: your application is being opted out of @vercel/next's optimized lambdas mode due to legacy routes in ${path.basename(
            nowJsonPath
          )}. http://err.sh/vercel/vercel/next-legacy-routes-optimized-lambdas`
        );
      }
    }

    if (hasFunctionsConfig) {
      console.warn(
        `WARNING: Your application is being opted out of "@vercel/next" optimized lambdas mode due to \`functions\` config.\nMore info: http://err.sh/vercel/vercel/next-functions-config-optimized-lambdas`
      );
    }
  }

  // default to true but still allow opting out with the config
  const isSharedLambdas =
    !isServerMode &&
    !hasLegacyRoutes &&
    !hasFunctionsConfig &&
    typeof config.sharedLambdas === 'undefined'
      ? true
      : !!config.sharedLambdas;

  let target: undefined | string;

  if (isServerMode) {
    // server mode eligible Next.js apps do not need
    // the target forced via next.config.js wrapping since
    // we can leverage the NEXT_PRIVATE_TARGET env variable
    target = 'server';
  } else if (!isLegacy) {
    target = await createServerlessConfig(workPath, entryPath, nextVersion);
  }

  const env: typeof process.env = { ...spawnOpts.env };
  env.NEXT_EDGE_RUNTIME_PROVIDER = 'vercel';

  if (target) {
    // Since version v10.0.8-canary.15 of Next.js the NEXT_PRIVATE_TARGET env
    // value can be used to override the target set in next.config.js
    // this helps us catch cases where we can't locate the next.config.js
    // correctly
    env.NEXT_PRIVATE_TARGET = target;
  }
  // Only NEXT_PUBLIC_ is considered for turbo/nx cache keys
  // and caches may not have the correct trace root so we
  // need to ensure this included in the cache key
  env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = baseDir;

  if (isServerMode) {
    // when testing with jest NODE_ENV will be set to test so ensure
    // it is production when running the build command
    env.NODE_ENV = 'production';
  }

  if (buildCommand) {
    // Add `node_modules/.bin` to PATH
    const nodeBinPaths = getNodeBinPaths({
      start: entryPath,
      base: repoRootPath,
    });
    const nodeBinPath = nodeBinPaths.join(path.delimiter);
    env.PATH = `${nodeBinPath}${path.delimiter}${env.PATH}`;

    // Yarn v2 PnP mode may be activated, so force "node-modules" linker style
    if (!env.YARN_NODE_LINKER) {
      env.YARN_NODE_LINKER = 'node-modules';
    }

    debug(
      `Added "${nodeBinPath}" to PATH env because a build command was used.`
    );

    console.log(`Running "${buildCommand}"`);
    await execCommand(buildCommand, {
      ...spawnOpts,
      cwd: entryPath,
      env,
    });
  } else if (buildScriptName) {
    await runPackageJsonScript(entryPath, buildScriptName, {
      ...spawnOpts,
      env,
    });
  }
  debug('build command exited');

  if (buildCallback) {
    await buildCallback(buildOptions);
  }

  let buildOutputVersion: undefined | number;

  try {
    const data = await readJSON(
      path.join(outputDirectory, 'output/config.json')
    );
    buildOutputVersion = data.version;
  } catch (_) {
    // tolerate for older versions
  }

  if (buildOutputVersion) {
    return {
      buildOutputPath: path.join(outputDirectory, 'output'),
      buildOutputVersion,
    } as BuildResultBuildOutput;
  }

  let appMountPrefixNoTrailingSlash = path.posix
    .join('/', entryDirectory)
    .replace(/\/+$/, '');

  const requiredServerFilesManifest = isServerMode
    ? await getRequiredServerFilesManifest(entryPath, outputDirectory)
    : false;

  isServerMode = Boolean(requiredServerFilesManifest);

  const functionsConfigManifest = await getFunctionsConfigManifest(
    entryPath,
    outputDirectory
  );

  const variantsManifest = await getVariantsManifest(
    entryPath,
    outputDirectory
  );

  const routesManifest = await getRoutesManifest(
    entryPath,
    outputDirectory,
    nextVersion
  );
  const imagesManifest = await getImagesManifest(entryPath, outputDirectory);
  const prerenderManifest = await getPrerenderManifest(
    entryPath,
    outputDirectory
  );
  const omittedPrerenderRoutes: ReadonlySet<string> = new Set(
    Object.keys(prerenderManifest.omittedRoutes)
  );

  const hasIsr404Page =
    typeof prerenderManifest.staticRoutes[
      routesManifest?.i18n
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          path.join('/', routesManifest?.i18n!.defaultLocale!, '/404')
        : '/404'
    ]?.initialRevalidate === 'number';

  const hasIsr500Page =
    typeof prerenderManifest.staticRoutes[
      routesManifest?.i18n
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          path.join('/', routesManifest?.i18n!.defaultLocale!, '/500')
        : '/500'
    ]?.initialRevalidate === 'number';

  const wildcardConfig: BuildResult['wildcard'] =
    routesManifest?.i18n?.domains && routesManifest.i18n.domains.length > 0
      ? routesManifest.i18n.domains.map(item => {
          return {
            domain: item.domain,
            value:
              item.defaultLocale === routesManifest.i18n?.defaultLocale
                ? ''
                : `/${item.defaultLocale}`,
          };
        })
      : undefined;

  const privateOutputs = await getPrivateOutputs(
    path.join(entryPath, outputDirectory),
    {
      'next-stats.json': '_next/__private/stats.json',
      trace: '_next/__private/trace',
    }
  );

  const headers: Route[] = [];
  const beforeFilesRewrites: Route[] = [];
  const afterFilesRewrites: Route[] = [];
  const fallbackRewrites: Route[] = [];
  let redirects: Route[] = [];
  const dataRoutes: Route[] = [];
  let dynamicRoutes: Route[] = [];
  // whether they have enabled pages/404.js as the custom 404 page
  let hasPages404 = false;
  let buildId = '';
  let escapedBuildId = '';

  if (isLegacy || isSharedLambdas || isServerMode) {
    try {
      buildId = await readFile(
        path.join(entryPath, outputDirectory, 'BUILD_ID'),
        'utf8'
      );
      escapedBuildId = escapeStringRegexp(buildId);
    } catch (err) {
      throw new NowBuildError({
        code: 'NOW_NEXT_NO_BUILD_ID',
        message:
          'The BUILD_ID file was not found in the Output Directory. Did you forget to run "next build" in your Build Command?',
      });
    }
  }

  if (routesManifest) {
    switch (routesManifest.version) {
      case 1:
      case 2:
      case 3:
      case 4: {
        redirects.push(...convertRedirects(routesManifest.redirects));

        if (Array.isArray(routesManifest.rewrites)) {
          afterFilesRewrites.push(
            ...convertRewrites(
              routesManifest.rewrites,
              routesManifest.i18n ? ['nextInternalLocale'] : undefined
            )
          );
        } else {
          beforeFilesRewrites.push(
            ...convertRewrites(routesManifest.rewrites.beforeFiles).map(r => {
              if ('check' in r) {
                if (beforeFilesShouldContinue) {
                  delete r.check;
                  r.continue = true;
                }
                // override: true helps maintain order so that redirects don't
                // come after beforeFiles rewrites
                r.override = true;
              }
              return r;
            })
          );
          afterFilesRewrites.push(
            ...convertRewrites(routesManifest.rewrites.afterFiles)
          );
          fallbackRewrites.push(
            ...convertRewrites(routesManifest.rewrites.fallback)
          );
        }

        if (routesManifest.headers) {
          headers.push(...convertHeaders(routesManifest.headers));
        }

        // This applies the _next match prevention for redirects and
        // also allows matching the trailingSlash setting automatically
        // for all custom routes
        if (semver.gte(nextVersion, REDIRECTS_NO_STATIC_NEXT_VERSION)) {
          redirects.forEach((r, i) =>
            updateRouteSrc(r, i, routesManifest.redirects)
          );
          afterFilesRewrites.forEach((r, i) =>
            updateRouteSrc(
              r,
              i,
              Array.isArray(routesManifest.rewrites)
                ? routesManifest.rewrites
                : routesManifest.rewrites.afterFiles
            )
          );
          beforeFilesRewrites.forEach((r, i) =>
            updateRouteSrc(
              r,
              i,
              Array.isArray(routesManifest.rewrites)
                ? []
                : routesManifest.rewrites.beforeFiles
            )
          );
          fallbackRewrites.forEach((r, i) =>
            updateRouteSrc(
              r,
              i,
              Array.isArray(routesManifest.rewrites)
                ? []
                : routesManifest.rewrites.fallback
            )
          );
          headers.forEach((r, i) =>
            updateRouteSrc(r, i, routesManifest.headers || [])
          );
        }

        if (routesManifest.basePath && routesManifest.basePath !== '/') {
          const nextBasePath = routesManifest.basePath;

          if (!nextBasePath.startsWith('/')) {
            throw new NowBuildError({
              code: 'NEXT_BASEPATH_STARTING_SLASH',
              message:
                'basePath must start with `/`. Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
            });
          }
          if (nextBasePath.endsWith('/')) {
            throw new NowBuildError({
              code: 'NEXT_BASEPATH_TRAILING_SLASH',
              message:
                'basePath must not end with `/`. Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
            });
          }

          // if legacy builds are being used then it can cause conflict with
          // basePath so we show an error
          if (entryDirectory.length > 1) {
            throw new NowBuildError({
              code: 'NEXT_BASEPATH_LEGACY_BUILDS',
              message:
                'basePath can not be used with `builds` in vercel.json, use Project Settings to configure your monorepo instead',
              link: 'https://vercel.com/docs/platform/projects#project-settings',
            });
          }

          entryDirectory = path.join(entryDirectory, nextBasePath);
          appMountPrefixNoTrailingSlash = path.posix
            .join('/', entryDirectory)
            .replace(/\/+$/, '');
        }

        if (routesManifest.pages404) {
          hasPages404 = true;
        }

        break;
      }
      default: {
        // update MIN_ROUTES_MANIFEST_VERSION in ./utils.ts
        throw new NowBuildError({
          code: 'NEXT_VERSION_OUTDATED',
          message:
            'This version of `@vercel/next` does not support the version of Next.js you are trying to deploy.\n' +
            'Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
        });
      }
    }
  }

  let dynamicPrefix = path.posix.join('/', entryDirectory);
  dynamicPrefix = dynamicPrefix === '/' ? '' : dynamicPrefix;

  if (imagesManifest) {
    switch (imagesManifest.version) {
      case 1: {
        if (!imagesManifest.images) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_MISSING',
            message:
              'image-manifest.json "images" is required. Contact support if this continues to happen.',
          });
        }
        const { images } = imagesManifest;
        if (!Array.isArray(images.domains)) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_DOMAINS',
            message:
              'image-manifest.json "images.domains" must be an array. Contact support if this continues to happen.',
          });
        }
        if (!Array.isArray(images.sizes)) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_SIZES',
            message:
              'image-manifest.json "images.sizes" must be an array. Contact support if this continues to happen.',
          });
        }
        if (images.remotePatterns && !Array.isArray(images.remotePatterns)) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_REMOTEPATTERNS',
            message:
              'image-manifest.json "images.remotePatterns" must be an array. Contact support if this continues to happen',
          });
        }
        if (
          images.minimumCacheTTL &&
          !Number.isInteger(images.minimumCacheTTL)
        ) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_MINIMUMCACHETTL',
            message:
              'image-manifest.json "images.minimumCacheTTL" must be an integer. Contact support if this continues to happen.',
          });
        }
        if (
          typeof images.dangerouslyAllowSVG !== 'undefined' &&
          typeof images.dangerouslyAllowSVG !== 'boolean'
        ) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_DANGEROUSLYALLOWSVG',
            message:
              'image-manifest.json "images.dangerouslyAllowSVG" must be a boolean. Contact support if this continues to happen.',
          });
        }
        if (
          typeof images.contentSecurityPolicy !== 'undefined' &&
          typeof images.contentSecurityPolicy !== 'string'
        ) {
          throw new NowBuildError({
            code: 'NEXT_IMAGES_CONTENTSECURITYPOLICY',
            message:
              'image-manifest.json "images.contentSecurityPolicy" must be a string. Contact support if this continues to happen.',
          });
        }
        break;
      }
      default: {
        throw new NowBuildError({
          code: 'NEXT_IMAGES_VERSION_UNKNOWN',
          message:
            'This version of `@vercel/next` does not support the version of Next.js you are trying to deploy.\n' +
            'Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
        });
      }
    }
  }

  const userExport = await getExportStatus(entryPath);

  if (userExport) {
    const exportIntent = await getExportIntent(entryPath);
    const { trailingSlash = false } = exportIntent || {};

    const resultingExport = await getExportStatus(entryPath);
    if (!resultingExport) {
      throw new NowBuildError({
        code: 'NEXT_EXPORT_FAILED',
        message:
          'Exporting Next.js app failed. Please check your build logs and contact us if this continues.',
      });
    }

    if (resultingExport.success !== true) {
      throw new NowBuildError({
        code: 'NEXT_EXPORT_FAILED',
        message: 'Export of Next.js app failed. Please check your build logs.',
      });
    }

    const outDirectory = resultingExport.outDirectory;

    debug(`next export should use trailing slash: ${trailingSlash}`);

    // This handles pages, `public/`, and `static/`.
    const filesAfterBuild = await glob('**', outDirectory);

    const output: Files = {
      ...filesAfterBuild,
      ...privateOutputs.files,
    };

    // Strip `.html` extensions from build output
    Object.entries(output)
      .filter(([name]) => name.endsWith('.html'))
      .forEach(([name, value]) => {
        const cleanName = name.slice(0, -5);
        delete output[name];
        output[cleanName] = value;
        if (value.type === 'FileBlob' || value.type === 'FileFsRef') {
          value.contentType = value.contentType || 'text/html; charset=utf-8';
        }
      });

    console.log(
      'Notice: detected `next export`, this de-opts some Next.js features\nSee more info: https://nextjs.org/docs/advanced-features/static-html-export'
    );

    return {
      output,
      images: getImagesConfig(imagesManifest),
      routes: [
        ...privateOutputs.routes,

        ...headers,

        ...redirects,

        ...beforeFilesRewrites,

        // Make sure to 404 for the /404 path itself
        {
          src: path.posix.join('/', entryDirectory, '404/?'),
          status: 404,
          continue: true,
        },

        // Next.js pages, `static/` folder, reserved assets, and `public/`
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

        // No-op _next/data rewrite to trigger handle: 'rewrites' and then 404
        // if no match to prevent rewriting _next/data unexpectedly
        {
          src: path.posix.join('/', entryDirectory, '_next/data/(.*)'),
          dest: path.posix.join('/', entryDirectory, '_next/data/$1'),
          check: true,
        },
        {
          src: path.posix.join('/', entryDirectory, '_next/data/(.*)'),
          status: 404,
        },

        // These need to come before handle: miss or else they are grouped
        // with that routing section
        ...afterFilesRewrites,

        // make sure 404 page is used when a directory is matched without
        // an index page
        { handle: 'resource' },

        ...fallbackRewrites,

        { src: path.posix.join('/', entryDirectory, '.*'), status: 404 },

        // We need to make sure to 404 for /_next after handle: miss since
        // handle: miss is called before rewrites and to prevent rewriting
        // /_next
        { handle: 'miss' },
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

        // Dynamic routes
        // TODO: do we want to do this?: ...dynamicRoutes,
        // (if so make sure to add any dynamic routes after handle: 'rewrite' )

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

        // error handling
        ...(output[path.posix.join('./', entryDirectory, '404')] ||
        output[path.posix.join('./', entryDirectory, '404/index')]
          ? [
              { handle: 'error' } as RouteWithHandle,

              {
                status: 404,
                src: path.posix.join(entryDirectory, '.*'),
                dest: path.posix.join('/', entryDirectory, '404'),
              },
            ]
          : []),
      ],
      framework: { version: nextVersion },
    };
  }

  if (isLegacy) {
    debug('Running npm install --production...');
    await runNpmInstall(
      entryPath,
      ['--production'],
      spawnOpts,
      meta,
      nodeVersion
    );
  }

  if (process.env.NPM_AUTH_TOKEN) {
    await remove(path.join(entryPath, '.npmrc'));
  }

  const trailingSlashRedirects: Route[] = [];
  let trailingSlash = false;

  redirects = redirects.filter(_redir => {
    const redir = _redir as RouteWithSrc;
    // detect the trailing slash redirect and make sure it's
    // kept above the wildcard mapping to prevent erroneous redirects
    // since non-continue routes come after continue the $wildcard
    // route will come before the redirect otherwise and if the
    // redirect is triggered it breaks locale mapping

    const location =
      redir.headers && (redir.headers.location || redir.headers.Location);

    if (redir.status === 308 && (location === '/$1' || location === '/$1/')) {
      // we set continue here to prevent the redirect from
      // moving underneath i18n routes
      redir.continue = true;
      trailingSlashRedirects.push(redir);

      if (location === '/$1/') {
        trailingSlash = true;
      }
      return false;
    }
    return true;
  });

  const pageLambdaRoutes: Route[] = [];
  const dynamicPageLambdaRoutes: Route[] = [];
  const dynamicPageLambdaRoutesMap: { [page: string]: Route } = {};
  const pageLambdaMap: { [page: string]: string } = {};

  const lambdas: { [key: string]: Lambda } = {};
  const prerenders: { [key: string]: Prerender | FileFsRef } = {};
  let staticPages: { [key: string]: FileFsRef } = {};
  const dynamicPages: string[] = [];
  let static404Page: string | undefined;
  let page404Path = '';
  let hasStatic500: undefined | boolean;

  if (isLegacy) {
    const filesAfterBuild = await glob('**', entryPath);

    debug('Preparing serverless function files...');

    const dotNextRootFiles = await glob(`${outputDirectory}/*`, entryPath);
    const dotNextServerRootFiles = await glob(
      `${outputDirectory}/server/*`,
      entryPath
    );
    const nodeModules = excludeFiles(
      await glob('node_modules/**', entryPath),
      file => file.startsWith('node_modules/.cache')
    );
    const nextFiles = {
      ...nodeModules,
      ...dotNextRootFiles,
      ...dotNextServerRootFiles,
    };
    if (filesAfterBuild['next.config.js']) {
      nextFiles['next.config.js'] = filesAfterBuild['next.config.js'];
    }
    const pagesDir = path.join(
      entryPath,
      outputDirectory,
      'server',
      'static',
      buildId,
      'pages'
    );
    const { pages } = await getServerlessPages({
      pagesDir,
      entryPath,
      outputDirectory,
    });
    const launcherPath = path.join(__dirname, 'legacy-launcher.js');
    const launcherData = await readFile(launcherPath, 'utf8');

    await Promise.all(
      Object.keys(pages).map(async page => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');
        const launcher = launcherData.replace(
          'PATHNAME_PLACEHOLDER',
          `/${pathname.replace(/(^|\/)index$/, '')}`
        );

        const pageFiles = {
          [`${outputDirectory}/server/static/${buildId}/pages/_document.js`]:
            filesAfterBuild[
              `${outputDirectory}/server/static/${buildId}/pages/_document.js`
            ],
          [`${outputDirectory}/server/static/${buildId}/pages/_app.js`]:
            filesAfterBuild[
              `${outputDirectory}/server/static/${buildId}/pages/_app.js`
            ],
          [`${outputDirectory}/server/static/${buildId}/pages/_error.js`]:
            filesAfterBuild[
              `${outputDirectory}/server/static/${buildId}/pages/_error.js`
            ],
          [`${outputDirectory}/server/static/${buildId}/pages/${page}`]:
            filesAfterBuild[
              `${outputDirectory}/server/static/${buildId}/pages/${page}`
            ],
        };

        let lambdaOptions = {};
        if (config && config.functions) {
          lambdaOptions = await getLambdaOptionsFromFunction({
            sourceFile: await getSourceFilePathFromPage({
              workPath: entryPath,
              page,
            }),
            config,
          });
        }

        debug(`Creating serverless function for page: "${page}"...`);
        lambdas[path.posix.join(entryDirectory, pathname)] = new NodejsLambda({
          files: {
            ...nextFiles,
            ...pageFiles,
            '___next_launcher.cjs': new FileBlob({ data: launcher }),
          },
          handler: '___next_launcher.cjs',
          runtime: nodeVersion.runtime,
          ...lambdaOptions,
          operationType: 'Page', // always Page because we're in legacy mode
          shouldAddHelpers: false,
          shouldAddSourcemapSupport: false,
          supportsMultiPayloads: true,
          framework: {
            slug: 'nextjs',
            version: nextVersion,
          },
        });
        debug(`Created serverless function for page: "${page}"`);
      })
    );
  } else {
    debug('Preparing serverless function files...');
    const pagesDir = path.join(
      entryPath,
      outputDirectory,
      isServerMode ? 'server' : 'serverless',
      'pages'
    );

    let appDir: string | null = null;
    const appPathRoutesManifest = await readJSON(
      path.join(entryPath, outputDirectory, 'app-path-routes-manifest.json')
    ).catch(() => null);

    if (appPathRoutesManifest) {
      appDir = path.join(pagesDir, '../app');
    }

    const { pages, appPaths: lambdaAppPaths } = await getServerlessPages({
      pagesDir,
      entryPath,
      outputDirectory,
      appPathRoutesManifest,
    });

    /**
     * This is a detection for preview mode that's required for the pages
     * router.
     */
    const canUsePreviewMode = Object.keys(pages).some(page =>
      isApiPage(pages[page].fsPath)
    );
    const originalStaticPages = await glob('**/*.html', pagesDir);
    staticPages = filterStaticPages(
      originalStaticPages,
      dynamicPages,
      entryDirectory,
      htmlContentType,
      prerenderManifest,
      routesManifest
    );
    hasStatic500 = !!staticPages[path.posix.join(entryDirectory, '500')];

    // this can be either 404.html in latest versions
    // or _errors/404.html versions while this was experimental
    static404Page =
      staticPages[path.posix.join(entryDirectory, '404')] && hasPages404
        ? path.posix.join(entryDirectory, '404')
        : staticPages[path.posix.join(entryDirectory, '_errors/404')]
          ? path.posix.join(entryDirectory, '_errors/404')
          : undefined;

    const { i18n } = routesManifest || {};

    if (!static404Page && i18n) {
      static404Page = staticPages[
        path.posix.join(entryDirectory, i18n.defaultLocale, '404')
      ]
        ? path.posix.join(entryDirectory, i18n.defaultLocale, '404')
        : undefined;
    }

    if (!hasStatic500 && i18n) {
      hasStatic500 =
        !!staticPages[
          path.posix.join(entryDirectory, i18n.defaultLocale, '500')
        ];
    }

    if (routesManifest) {
      switch (routesManifest.version) {
        case 1:
        case 2:
        case 3:
        case 4: {
          if (routesManifest.dataRoutes) {
            // Load the /_next/data routes for both dynamic SSG and SSP pages.
            // These must be combined and sorted to prevent conflicts
            for (const dataRoute of routesManifest.dataRoutes) {
              const isOmittedRoute =
                prerenderManifest.omittedRoutes[dataRoute.page];

              const ssgDataRoute =
                isOmittedRoute ||
                prerenderManifest.fallbackRoutes[dataRoute.page] ||
                prerenderManifest.blockingFallbackRoutes[dataRoute.page];

              // we don't need to add routes for non-lazy SSG routes since
              // they have outputs which would override the routes anyways
              if (
                prerenderManifest.staticRoutes[dataRoute.page] ||
                (!(static404Page && canUsePreviewMode) && isOmittedRoute)
              ) {
                continue;
              }

              const route: RouteWithSrc & { dest: string } = {
                src: (
                  dataRoute.namedDataRouteRegex || dataRoute.dataRouteRegex
                ).replace(/^\^/, `^${appMountPrefixNoTrailingSlash}`),
                dest: path.posix.join(
                  '/',
                  entryDirectory,
                  // make sure to route SSG data route to the data prerender
                  // output, we don't do this for SSP routes since they don't
                  // have a separate data output
                  `${
                    (ssgDataRoute && ssgDataRoute.dataRoute) || dataRoute.page
                  }${
                    dataRoute.routeKeys
                      ? `?${Object.keys(dataRoute.routeKeys)
                          .map(key => `${dataRoute.routeKeys![key]}=$${key}`)
                          .join('&')}`
                      : ''
                  }`
                ),
              };

              if (!isServerMode) {
                route.check = true;
              }

              if (isOmittedRoute && isServerMode) {
                // only match this route when in preview mode so
                // preview works for non-prerender fallback: false pages
                (route as RouteWithSrc).has = [
                  {
                    type: 'cookie',
                    key: '__prerender_bypass',
                    value: prerenderManifest.bypassToken || undefined,
                  },
                  {
                    type: 'cookie',
                    key: '__next_preview_data',
                  },
                ];
              }

              const { i18n } = routesManifest;

              if (i18n) {
                const origSrc = route.src;
                route.src = route.src.replace(
                  // we need to double escape the build ID here
                  // to replace it properly
                  `/${escapedBuildId}/`,
                  `/${escapedBuildId}/(?${
                    ssgDataRoute || isServerMode ? '<nextLocale>' : ':'
                  }${i18n.locales
                    .map(locale => escapeStringRegexp(locale))
                    .join('|')})/`
                );

                // optional-catchall routes don't have slash between
                // build-id and the regex
                if (route.src === origSrc) {
                  route.src = route.src.replace(
                    // we need to double escape the build ID here
                    // to replace it properly
                    `/${escapedBuildId}`,
                    `/${escapedBuildId}/(?${
                      ssgDataRoute || isServerMode ? '<nextLocale>' : ':'
                    }${i18n.locales
                      .map(locale => escapeStringRegexp(locale))
                      .join('|')})[/]?`
                  );
                }

                // ensure root-most index data route doesn't end in index.json
                if (dataRoute.page === '/') {
                  route.src = route.src.replace(/\/index\.json/, '.json');
                }

                // make sure to route to the correct prerender output
                if (ssgDataRoute) {
                  route.dest = route.dest.replace(
                    `/${buildId}/`,
                    `/${buildId}/$nextLocale/`
                  );
                } else if (isServerMode) {
                  route.dest = route.dest.replace(
                    dataRoute.page,
                    `/$nextLocale${dataRoute.page}`
                  );
                }
              }
              dataRoutes.push(route);
            }
          }
          break;
        }
        default: {
          // update MIN_ROUTES_MANIFEST_VERSION in ./utils.ts
          throw new NowBuildError({
            code: 'NEXT_VERSION_OUTDATED',
            message:
              'This version of `@vercel/next` does not support the version of Next.js you are trying to deploy.\n' +
              'Please upgrade your `@vercel/next` builder and try again. Contact support if this continues to happen.',
          });
        }
      }
    }

    /**
     * All of the routes that have `experimentalPPR` enabled.
     */
    const experimentalPPRRoutes = new Set<string>();

    for (const [route, { renderingMode }] of [
      ...Object.entries(prerenderManifest.staticRoutes),
      ...Object.entries(prerenderManifest.blockingFallbackRoutes),
      ...Object.entries(prerenderManifest.fallbackRoutes),
      ...Object.entries(prerenderManifest.omittedRoutes),
    ]) {
      if (renderingMode !== RenderingMode.PARTIALLY_STATIC) continue;

      experimentalPPRRoutes.add(route);
    }

    const isAppPPREnabled = requiredServerFilesManifest
      ? requiredServerFilesManifest.config.experimental?.ppr === true ||
        requiredServerFilesManifest.config.experimental?.ppr === 'incremental'
      : false;

    if (requiredServerFilesManifest) {
      if (!routesManifest) {
        throw new Error(
          `A routes-manifest could not be located, please check your outputDirectory and try again.`
        );
      }

      const localePrefixed404 = !!(
        routesManifest.i18n &&
        originalStaticPages[
          path.posix.join('.', routesManifest.i18n.defaultLocale, '404.html')
        ]
      );

      return serverBuild({
        config,
        functionsConfigManifest,
        nextVersion,
        trailingSlash,
        appPathRoutesManifest,
        dynamicPages,
        canUsePreviewMode,
        staticPages,
        localePrefixed404,
        lambdaPages: pages,
        lambdaAppPaths,
        omittedPrerenderRoutes,
        isCorrectLocaleAPIRoutes,
        pagesDir,
        headers,
        beforeFilesRewrites,
        afterFilesRewrites,
        fallbackRewrites,
        workPath,
        redirects,
        nodeVersion,
        dynamicPrefix,
        routesManifest,
        imagesManifest,
        wildcardConfig,
        prerenderManifest,
        entryDirectory,
        entryPath,
        baseDir,
        dataRoutes,
        buildId,
        escapedBuildId,
        outputDirectory,
        trailingSlashRedirects,
        requiredServerFilesManifest,
        privateOutputs,
        hasIsr404Page,
        hasIsr500Page,
        variantsManifest,
        experimentalPPRRoutes,
        isAppPPREnabled,
      });
    }

    // > 1 because _error is a lambda but isn't used if a static 404 is available
    const pageKeys = Object.keys(pages);
    let hasLambdas = !static404Page || pageKeys.length > 1;

    if (pageKeys.length === 0) {
      const nextConfig = await getNextConfig(workPath, entryPath);

      if (nextConfig != null) {
        console.info('Found next.config.js:');
        console.info(nextConfig);
        console.info();
      }

      throw new NowBuildError({
        code: 'NEXT_NO_SERVERLESS_PAGES',
        message: 'No serverless pages were built',
        link: 'https://err.sh/vercel/vercel/now-next-no-serverless-pages-built',
      });
    }

    // Assume tracing to be safe, bail if we know we don't need it.
    let requiresTracing = hasLambdas;
    try {
      if (nextVersion && semver.lt(nextVersion, ExperimentalTraceVersion)) {
        debug(
          'Next.js version is too old for us to trace the required dependencies.\n' +
            'Assuming Next.js has handled it!'
        );
        requiresTracing = false;
      }
    } catch (err) {
      console.log(
        'Failed to check Next.js version for tracing compatibility: ' + err
      );
    }

    let assets:
      | undefined
      | {
          [filePath: string]: FileFsRef;
        };

    const nonLambdaSsgPages = new Set<string>();

    Object.keys(prerenderManifest.staticRoutes).forEach(route => {
      const result = onPrerenderRouteInitial(
        prerenderManifest,
        canUsePreviewMode,
        entryDirectory,
        nonLambdaSsgPages,
        route,
        hasPages404,
        routesManifest
      );

      if (result && result.static404Page) {
        static404Page = result.static404Page;
      }

      if (result && result.static500Page) {
        hasStatic500 = true;
      }
    });
    const pageTraces: {
      [page: string]: {
        [key: string]: FileFsRef;
      };
    } = {};
    const compressedPages: {
      [page: string]: PseudoFile;
    } = {};
    let tracedPseudoLayer: PseudoLayerResult | undefined;
    const apiPages: string[] = [];
    const nonApiPages: string[] = [];

    for (const page of pageKeys) {
      const pagePath = pages[page].fsPath;
      const route = `/${page.replace(/\.js$/, '')}`;

      if (route === '/_error' && static404Page) continue;

      if (isApiPage(pagePath)) {
        apiPages.push(page);
      } else if (!nonLambdaSsgPages.has(route)) {
        nonApiPages.push(page);
      }

      compressedPages[page] = (
        await createPseudoLayer({
          [page]: pages[page],
        })
      ).pseudoLayer[page] as PseudoFile;
    }
    const mergedPageKeys: string[] = [...nonApiPages, ...apiPages];

    if (requiresTracing) {
      hasLambdas =
        !static404Page || apiPages.length > 0 || nonApiPages.length > 0;

      const tracingLabel =
        'Traced Next.js serverless functions for external files in';

      if (hasLambdas) {
        console.time(tracingLabel);
      }

      const nftCache = Object.create(null);
      const lstatSema = new Sema(25);
      const lstatResults: { [key: string]: ReturnType<typeof lstat> } = {};
      const pathsToTrace = mergedPageKeys.map(page => pages[page].fsPath);

      const result = await nodeFileTrace(pathsToTrace, {
        base: baseDir,
        cache: nftCache,
        processCwd: entryPath,
      });
      result.esmFileList.forEach(file => result.fileList.add(file));

      const parentFilesMap = getFilesMapFromReasons(
        result.fileList,
        result.reasons
      );

      for (const page of mergedPageKeys) {
        const tracedFiles: { [key: string]: FileFsRef } = {};
        const fileList = parentFilesMap.get(
          path.relative(baseDir, pages[page].fsPath)
        );

        if (!fileList) {
          throw new Error(
            `Invariant: Failed to trace ${page}, missing fileList`
          );
        }
        const reasons = result.reasons;

        await Promise.all(
          Array.from(fileList).map(
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
      }

      // debug(`node-file-trace result:`, pageTraces);

      if (hasLambdas) {
        console.timeEnd(tracingLabel);
      }

      const zippingLabel = 'Compressed shared serverless function files';

      if (hasLambdas) {
        console.time(zippingLabel);
      }
      tracedPseudoLayer = await createPseudoLayer(
        mergedPageKeys.reduce((prev, page) => {
          Object.assign(prev, pageTraces[page]);
          return prev;
        }, {})
      );

      if (hasLambdas) {
        console.timeEnd(zippingLabel);
      }
    } else {
      // An optional assets folder that is placed alongside every page
      // entrypoint.
      // This is a legacy feature that was needed before we began tracing
      // lambdas.
      assets = await glob(
        'assets/**',
        path.join(entryPath, outputDirectory, 'serverless')
      );

      const assetKeys = Object.keys(assets);
      if (assetKeys.length > 0) {
        debug(
          'detected (legacy) assets to be bundled with serverless function:'
        );
        assetKeys.forEach(assetFile => debug(`\t${assetFile}`));
        debug(
          '\nPlease upgrade to Next.js 9.1 to leverage modern asset handling.'
        );
      }
    }

    const launcherPath = path.join(__dirname, 'templated-launcher.js');
    const launcherData = await readFile(launcherPath, 'utf8');
    const allLambdasLabel = `All serverless functions created in`;

    if (hasLambdas) {
      console.time(allLambdasLabel);
    }
    type LambdaGroup = {
      pages: {
        [outputName: string]: {
          pageName: string;
          pageFileName: string;
        };
      };
      pseudoLayer: PseudoLayer;
      isApiLambda: boolean;
      lambdaIdentifier: string;
      lambdaCombinedBytes: number;
    };
    const apiLambdaGroups: Array<LambdaGroup> = [];
    const pageLambdaGroups: Array<LambdaGroup> = [];

    if (isSharedLambdas) {
      const initialPageLambdaGroups = await getPageLambdaGroups({
        entryPath,
        config,
        functionsConfigManifest,
        pages: nonApiPages,
        prerenderRoutes: new Set(),
        pageTraces,
        compressedPages,
        tracedPseudoLayer: tracedPseudoLayer?.pseudoLayer || {},
        initialPseudoLayer: { pseudoLayer: {}, pseudoLayerBytes: 0 },
        initialPseudoLayerUncompressed: 0,
        // internal pages are already referenced in traces for serverless
        // like builds
        internalPages: [],
        experimentalPPRRoutes: undefined,
      });

      const initialApiLambdaGroups = await getPageLambdaGroups({
        entryPath,
        config,
        functionsConfigManifest,
        pages: apiPages,
        prerenderRoutes: new Set(),
        pageTraces,
        compressedPages,
        tracedPseudoLayer: tracedPseudoLayer?.pseudoLayer || {},
        initialPseudoLayer: { pseudoLayer: {}, pseudoLayerBytes: 0 },
        initialPseudoLayerUncompressed: 0,
        internalPages: [],
        experimentalPPRRoutes: undefined,
      });

      for (const group of initialApiLambdaGroups) {
        group.isApiLambda = true;
      }

      debug(
        JSON.stringify(
          {
            apiLambdaGroups: initialApiLambdaGroups.map(group => ({
              pages: group.pages,
              isPrerender: group.isPrerenders,
              pseudoLayerBytes: group.pseudoLayerBytes,
            })),
            pageLambdaGroups: initialPageLambdaGroups.map(group => ({
              pages: group.pages,
              isPrerender: group.isPrerenders,
              pseudoLayerBytes: group.pseudoLayerBytes,
            })),
          },
          null,
          2
        )
      );

      const combinedInitialLambdaGroups = [
        ...initialApiLambdaGroups,
        ...initialPageLambdaGroups,
      ];
      await detectLambdaLimitExceeding(
        combinedInitialLambdaGroups,
        compressedPages
      );

      let apiLambdaGroupIndex = 0;
      let nonApiLambdaGroupIndex = 0;

      for (const group of combinedInitialLambdaGroups) {
        let routeIsApi;

        for (const page of group.pages) {
          // These default pages don't have to be handled as they'd always 404
          if (['_app.js', '_document.js'].includes(page)) {
            continue;
          }

          // Don't add _error to lambda if we have a static 404 page or
          // pages404 is enabled and 404.js is present
          if (
            page === '_error.js' &&
            ((static404Page && staticPages[static404Page]) ||
              (hasPages404 && pages['404.js']))
          ) {
            continue;
          }

          const pageFileName = path.normalize(
            path.relative(workPath, pages[page].fsPath)
          );
          const pathname = page.replace(/\.js$/, '');
          const routeIsDynamic = isDynamicRoute(pathname);
          routeIsApi = isApiPage(pageFileName);

          if (routeIsDynamic) {
            dynamicPages.push(normalizePage(pathname));
          }

          if (nonLambdaSsgPages.has(`/${pathname}`)) {
            continue;
          }

          const outputName = path.join('/', entryDirectory, pathname);

          const lambdaGroupIndex = routeIsApi
            ? apiLambdaGroupIndex
            : nonApiLambdaGroupIndex;

          const lambdaGroups = routeIsApi ? apiLambdaGroups : pageLambdaGroups;
          const lastLambdaGroup = lambdaGroups[lambdaGroupIndex];
          let currentLambdaGroup = lastLambdaGroup;

          if (!currentLambdaGroup) {
            currentLambdaGroup = {
              pages: {},
              isApiLambda: !!routeIsApi,
              pseudoLayer: group.pseudoLayer,
              lambdaCombinedBytes: group.pseudoLayerBytes,
              lambdaIdentifier: path.join(
                entryDirectory,
                `__NEXT_${
                  routeIsApi ? 'API' : 'PAGE'
                }_LAMBDA_${lambdaGroupIndex}`
              ),
            };
          }

          const addPageLambdaRoute = (escapedOutputPath: string) => {
            const pageLambdaRoute: Route = {
              src: `^${escapedOutputPath.replace(
                /\/index$/,
                '(/|/index|)'
              )}/?$`,
              dest: `${path.join('/', currentLambdaGroup.lambdaIdentifier)}`,
              headers: {
                'x-nextjs-page': outputName,
              },
              check: true,
            };

            // we only need to add the additional routes if shared lambdas
            // is enabled
            if (routeIsDynamic) {
              dynamicPageLambdaRoutes.push(pageLambdaRoute);
              dynamicPageLambdaRoutesMap[outputName] = pageLambdaRoute;
            } else {
              pageLambdaRoutes.push(pageLambdaRoute);
            }
          };

          const { i18n } = routesManifest || {};

          if (i18n) {
            addPageLambdaRoute(
              `[/]?(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})?${escapeStringRegexp(outputName)}`
            );
          } else {
            addPageLambdaRoute(escapeStringRegexp(outputName));
          }

          if (page === '_error.js' || (hasPages404 && page === '404.js')) {
            page404Path = path.join('/', entryDirectory, pathname);
          }

          currentLambdaGroup.pages[outputName] = {
            pageFileName,
            pageName: page,
          };

          currentLambdaGroup.pseudoLayer[
            path.join(path.relative(baseDir, entryPath), pageFileName)
          ] = compressedPages[page];

          lambdaGroups[lambdaGroupIndex] = currentLambdaGroup;
        }

        if (routeIsApi) {
          apiLambdaGroupIndex++;
        } else {
          nonApiLambdaGroupIndex++;
        }
      }
    } else {
      await Promise.all(
        pageKeys.map(async page => {
          // These default pages don't have to be handled as they'd always 404
          if (['_app.js', '_document.js'].includes(page)) {
            return;
          }

          // Don't create _error lambda if we have a static 404 page or
          // pages404 is enabled and 404.js is present
          if (
            page === '_error.js' &&
            ((static404Page && staticPages[static404Page]) ||
              (hasPages404 && pages['404.js']))
          ) {
            return;
          }

          const pathname = page.replace(/\.js$/, '');

          if (isDynamicRoute(pathname)) {
            dynamicPages.push(normalizePage(pathname));
          }

          const pageFileName = path.normalize(
            path.relative(entryPath, pages[page].fsPath)
          );

          const launcher = launcherData.replace(
            /__LAUNCHER_PAGE_PATH__/g,
            JSON.stringify(requiresTracing ? `./${pageFileName}` : './page')
          );
          const launcherFiles: { [name: string]: FileFsRef | FileBlob } = {
            [path.join(
              path.relative(baseDir, entryPath),
              '___next_launcher.cjs'
            )]: new FileBlob({ data: launcher }),
          };
          let lambdaOptions: { memory?: number; maxDuration?: number } = {};

          if (config && config.functions) {
            lambdaOptions = await getLambdaOptionsFromFunction({
              sourceFile: await getSourceFilePathFromPage({
                workPath: entryPath,
                page,
              }),
              config,
            });
          }

          const outputName = normalizeIndexOutput(
            path.join(entryDirectory, pathname),
            isServerMode
          );

          if (requiresTracing) {
            lambdas[outputName] = await createLambdaFromPseudoLayers({
              files: launcherFiles,
              layers: [
                Object.keys(pageTraces[page] || {}).reduce((prev, cur) => {
                  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                  prev[cur] = tracedPseudoLayer?.pseudoLayer[cur]!;
                  return prev;
                }, {} as PseudoLayer),
                {
                  [path.join(path.relative(baseDir, entryPath), pageFileName)]:
                    compressedPages[page],
                } as PseudoLayer,
              ],
              handler: path.join(
                path.relative(baseDir, entryPath),
                '___next_launcher.cjs'
              ),
              operationType: getOperationType({
                prerenderManifest,
                pageFileName,
              }),
              runtime: nodeVersion.runtime,
              nextVersion,
              ...lambdaOptions,
            });
          } else {
            lambdas[outputName] = await createLambdaFromPseudoLayers({
              files: {
                ...launcherFiles,
                ...assets,
              },
              layers: [
                {
                  [path.join(path.relative(baseDir, entryPath), 'page.js')]:
                    compressedPages[page],
                } as PseudoLayer,
              ],
              handler: path.join(
                path.relative(baseDir, entryPath),
                '___next_launcher.cjs'
              ),
              operationType: getOperationType({ pageFileName }), // can only be API or Page
              runtime: nodeVersion.runtime,
              nextVersion,
              ...lambdaOptions,
            });
          }
        })
      );
    }

    dynamicRoutes = await getDynamicRoutes({
      entryPath,
      entryDirectory,
      dynamicPages,
      isDev: false,
      routesManifest,
      omittedRoutes: omittedPrerenderRoutes,
      canUsePreviewMode,
      bypassToken: prerenderManifest.bypassToken || '',
      isServerMode,
      isAppPPREnabled: false,
    }).then(arr =>
      localizeDynamicRoutes(
        arr,
        dynamicPrefix,
        entryDirectory,
        staticPages,
        prerenderManifest,
        routesManifest,
        isServerMode,
        isCorrectLocaleAPIRoutes
      )
    );

    if (isSharedLambdas) {
      const launcherPath = path.join(__dirname, 'templated-launcher-shared.js');
      const launcherData = await readFile(launcherPath, 'utf8');

      // we need to include the prerenderManifest.omittedRoutes here
      // for the page to be able to be matched in the lambda for preview mode
      const completeDynamicRoutes = await getDynamicRoutes({
        entryPath,
        entryDirectory,
        dynamicPages,
        isDev: false,
        routesManifest,
        omittedRoutes: undefined,
        canUsePreviewMode,
        bypassToken: prerenderManifest.bypassToken || '',
        isServerMode,
        isAppPPREnabled: false,
      }).then(arr =>
        arr.map(route => {
          route.src = route.src.replace('^', `^${dynamicPrefix}`);
          return route;
        })
      );

      await Promise.all(
        [...apiLambdaGroups, ...pageLambdaGroups].map(
          async function buildLambdaGroup(group) {
            const groupPageKeys = Object.keys(group.pages);

            const launcher = launcherData.replace(
              'let page = {};',
              `let page = {};
              const url = require('url');

              ${
                routesManifest?.i18n
                  ? `
                  function stripLocalePath(pathname) {
                  // first item will be empty string from splitting at first char
                  const pathnameParts = pathname.split('/')

                  ;(${JSON.stringify(
                    routesManifest.i18n.locales
                  )}).some((locale) => {
                    if (pathnameParts[1].toLowerCase() === locale.toLowerCase()) {
                      pathnameParts.splice(1, 1)
                      pathname = pathnameParts.join('/') || '/index'
                      return true
                    }
                    return false
                  })

                  return pathname
                }
                `
                  : `function stripLocalePath(pathname) { return pathname }`
              }

              page = function(req, res) {
                try {
                  const pages = {
                    ${groupPageKeys
                      .map(
                        page =>
                          `'${page}': () => require('./${path.join(
                            './',
                            group.pages[page].pageFileName
                          )}')`
                      )
                      .join(',\n')}
                    ${
                      '' /*
                      creates a mapping of the page and the page's module e.g.
                      '/about': () => require('./.next/serverless/pages/about.js')
                    */
                    }
                  }
                  let toRender = req.headers['x-nextjs-page']

                  if (!toRender) {
                    try {
                      const { pathname } = url.parse(req.url)
                      toRender = stripLocalePath(pathname).replace(/\\/$/, '') || '/index'
                    } catch (_) {
                      // handle failing to parse url
                      res.statusCode = 400
                      return res.end('Bad Request')
                    }
                  }

                  let currentPage = pages[toRender]

                  if (
                    toRender &&
                    !currentPage
                  ) {
                    if (toRender.includes('/_next/data')) {
                      toRender = toRender
                        .replace(new RegExp('/_next/data/${escapedBuildId}/'), '/')
                        .replace(/\\.json$/, '')

                      toRender = stripLocalePath(toRender) || '/index'
                      currentPage = pages[toRender]
                    }

                    if (!currentPage) {
                      // for prerendered dynamic routes (/blog/post-1) we need to
                      // find the match since it won't match the page directly
                      const dynamicRoutes = ${JSON.stringify(
                        completeDynamicRoutes.map(route => ({
                          src: route.src,
                          dest: route.dest,
                        }))
                      )}

                      for (const route of dynamicRoutes) {
                        const matcher = new RegExp(route.src)

                        if (matcher.test(toRender)) {
                          toRender = url.parse(route.dest).pathname
                          currentPage = pages[toRender]
                          break
                        }
                      }
                    }
                  }

                  if (!currentPage) {
                    console.error(
                      "pages in lambda:",
                      Object.keys(pages),
                      "page header received:",
                      req.headers["x-nextjs-page"]
                    );
                    throw new Error(
                      "Failed to find matching page in lambda for: " +
                        JSON.stringify(
                          {
                            toRender,
                            url: req.url,
                            header: req.headers["x-nextjs-page"],
                          },
                          null,
                          2
                        )
                    );
                  }

                  const mod = currentPage()
                  const method = mod.render || mod.default || mod

                  return method(req, res)
                } catch (err) {
                  console.error('Unhandled error during request:', err)
                  throw err
                }
              }
              `
            );
            const launcherFiles: { [name: string]: FileFsRef | FileBlob } = {
              [path.join(
                path.relative(baseDir, entryPath),
                '___next_launcher.cjs'
              )]: new FileBlob({ data: launcher }),
            };

            for (const page of groupPageKeys) {
              pageLambdaMap[page] = group.lambdaIdentifier;
            }

            const operationType = getOperationType({
              group,
              prerenderManifest,
            });

            lambdas[group.lambdaIdentifier] =
              await createLambdaFromPseudoLayers({
                files: {
                  ...launcherFiles,
                  ...assets,
                },
                layers: [group.pseudoLayer],
                handler: path.join(
                  path.relative(baseDir, entryPath),
                  '___next_launcher.cjs'
                ),
                operationType,
                runtime: nodeVersion.runtime,
                nextVersion,
              });
          }
        )
      );
    }

    if (hasLambdas) {
      console.timeEnd(allLambdasLabel);
    }
    const prerenderRoute = onPrerenderRoute({
      appDir,
      pagesDir,
      hasPages404,
      static404Page,
      pageLambdaMap,
      lambdas,
      experimentalStreamingLambdaPaths: undefined,
      isServerMode,
      prerenders,
      entryDirectory,
      routesManifest,
      prerenderManifest,
      appPathRoutesManifest,
      isSharedLambdas,
      canUsePreviewMode,
      isAppPPREnabled: false,
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

    // We still need to use lazyRoutes if the dataRoutes field
    // isn't available for backwards compatibility
    if (!(routesManifest && routesManifest.dataRoutes)) {
      // Dynamic pages for lazy routes should be handled by the lambda flow.
      [
        ...Object.entries(prerenderManifest.fallbackRoutes),
        ...Object.entries(prerenderManifest.blockingFallbackRoutes),
      ].forEach(
        ([
          ,
          {
            dataRouteRegex,
            dataRoute,
            prefetchDataRouteRegex,
            prefetchDataRoute,
          },
        ]) => {
          if (!dataRoute || !dataRouteRegex) return;

          dataRoutes.push({
            // Next.js provided data route regex
            src: dataRouteRegex.replace(
              /^\^/,
              `^${appMountPrefixNoTrailingSlash}`
            ),
            // Location of lambda in builder output
            dest: path.posix.join(entryDirectory, dataRoute),
            check: true,
          });

          if (!prefetchDataRoute || !prefetchDataRouteRegex) return;

          dataRoutes.push({
            src: prefetchDataRouteRegex.replace(
              /^\^/,
              `^${appMountPrefixNoTrailingSlash}`
            ),
            dest: path.posix.join(entryDirectory, prefetchDataRoute),
            check: true,
          });
        }
      );
    }
  }

  if (!isSharedLambdas) {
    // We need to delete lambdas from output instead of omitting them from the
    // start since we rely on them for powering Preview Mode (read above in
    // onPrerenderRoute).
    omittedPrerenderRoutes.forEach(routeKey => {
      // Get the route file as it'd be mounted in the builder output
      const routeFileNoExt = path.posix.join(
        entryDirectory,
        routeKey === '/' ? '/index' : routeKey
      );
      if (typeof lambdas[routeFileNoExt] === undefined) {
        throw new NowBuildError({
          code: 'NEXT__UNKNOWN_ROUTE_KEY',
          message: `invariant: unknown lambda ${routeKey} (lookup: ${routeFileNoExt}) | please report this immediately`,
        });
      }
      delete lambdas[routeFileNoExt];
    });
  }
  const mergedDataRoutesLambdaRoutes = [];
  const mergedDynamicRoutesLambdaRoutes = [];

  if (isSharedLambdas) {
    // we need to define the page lambda route immediately after
    // the dynamic route in handle: 'rewrite' so that a matching
    // dynamic route doesn't catch it before the page lambda route
    // e.g. /teams/[team]/[inviteCode] -> page lambda
    // but we also have /[teamSlug]/[project]/[id] which could match it first

    for (let i = 0; i < dynamicRoutes.length; i++) {
      const route = dynamicRoutes[i];

      mergedDynamicRoutesLambdaRoutes.push(route);

      const { pathname } = url.parse(route.dest!);

      if (pathname && pageLambdaMap[pathname]) {
        mergedDynamicRoutesLambdaRoutes.push(
          dynamicPageLambdaRoutesMap[pathname]
        );
      }
    }

    for (let i = 0; i < dataRoutes.length; i++) {
      const route = dataRoutes[i];

      mergedDataRoutesLambdaRoutes.push(route);

      const { pathname } = url.parse(route.dest!);

      if (
        pathname &&
        pageLambdaMap[pathname] &&
        dynamicPageLambdaRoutesMap[pathname]
      ) {
        mergedDataRoutesLambdaRoutes.push(dynamicPageLambdaRoutesMap[pathname]);
      }
    }
  }

  const { staticFiles, publicDirectoryFiles, staticDirectoryFiles } =
    await getStaticFiles(entryPath, entryDirectory, outputDirectory);

  const { i18n } = routesManifest || {};

  return {
    output: {
      ...publicDirectoryFiles,
      ...lambdas,
      // Prerenders may override Lambdas -- this is an intentional behavior.
      ...prerenders,
      ...staticPages,
      ...staticFiles,
      ...staticDirectoryFiles,
      ...privateOutputs.files,
    },
    wildcard: wildcardConfig,
    images: getImagesConfig(imagesManifest),
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
    routes: [
      // force trailingSlashRedirect to the very top so it doesn't
      // conflict with i18n routes that don't have or don't have the
      // trailing slash
      ...trailingSlashRedirects,

      ...privateOutputs.routes,

      ...(i18n
        ? [
            // Handle auto-adding current default locale to path based on
            // $wildcard
            {
              src: `^${path.join(
                '/',
                entryDirectory,
                '/'
              )}(?!(?:_next/.*|${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(?:/.*|$))(.*)$`,
              // we aren't able to ensure trailing slash mode here
              // so ensure this comes after the trailing slash redirect
              dest: `${
                entryDirectory !== '.' ? path.join('/', entryDirectory) : ''
              }$wildcard/$1`,
              continue: true,
            },

            // Handle redirecting to locale specific domains
            ...(i18n.domains &&
            i18n.domains.length > 0 &&
            i18n.localeDetection !== false
              ? [
                  {
                    src: `^${path.join('/', entryDirectory)}/?(?:${i18n.locales
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
              src: `^${path.join('/', entryDirectory)}$`,
              dest: `${path.join('/', entryDirectory, i18n.defaultLocale)}`,
              continue: true,
            },

            // Auto-prefix non-locale path with default locale
            // note for prerendered pages this will cause
            // x-now-route-matches to contain the path minus the locale
            // e.g. for /de/posts/[slug] x-now-route-matches would have
            // 1=posts%2Fpost-1
            {
              src: `^${path.join(
                '/',
                entryDirectory,
                '/'
              )}(?!(?:_next/.*|${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})(?:/.*|$))(.*)$`,
              dest: `${path.join('/', entryDirectory, i18n.defaultLocale)}/$1`,
              continue: true,
            },
          ]
        : []),

      ...headers,

      ...redirects,

      ...beforeFilesRewrites,

      // Make sure to 404 for the /404 path itself
      ...(i18n
        ? [
            {
              src: `${path.join('/', entryDirectory, '/')}(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})?[/]?404/?`,
              status: 404,
              continue: true,
            },
          ]
        : [
            {
              src: path.join('/', entryDirectory, '404/?'),
              status: 404,
              continue: true,
            },
          ]),

      // Make sure to 500 when visiting /500 directly for static 500
      ...(!hasStatic500
        ? []
        : i18n
          ? [
              {
                src: `${path.join('/', entryDirectory, '/')}(?:${i18n.locales
                  .map(locale => escapeStringRegexp(locale))
                  .join('|')})?[/]?500`,
                status: 500,
                continue: true,
              },
            ]
          : [
              {
                src: path.join('/', entryDirectory, '500'),
                status: 500,
                continue: true,
              },
            ]),

      // Next.js page lambdas, `static/` folder, reserved assets, and `public/`
      // folder
      { handle: 'filesystem' },

      // map pages to their lambda
      ...pageLambdaRoutes.filter(route => {
        // filter out any SSG pages as they are already present in output
        if ('headers' in route) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          let page = route.headers?.['x-nextjs-page']!;
          page = page === '/index' ? '/' : page;

          if (prerenders[page]) {
            return false;
          }
        }
        return true;
      }),

      // ensure the basePath prefixed _next/image is rewritten to the root
      // _next/image path
      ...(routesManifest?.basePath
        ? [
            {
              src: path.join('/', entryDirectory, '_next/image/?'),
              dest: '/_next/image',
              check: true,
            },
          ]
        : []),

      // No-op _next/data rewrite to trigger handle: 'rewrites' and then 404
      // if no match to prevent rewriting _next/data unexpectedly
      {
        src: path.join('/', entryDirectory, '_next/data/(.*)'),
        dest: path.join('/', entryDirectory, '_next/data/$1'),
        check: true,
      },

      // These need to come before handle: miss or else they are grouped
      // with that routing section
      ...afterFilesRewrites,

      // make sure 404 page is used when a directory is matched without
      // an index page
      { handle: 'resource' },

      ...fallbackRewrites,

      { src: path.join('/', entryDirectory, '.*'), status: 404 },

      // We need to make sure to 404 for /_next after handle: miss since
      // handle: miss is called before rewrites and to prevent rewriting /_next
      { handle: 'miss' },
      {
        src: path.join(
          '/',
          entryDirectory,
          '_next/static/(?:[^/]+/pages|pages|chunks|runtime|css|image|media)/.+'
        ),
        status: 404,
        check: true,
        dest: '$0',
      },

      // remove locale prefixes to check public files
      ...(i18n
        ? [
            {
              src: `^${path.join('/', entryDirectory)}/?(?:${i18n.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})/(.*)`,
              dest: `${path.join('/', entryDirectory, '/')}$1`,
              check: true,
            },
          ]
        : []),

      // for non-shared lambdas remove locale prefix if present
      // to allow checking for lambda
      ...(isSharedLambdas || !i18n
        ? []
        : [
            {
              src: `${path.join('/', entryDirectory, '/')}(?:${i18n?.locales
                .map(locale => escapeStringRegexp(locale))
                .join('|')})/(.*)`,
              dest: '/$1',
              check: true,
            },
          ]),

      // routes that are called after each rewrite or after routes
      // if there no rewrites
      { handle: 'rewrite' },

      // /_next/data routes for getServerProps/getStaticProps pages
      ...(isSharedLambdas ? mergedDataRoutesLambdaRoutes : dataRoutes),

      // ensure we 404 for non-existent _next/data routes before
      // trying page dynamic routes
      {
        src: path.join('/', entryDirectory, '_next/data/(.*)'),
        dest: path.join('/', entryDirectory, '404'),
        status: 404,
        check: true,
      },

      // re-check page routes to map them to the lambda
      ...pageLambdaRoutes,

      // Dynamic routes (must come after dataRoutes as dataRoutes are more
      // specific)
      ...(isSharedLambdas ? mergedDynamicRoutesLambdaRoutes : dynamicRoutes),

      // routes to call after a file has been matched
      { handle: 'hit' },
      // Before we handle static files we need to set proper caching headers
      {
        // This ensures we only match known emitted-by-Next.js files and not
        // user-emitted files which may be missing a hash in their filename.
        src: path.join(
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

      // error handling
      ...(isLegacy
        ? []
        : [
            // Custom Next.js 404 page
            { handle: 'error' } as RouteWithHandle,

            ...(i18n && (static404Page || hasIsr404Page)
              ? [
                  {
                    src: `${path.join(
                      '/',
                      entryDirectory,
                      '/'
                    )}(?<nextLocale>${i18n.locales
                      .map(locale => escapeStringRegexp(locale))
                      .join('|')})(/.*|$)`,
                    dest: '/$nextLocale/404',
                    status: 404,
                    caseSensitive: true,
                  },
                  {
                    src: path.join('/', entryDirectory, '.*'),
                    dest: `/${i18n.defaultLocale}/404`,
                    status: 404,
                  },
                ]
              : [
                  isSharedLambdas
                    ? {
                        src: path.join('/', entryDirectory, '.*'),
                        // if static 404 is not present but we have pages/404.js
                        // it is a lambda due to _app getInitialProps
                        dest: path.join(
                          '/',
                          (static404Page
                            ? static404Page
                            : pageLambdaMap[page404Path]) as string
                        ),

                        status: 404,
                        ...(static404Page
                          ? {}
                          : {
                              headers: {
                                'x-nextjs-page': page404Path,
                              },
                            }),
                      }
                    : {
                        src: path.join('/', entryDirectory, '.*'),
                        // if static 404 is not present but we have pages/404.js
                        // it is a lambda due to _app getInitialProps
                        dest: static404Page
                          ? path.join('/', static404Page)
                          : path.join(
                              '/',
                              entryDirectory,
                              hasPages404 &&
                                lambdas[path.join('./', entryDirectory, '404')]
                                ? '404'
                                : '_error'
                            ),
                        status: 404,
                      },
                ]),

            // static 500 page if present
            ...(!hasStatic500
              ? []
              : i18n
                ? [
                    {
                      src: `${path.join(
                        '/',
                        entryDirectory,
                        '/'
                      )}(?<nextLocale>${i18n.locales
                        .map(locale => escapeStringRegexp(locale))
                        .join('|')})(/.*|$)`,
                      dest: '/$nextLocale/500',
                      status: 500,
                    },
                    {
                      src: path.join('/', entryDirectory, '.*'),
                      dest: `/${i18n.defaultLocale}/500`,
                      status: 500,
                    },
                  ]
                : [
                    {
                      src: path.join('/', entryDirectory, '.*'),
                      dest: path.join('/', entryDirectory, '/500'),
                      status: 500,
                    },
                  ]),
          ]),
    ],
    framework: { version: nextVersion },
  };
};

export const diagnostics: Diagnostics = async ({
  config,
  entrypoint,
  workPath,
  repoRootPath,
}) => {
  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);
  const outputDirectory = path.join('./', config.outputDirectory || '.next');
  const basePath = repoRootPath || workPath;
  const diagnosticsEntrypoint = path.relative(basePath, entryPath);

  debug(
    `Reading diagnostics file in diagnosticsEntrypoint=${diagnosticsEntrypoint}`
  );

  return {
    // Collect output in `.next/diagnostics`
    ...(await glob(
      '*',
      path.join(basePath, diagnosticsEntrypoint, outputDirectory, 'diagnostics')
    )),
    // Collect `.next/trace` file
    ...(await glob(
      'trace',
      path.join(basePath, diagnosticsEntrypoint, outputDirectory)
    )),
  };
};

export const prepareCache: PrepareCache = async ({
  workPath,
  repoRootPath,
  entrypoint,
  config = {},
}) => {
  debug('Preparing cache...');
  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);
  const outputDirectory = path.join('./', config.outputDirectory || '.next');

  const nextVersionRange = await getNextVersionRange(entryPath);
  const isLegacy = nextVersionRange && isLegacyNext(nextVersionRange);

  if (isLegacy) {
    // skip caching legacy mode (swapping deps between all and production can get bug-prone)
    return {};
  }

  debug('Producing cache file manifest...');

  // for monorepos we want to cache all node_modules
  const isMonorepo = repoRootPath && repoRootPath !== workPath;
  const cacheBasePath = repoRootPath || workPath;
  const cacheEntrypoint = path.relative(cacheBasePath, entryPath);
  const cache = {
    ...(await glob(
      isMonorepo
        ? '**/node_modules/**'
        : path.join(cacheEntrypoint, 'node_modules/**'),
      cacheBasePath
    )),
    ...(await glob(
      path.join(cacheEntrypoint, outputDirectory, 'cache/**'),
      cacheBasePath
    )),
  };

  debug('Cache file manifest produced');
  return cache;
};
