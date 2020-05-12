import zlib from 'zlib';
import path from 'path';
import fs from 'fs-extra';
import semver from 'semver';
import { ZipFile } from 'yazl';
import crc32 from 'buffer-crc32';
import { Sema } from 'async-sema';
import resolveFrom from 'resolve-from';
import buildUtils from './build-utils';
const { streamToBuffer, Lambda, NowBuildError, isSymbolicLink } = buildUtils;
import { Files, FileFsRef } from '@vercel/build-utils';
import { Route, Source, NowHeader, NowRewrite } from '@vercel/routing-utils';

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
    ...(await getDynamicRoutes(entryPath, entryDirectory, dynamicPages).then(
      arr =>
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
  }[];
  version: number;
  dataRoutes?: Array<{ page: string; dataRouteRegex: string }>;
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
      message: `A "routes-manifest.json" couldn't be found. Is the correct output directory configured? This setting does not need to be changed in most cases`,
      link: 'https://err.sh/zeit/now/now-next-routes-manifest',
      code: 'NEXT_NO_ROUTES_MANIFEST',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const routesManifest: RoutesManifest = require(pathRoutesManifest);

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
    // in `now dev` we don't need to prefix the destination
    const dest = !isDev
      ? path.join('/', entryDirectory, pageMatcher.pageName)
      : pageMatcher.pageName;

    if (pageMatcher && pageMatcher.matcher) {
      routes.push({
        src: pageMatcher.matcher.source,
        dest,
        check: true,
      });
    }
  });
  return routes;
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

export async function createPseudoLayer(files: {
  [fileName: string]: FileFsRef;
}): Promise<PseudoLayer> {
  const pseudoLayer: PseudoLayer = {};

  for (const fileName of Object.keys(files)) {
    const file = files[fileName];

    if (isSymbolicLink(file.mode)) {
      pseudoLayer[fileName] = {
        file,
        isSymlink: true,
        symlinkTarget: await fs.readlink(file.fsPath),
      };
    } else {
      const origBuffer = await streamToBuffer(file.toStream());
      const compBuffer = await compressBuffer(origBuffer);
      pseudoLayer[fileName] = {
        compBuffer,
        isSymlink: false,
        crc32: crc32.unsigned(origBuffer),
        uncompressedSize: origBuffer.byteLength,
        mode: file.mode,
      };
    }
  }

  return pseudoLayer;
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

  legacyBlockingRoutes: {
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
  entryPath: string
): Promise<NextPrerenderedRoutes> {
  const pathPrerenderManifest = path.join(
    entryPath,
    '.next',
    'prerender-manifest.json'
  );

  const hasManifest: boolean = await fs
    .access(pathPrerenderManifest, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);

  if (!hasManifest) {
    return {
      staticRoutes: {},
      legacyBlockingRoutes: {},
      fallbackRoutes: {},
      bypassToken: null,
      omittedRoutes: [],
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
      } = JSON.parse(await fs.readFile(pathPrerenderManifest, 'utf8'));

  switch (manifest.version) {
    case 1: {
      const routes = Object.keys(manifest.routes);
      const lazyRoutes = Object.keys(manifest.dynamicRoutes);

      const ret: NextPrerenderedRoutes = {
        staticRoutes: {},
        legacyBlockingRoutes: {},
        fallbackRoutes: {},
        bypassToken:
          (manifest.preview && manifest.preview.previewModeId) || null,
        omittedRoutes: [],
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
          ret.legacyBlockingRoutes[lazyRoute] = {
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
        legacyBlockingRoutes: {},
        fallbackRoutes: {},
        bypassToken: manifest.preview.previewModeId,
        omittedRoutes: [],
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

        if (!fallback) {
          // Fallback behavior is disabled, all routes would've been provided
          // in the top-level `routes` key (`staticRoutes`).
          ret.omittedRoutes.push(lazyRoute);
          return;
        }

        ret.fallbackRoutes[lazyRoute] = {
          routeRegex,
          fallback,
          dataRoute,
          dataRouteRegex,
        };
      });

      return ret;
    }
    default: {
      return {
        staticRoutes: {},
        legacyBlockingRoutes: {},
        fallbackRoutes: {},
        bypassToken: null,
        omittedRoutes: [],
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
  if (await usesSrcDirectory(workPath)) {
    return path.join('src', 'pages', page);
  }

  return path.join('pages', page);
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
