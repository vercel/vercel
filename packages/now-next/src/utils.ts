import { FileFsRef, Files } from '@vercel/build-utils';
import { NowHeader, NowRewrite, Route, Source } from '@vercel/routing-utils';
import { Sema } from 'async-sema';
import crc32 from 'buffer-crc32';
import fs from 'fs-extra';
import path from 'path';
import resolveFrom from 'resolve-from';
import semver from 'semver';
import { ZipFile } from 'yazl';
import zlib from 'zlib';
import buildUtils from './build-utils';
const { streamToBuffer, Lambda, NowBuildError, isSymbolicLink } = buildUtils;

type stringMap = { [key: string]: string };

export interface EnvConfig {
  [name: string]: string | undefined;
}

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
 * Exclude package manager lockfiles from files
 */
function excludeLockFiles(files: Files): Files {
  const newFiles = files;
  if (newFiles['package-lock.json']) {
    delete newFiles['package-lock.json'];
  }
  if (newFiles['yarn.lock']) {
    delete newFiles['yarn.lock'];
  }
  return files;
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

function pathIsInside(firstPath: string, secondPath: string) {
  return !path.relative(firstPath, secondPath).startsWith('..');
}

function getPathsInside(entryDirectory: string, files: Files) {
  const watch: string[] = [];

  for (const file of Object.keys(files)) {
    // If the file is outside of the entrypoint directory, we do
    // not want to monitor it for changes.
    if (!pathIsInside(entryDirectory, file)) {
      continue;
    }

    watch.push(file);
  }

  return watch;
}

function normalizePage(page: string): string {
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`;
  }
  // remove '/index' from the end
  page = page.replace(/\/index$/, '/');
  return page;
}

async function getRoutes(
  entryPath: string,
  entryDirectory: string,
  pathsInside: string[],
  files: Files,
  url: string
): Promise<Route[]> {
  let pagesDir = '';
  const filesInside: Files = {};
  const prefix = entryDirectory === `.` ? `/` : `/${entryDirectory}/`;
  const fileKeys = Object.keys(files);

  for (const file of fileKeys) {
    if (!pathsInside.includes(file)) {
      continue;
    }

    if (!pagesDir) {
      if (file.startsWith(path.join(entryDirectory, 'pages'))) {
        pagesDir = 'pages';
      }
    }

    filesInside[file] = files[file];
  }

  // If default pages dir isn't found check for `src/pages`
  if (
    !pagesDir &&
    fileKeys.some(file =>
      file.startsWith(path.join(entryDirectory, 'src/pages'))
    )
  ) {
    pagesDir = 'src/pages';
  }

  const routes: Route[] = [
    {
      src: `${prefix}_next/(.*)`,
      dest: `${url}/_next/$1`,
    },
    {
      src: `${prefix}static/(.*)`,
      dest: `${url}/static/$1`,
    },
  ];
  const filePaths = Object.keys(filesInside);
  const dynamicPages = [];

  for (const file of filePaths) {
    const relativePath = path.relative(entryDirectory, file);
    const isPage = pathIsInside(pagesDir, relativePath);

    if (!isPage) {
      continue;
    }

    const relativeToPages = path.relative(pagesDir, relativePath);
    const extension = path.extname(relativeToPages);
    const pageName = relativeToPages.replace(extension, '').replace(/\\/g, '/');

    if (pageName.startsWith('_')) {
      continue;
    }

    if (isDynamicRoute(pageName)) {
      dynamicPages.push(normalizePage(pageName));
      continue;
    }

    routes.push({
      src: `${prefix}${pageName}`,
      dest: `${url}/${pageName}`,
    });

    if (pageName.endsWith('index')) {
      const resolvedIndex = pageName.replace('/index', '').replace('index', '');

      routes.push({
        src: `${prefix}${resolvedIndex}`,
        dest: `${url}/${resolvedIndex}`,
      });
    }
  }

  routes.push(
    ...(await getDynamicRoutes(
      entryPath,
      entryDirectory,
      dynamicPages,
      true
    ).then(arr =>
      arr.map((route: Source) => {
        // convert to make entire RegExp match as one group
        route.src = route.src
          .replace('^', `^${prefix}(`)
          .replace('(\\/', '(')
          .replace('$', ')$');
        route.dest = `${url}/$1`;
        return route;
      })
    ))
  );

  // Add public folder routes
  for (const file of filePaths) {
    const relativePath = path.relative(entryDirectory, file);
    const isPublic = pathIsInside('public', relativePath);

    if (!isPublic) continue;

    const fileName = path.relative('public', relativePath);
    const route: Source = {
      src: `${prefix}${fileName}`,
      dest: `${url}/${fileName}`,
    };

    // Only add the route if a page is not already using it
    if (!routes.some(r => (r as Source).src === route.src)) {
      routes.push(route);
    }
  }

  return routes;
}

// TODO: update to use type from `@vercel/routing-utils` after
// adding permanent: true/false handling
export type Redirect = NowRewrite & {
  statusCode?: number;
  permanent?: boolean;
};

type RoutesManifestRegex = {
  regex: string;
  regexKeys: string[];
};

export type RoutesManifest = {
  pages404: boolean;
  basePath: string | undefined;
  redirects: (Redirect & RoutesManifestRegex)[];
  rewrites: (NowRewrite & RoutesManifestRegex)[];
  headers?: (NowHeader & RoutesManifestRegex)[];
  dynamicRoutes: {
    page: string;
    regex: string;
    namedRegex?: string;
    routeKeys?: { [named: string]: string };
  }[];
  version: number;
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
};

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
      message:
        `A "routes-manifest.json" couldn't be found. This is normally caused by a misconfiguration in your project.\n` +
        'Please check the following, and reach out to support if you cannot resolve the problem:\n' +
        '  1. If present, be sure your `build` script in "package.json" calls `next build`.' +
        '  2. Navigate to your project\'s settings in the Vercel dashboard, and verify that the "Build Command" is not overridden, or that it calls `next build`.' +
        '  3. Navigate to your project\'s settings in the Vercel dashboard, and verify that the "Output Directory" is not overridden. Note that `next export` does **not** require you change this setting, even if you customize the `next export` output directory.',
      link: 'https://err.sh/vercel/vercel/now-next-routes-manifest',
      code: 'NEXT_NO_ROUTES_MANIFEST',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const routesManifest: RoutesManifest = require(pathRoutesManifest);

  // remove temporary array based routeKeys from v1/v2 of routes
  // manifest since it can result in invalid routes
  for (const route of routesManifest.dataRoutes || []) {
    if (Array.isArray(route.routeKeys)) {
      delete route.routeKeys;
      delete route.namedDataRouteRegex;
    }
  }
  for (const route of routesManifest.dynamicRoutes || []) {
    if (Array.isArray(route.routeKeys)) {
      delete route.routeKeys;
      delete route.namedRegex;
    }
  }

  return routesManifest;
}

export async function getDynamicRoutes(
  entryPath: string,
  entryDirectory: string,
  dynamicPages: string[],
  isDev?: boolean,
  routesManifest?: RoutesManifest,
  omittedRoutes?: Set<string>
): Promise<Source[]> {
  if (!dynamicPages.length) {
    return [];
  }

  if (routesManifest) {
    switch (routesManifest.version) {
      case 1:
      case 2: {
        return routesManifest.dynamicRoutes
          .filter(({ page }) =>
            omittedRoutes ? !omittedRoutes.has(page) : true
          )
          .map(({ page, regex }: { page: string; regex: string }) => {
            return {
              src: regex,
              dest: !isDev ? path.join('/', entryDirectory, page) : page,
              check: true,
            };
          });
      }
      case 3: {
        return routesManifest.dynamicRoutes
          .filter(({ page }) =>
            omittedRoutes ? !omittedRoutes.has(page) : true
          )
          .map(({ page, namedRegex, regex, routeKeys }) => {
            return {
              src: namedRegex || regex,
              dest: `${!isDev ? path.join('/', entryDirectory, page) : page}${
                routeKeys
                  ? `?${Object.keys(routeKeys)
                      .map(key => `${routeKeys[key]}=$${key}`)
                      .join('&')}`
                  : ''
              }`,
              check: true,
            };
          });
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
  let getRouteRegex:
    | ((pageName: string) => { re: RegExp })
    | undefined = undefined;

  let getSortedRoutes: ((normalizedPages: string[]) => string[]) | undefined;

  try {
    ({ getRouteRegex, getSortedRoutes } = require(resolveFrom(
      entryPath,
      'next-server/dist/lib/router/utils'
    )));
    if (typeof getRouteRegex !== 'function') {
      getRouteRegex = undefined;
    }
  } catch (_) {} // eslint-disable-line no-empty

  if (!getRouteRegex || !getSortedRoutes) {
    try {
      ({ getRouteRegex, getSortedRoutes } = require(resolveFrom(
        entryPath,
        'next/dist/next-server/lib/router/utils'
      )));
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

  const routes: Source[] = [];
  pageMatchers.forEach(pageMatcher => {
    // in `vercel dev` we don't need to prefix the destination
    const dest = !isDev
      ? path.join('/', entryDirectory, pageMatcher.pageName)
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

type LoaderKey = 'imgix' | 'cloudinary' | 'akamai' | 'default';

type ImagesManifest = {
  version: number;
  images: {
    loader: LoaderKey;
    sizes: number[];
    domains: string[];
  };
};

export async function getImagesManifest(
  entryPath: string,
  outputDirectory: string
): Promise<ImagesManifest | undefined> {
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

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const imagesManifest: ImagesManifest = require(pathImagesManifest);
  return imagesManifest;
}

function syncEnvVars(base: EnvConfig, removeEnv: EnvConfig, addEnv: EnvConfig) {
  // Remove any env vars from `removeEnv`
  // that are not present in the `addEnv`
  const addKeys = new Set(Object.keys(addEnv));
  for (const name of Object.keys(removeEnv)) {
    if (!addKeys.has(name)) {
      delete base[name];
    }
  }

  // Add in the keys from `addEnv`
  Object.assign(base, addEnv);
}

export const ExperimentalTraceVersion = `9.0.4-canary.1`;

export type PseudoLayer = {
  [fileName: string]: PseudoFile | PseudoSymbolicLink;
};

export type PseudoFile = {
  isSymlink: false;
  crc32: number;
  compBuffer: Buffer;
  uncompressedSize: number;
  mode: number;
};

export type PseudoSymbolicLink = {
  isSymlink: true;
  file: FileFsRef;
  symlinkTarget: string;
};

const compressBuffer = (buf: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    zlib.deflateRaw(
      buf,
      { level: zlib.constants.Z_BEST_COMPRESSION },
      (err, compBuf) => {
        if (err) return reject(err);
        resolve(compBuf);
      }
    );
  });
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
      const compBuffer = await compressBuffer(origBuffer);
      pseudoLayerBytes += compBuffer.byteLength;
      pseudoLayer[fileName] = {
        compBuffer,
        isSymlink: false,
        crc32: crc32.unsigned(origBuffer),
        uncompressedSize: origBuffer.byteLength,
        mode: file.mode,
      };
    }
  }

  return { pseudoLayer, pseudoLayerBytes };
}

interface CreateLambdaFromPseudoLayersOptions {
  files: Files;
  layers: PseudoLayer[];
  handler: string;
  runtime: string;
  memory?: number;
  maxDuration?: number;
  environment?: { [name: string]: string };
}

// measured with 1, 2, 5, 10, and `os.cpus().length || 5`
// and sema(1) produced the best results
const createLambdaSema = new Sema(1);

export async function createLambdaFromPseudoLayers({
  files,
  layers,
  handler,
  runtime,
  memory,
  maxDuration,
  environment = {},
}: CreateLambdaFromPseudoLayersOptions) {
  await createLambdaSema.acquire();
  const zipFile = new ZipFile();
  const addedFiles = new Set();

  const names = Object.keys(files).sort();
  const symlinkTargets = new Map<string, string>();

  for (const name of names) {
    const file = files[name];
    if (file.mode && isSymbolicLink(file.mode) && file.type === 'FileFsRef') {
      const symlinkTarget = await fs.readlink((file as FileFsRef).fsPath);
      symlinkTargets.set(name, symlinkTarget);
    }
  }

  // apply pseudo layers (already compressed objects)
  for (const layer of layers) {
    for (const seedKey of Object.keys(layer)) {
      const item = layer[seedKey];

      if (item.isSymlink) {
        const { symlinkTarget, file } = item;

        zipFile.addBuffer(Buffer.from(symlinkTarget, 'utf8'), seedKey, {
          mode: file.mode,
        });
        continue;
      }

      const { compBuffer, crc32, uncompressedSize, mode } = item;

      // @ts-ignore: `addDeflatedBuffer` is a valid function, but missing on the type
      zipFile.addDeflatedBuffer(compBuffer, seedKey, {
        crc32,
        uncompressedSize,
        mode: mode,
      });

      addedFiles.add(seedKey);
    }
  }

  for (const fileName of Object.keys(files)) {
    // was already added in a pseudo layer
    if (addedFiles.has(fileName)) continue;
    const file = files[fileName];
    const symlinkTarget = symlinkTargets.get(fileName);

    if (typeof symlinkTarget === 'string') {
      zipFile.addBuffer(Buffer.from(symlinkTarget, 'utf8'), fileName, {
        mode: file.mode,
      });
    } else {
      const fileBuffer = await streamToBuffer(file.toStream());
      zipFile.addBuffer(fileBuffer, fileName);
    }
  }
  zipFile.end();

  const zipBuffer = await streamToBuffer(zipFile.outputStream);
  createLambdaSema.release();

  return new Lambda({
    handler,
    runtime,
    zipBuffer,
    memory,
    maxDuration,
    environment,
  });
}

export type NextPrerenderedRoutes = {
  bypassToken: string | null;

  staticRoutes: {
    [route: string]: {
      initialRevalidate: number | false;
      dataRoute: string;
      srcRoute: string | null;
    };
  };

  blockingFallbackRoutes: {
    [route: string]: {
      routeRegex: string;
      dataRoute: string;
      dataRouteRegex: string;
    };
  };

  fallbackRoutes: {
    [route: string]: {
      fallback: string;
      routeRegex: string;
      dataRoute: string;
      dataRouteRegex: string;
    };
  };

  omittedRoutes: string[];

  notFoundRoutes: string[];
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
      omittedRoutes: [],
      notFoundRoutes: [],
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
        version: 2;
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
        omittedRoutes: [],
        notFoundRoutes: [],
      };

      routes.forEach(route => {
        const {
          initialRevalidateSeconds,
          dataRoute,
          srcRoute,
        } = manifest.routes[route];
        ret.staticRoutes[route] = {
          initialRevalidate:
            initialRevalidateSeconds === false
              ? false
              : Math.max(1, initialRevalidateSeconds),
          dataRoute,
          srcRoute,
        };
      });

      lazyRoutes.forEach(lazyRoute => {
        const {
          routeRegex,
          fallback,
          dataRoute,
          dataRouteRegex,
        } = manifest.dynamicRoutes[lazyRoute];

        if (fallback) {
          ret.fallbackRoutes[lazyRoute] = {
            routeRegex,
            fallback,
            dataRoute,
            dataRouteRegex,
          };
        } else {
          ret.blockingFallbackRoutes[lazyRoute] = {
            routeRegex,
            dataRoute,
            dataRouteRegex,
          };
        }
      });

      return ret;
    }
    case 2: {
      const routes = Object.keys(manifest.routes);
      const lazyRoutes = Object.keys(manifest.dynamicRoutes);

      const ret: NextPrerenderedRoutes = {
        staticRoutes: {},
        blockingFallbackRoutes: {},
        fallbackRoutes: {},
        bypassToken: manifest.preview.previewModeId,
        omittedRoutes: [],
        notFoundRoutes: [],
      };

      if (manifest.notFoundRoutes) {
        ret.notFoundRoutes.push(...manifest.notFoundRoutes);
      }

      routes.forEach(route => {
        const {
          initialRevalidateSeconds,
          dataRoute,
          srcRoute,
        } = manifest.routes[route];
        ret.staticRoutes[route] = {
          initialRevalidate:
            initialRevalidateSeconds === false
              ? false
              : Math.max(1, initialRevalidateSeconds),
          dataRoute,
          srcRoute,
        };
      });

      lazyRoutes.forEach(lazyRoute => {
        const {
          routeRegex,
          fallback,
          dataRoute,
          dataRouteRegex,
        } = manifest.dynamicRoutes[lazyRoute];

        if (typeof fallback === 'string') {
          ret.fallbackRoutes[lazyRoute] = {
            routeRegex,
            fallback,
            dataRoute,
            dataRouteRegex,
          };
        } else if (fallback === null) {
          ret.blockingFallbackRoutes[lazyRoute] = {
            routeRegex,
            dataRoute,
            dataRouteRegex,
          };
        } else {
          // Fallback behavior is disabled, all routes would've been provided
          // in the top-level `routes` key (`staticRoutes`).
          ret.omittedRoutes.push(lazyRoute);
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
        omittedRoutes: [],
        notFoundRoutes: [],
      };
    }
  }
}

// We only need this once per build
let _usesSrcCache: boolean | undefined;

async function usesSrcDirectory(workPath: string): Promise<boolean> {
  if (!_usesSrcCache) {
    const source = path.join(workPath, 'src', 'pages');

    try {
      if ((await fs.stat(source)).isDirectory()) {
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
}: {
  workPath: string;
  page: string;
}) {
  let fsPath = path.join(workPath, 'pages', page);
  if (await usesSrcDirectory(workPath)) {
    fsPath = path.join(workPath, 'src', 'pages', page);
  }

  if (fs.existsSync(fsPath)) {
    return path.relative(workPath, fsPath);
  }

  const extensionless = fsPath.slice(0, -3); // remove ".js"
  fsPath = extensionless + '.ts';
  if (fs.existsSync(fsPath)) {
    return path.relative(workPath, fsPath);
  }

  if (isDirectory(extensionless)) {
    fsPath = path.join(extensionless, 'index.js');
    if (fs.existsSync(fsPath)) {
      return path.relative(workPath, fsPath);
    }
    fsPath = path.join(extensionless, 'index.ts');
    if (fs.existsSync(fsPath)) {
      return path.relative(workPath, fsPath);
    }
  }

  console.log(`WARNING: Unable to find source file for page ${page}`);
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

export {
  excludeFiles,
  validateEntrypoint,
  excludeLockFiles,
  normalizePackageJson,
  getNextConfig,
  getPathsInside,
  getRoutes,
  stringMap,
  syncEnvVars,
  normalizePage,
  isDynamicRoute,
  getSourceFilePathFromPage,
};
