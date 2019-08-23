import fs from 'fs-extra';
import path from 'path';
import resolveFrom from 'resolve-from';
import { Files } from '@now/build-utils';

type stringMap = { [key: string]: string };

export interface EnvConfig {
  [name: string]: string | undefined;
}

// Identify /[param]/ in route string
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
    throw new Error(
      'Specified "src" for "@now/next" has to be "package.json" or "next.config.js"'
    );
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
 * Creates a new Files object holding only the entrypoint files
 */
function includeOnlyEntryDirectory(
  files: Files,
  entryDirectory: string
): Files {
  if (entryDirectory === '.') {
    return files;
  }

  function matcher(filePath: string) {
    return !filePath.startsWith(entryDirectory);
  }

  return excludeFiles(files, matcher);
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
 * Include only the files from a selected directory
 */
function filesFromDirectory(files: Files, dir: string): Files {
  function matcher(filePath: string) {
    return !filePath.startsWith(dir.replace(/\\/g, '/'));
  }

  return excludeFiles(files, matcher);
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
      // next-server is a dependency here
      'next-server': undefined,
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
  // remove '/index' from the end
  page = page.replace(/\/index$/, '/');
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`;
  }
  return page;
}

function getRoutes(
  entryPath: string,
  entryDirectory: string,
  pathsInside: string[],
  files: Files,
  url: string
): any[] {
  const filesInside: Files = {};
  const prefix = entryDirectory === `.` ? `/` : `/${entryDirectory}/`;

  for (const file of Object.keys(files)) {
    if (!pathsInside.includes(file)) {
      continue;
    }

    filesInside[file] = files[file];
  }

  const routes: any[] = [
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
    const isPage = pathIsInside('pages', relativePath);

    if (!isPage) {
      continue;
    }

    const relativeToPages = path.relative('pages', relativePath);
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
    ...getDynamicRoutes(entryPath, entryDirectory, dynamicPages).map(
      (route: { src: string; dest: string }) => {
        // convert to make entire RegExp match as one group
        route.src = route.src
          .replace('^', `^${prefix}(`)
          .replace('(\\/', '(')
          .replace('$', ')$');
        route.dest = `${url}/$1`;
        return route;
      }
    )
  );

  // Add public folder routes
  for (const file of filePaths) {
    const relativePath = path.relative(entryDirectory, file);
    const isPublic = pathIsInside('public', relativePath);

    if (!isPublic) continue;

    const fileName = path.relative('public', relativePath);
    const route = {
      src: `${prefix}${fileName}`,
      dest: `${url}/${fileName}`,
    };

    // Only add the route if a page is not already using it
    if (!routes.some(r => r.src === route.src)) {
      routes.push(route);
    }
  }

  return routes;
}

export function getDynamicRoutes(
  entryPath: string,
  entryDirectory: string,
  dynamicPages: string[],
  isDev?: boolean
): { src: string; dest: string }[] {
  if (!dynamicPages.length) {
    return [];
  }

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
  } catch (_) {}

  if (!getRouteRegex || !getSortedRoutes) {
    throw new Error(
      'Found usage of dynamic routes but not on a new enough version of Next.js.'
    );
  }

  const pageMatchers = getSortedRoutes(dynamicPages).map(pageName => ({
    pageName,
    matcher: getRouteRegex!(pageName).re,
  }));

  const routes: { src: string; dest: string }[] = [];
  pageMatchers.forEach(pageMatcher => {
    // in `now dev` we don't need to prefix the destination
    const dest = !isDev
      ? path.join('/', entryDirectory, pageMatcher.pageName)
      : pageMatcher.pageName;

    routes.push({
      src: pageMatcher.matcher.source,
      dest,
    });
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

export {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  excludeLockFiles,
  normalizePackageJson,
  filesFromDirectory,
  getNextConfig,
  getPathsInside,
  getRoutes,
  stringMap,
  syncEnvVars,
  normalizePage,
  isDynamicRoute,
};
