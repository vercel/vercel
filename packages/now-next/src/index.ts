import { 
  createLambda,
  download,
  FileFsRef,
  FileBlob,
  glob,
  runNpmInstall,
  runPackageJsonScript,
  Lambda,
  Files,
  BuildOptions,
  PrepareCacheOptions,
} from '@now/build-utils';
import resolveFrom from 'resolve-from';
import path from 'path';
import url from 'url';
import {
  readFile,
  writeFile,
  unlink as unlinkFile,
  remove as removePath,
  pathExists,
} from 'fs-extra';
import semver from 'semver';
import nextLegacyVersions from './legacy-versions';
import {
  excludeFiles,
  validateEntrypoint,
  includeOnlyEntryDirectory,
  normalizePackageJson,
  onlyStaticDirectory,
  getNextConfig,
  getWatchers,
} from './utils';

interface BuildParamsMeta {
  isDev: boolean | undefined,
  requestPath: string | undefined,
};

interface BuildParamsType extends BuildOptions {
  files: Files,
  entrypoint: string,
  workPath: string,
  meta: BuildParamsMeta,
};

export const version = 2;

/**
 * Read package.json from files
 */
async function readPackageJson(entryPath: string) {
  const packagePath = path.join(entryPath, 'package.json');

  try {
    return JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (err) {
    console.log('package.json not found in entry');
    return {};
  }
}

/**
 * Write package.json
 */
async function writePackageJson(workPath: string, packageJson: Object) {
  await writeFile(
    path.join(workPath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );
}

/**
 * Write .npmrc with npm auth token
 */
async function writeNpmRc(workPath: string, token: string) {
  await writeFile(
    path.join(workPath, '.npmrc'),
    `//registry.npmjs.org/:_authToken=${token}`,
  );
}

function getNextVersion(packageJson: {dependencies?: {[key: string]: string},devDependencies?: {[key:string]:string}}) {
  let nextVersion;
  if (packageJson.dependencies && packageJson.dependencies.next) {
    nextVersion = packageJson.dependencies.next;
  } else if (packageJson.devDependencies && packageJson.devDependencies.next) {
    nextVersion = packageJson.devDependencies.next;
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

function setNextExperimentalPage(files: Files, entry: string, meta: BuildParamsMeta) {
  const entryPath = entry !== '.' ? `${entry}/` : '';
  if (meta.requestPath || meta.requestPath === '') {
    if (
      meta.requestPath.startsWith(`${entryPath}static`)
      || (meta.requestPath.startsWith(`${entryPath}_next`)
        && !meta.requestPath.startsWith(
          `${entryPath}_next/static/unoptimized-build/pages`,
        ))
    ) {
      return files[meta.requestPath]
        ? {
          output: {
            [meta.requestPath]: files[meta.requestPath],
          },
        }
        : undefined;
    }

    const { pathname } = meta.requestPath
      ? url.parse(meta.requestPath)
      : { pathname: '/' };
    const clientPageRegex = new RegExp(
      `^${entryPath}_next/static/unoptimized-build/pages/(.+)\\.js$`,
    );
    const clientPage = (pathname || '/').match(clientPageRegex);
    // eslint-disable-next-line no-underscore-dangle
    process.env.__NEXT_BUILDER_EXPERIMENTAL_PAGE = clientPage
      ? clientPage[1]
      : pathname;
  }

  if (meta.isDev) {
    // eslint-disable-next-line no-underscore-dangle
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG = 'true';
  }

  return null;
}

function pageExists(name: string, pages: Files, entry: string) {
  const pageWhere = (key: string) => Object.prototype.hasOwnProperty.call(pages, key);
  const inPages = (...names: string[]) => {
    let exists = false;
    while (names.length >= 1) {
      if (pageWhere(`${entry ? `${entry}/` : ''}pages/${names[0]}`)) {
        exists = true;
        break;
      }
      names.shift();
    }

    return exists;
  };

  if (name === '' || name === '/') {
    return inPages(
      'index.js',
      'index.ts',
      'index.jsx',
      'index.tsx',
      'index.mdx',
    );
  }

  return inPages(
    `${name}.js`,
    `${name}.ts`,
    `${name}.jsx`,
    `${name}.tsx`,
    `${name}.mdx`,
    `${name}/index.js`,
    `${name}/index.ts`,
    `${name}/index.jsx`,
    `${name}/index.tsx`,
    `${name}/index.mdx`,
  );
}

export const config = {
  maxLambdaSize: '5mb',
};

export const build = async ({
  files, workPath, entrypoint, meta = {} as BuildParamsMeta,
}: BuildParamsType): Promise<{output: Files, watch?: string[]}> => {
  validateEntrypoint(entrypoint);

  const entryDirectory = path.dirname(entrypoint);
  const maybeStaticFiles = setNextExperimentalPage(files, entryDirectory, meta);
  if (maybeStaticFiles) return maybeStaticFiles; // return early if requestPath is static file

  console.log('downloading user files...');
  await download(files, workPath);
  const entryPath = path.join(workPath, entryDirectory);
  const dotNext = path.join(entryPath, '.next');

  if (await pathExists(dotNext)) {
    if (meta.isDev) {
      await removePath(dotNext).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    } else {
      console.warn(
        'WARNING: You should probably not upload the `.next` directory. See https://zeit.co/docs/v2/deployments/official-builders/next-js-now-next/ for more information.',
      );
    }
  }

  const pkg = await readPackageJson(entryPath);

  let nextVersion = getNextVersion(pkg);
  if (!nextVersion) {
    throw new Error(
      'No Next.js version could be detected in "package.json". Make sure `"next"` is installed in "dependencies" or "devDependencies"',
    );
  }

  const isLegacy = isLegacyNext(nextVersion);

  console.log(`MODE: ${isLegacy ? 'legacy' : 'serverless'}`);

  if (isLegacy) {
    try {
      await unlinkFile(path.join(entryPath, 'yarn.lock'));
    } catch (err) {
      console.log('no yarn.lock removed');
    }

    try {
      await unlinkFile(path.join(entryPath, 'package-lock.json'));
    } catch (err) {
      console.log('no package-lock.json removed');
    }

    console.warn(
      "WARNING: your application is being deployed in @now/next's legacy mode. http://err.sh/zeit/now-builders/now-next-legacy-mode",
    );

    console.log('normalizing package.json');
    const packageJson = normalizePackageJson(pkg);
    console.log('normalized package.json result: ', packageJson);
    await writePackageJson(entryPath, packageJson);
  } else if (!pkg.scripts || !pkg.scripts['now-build']) {
    console.warn(
      'WARNING: "now-build" script not found. Adding \'"now-build": "next build"\' to "package.json" automatically',
    );
    pkg.scripts = {
      'now-build': 'next build',
      ...(pkg.scripts || {}),
    };
    console.log('normalized package.json result: ', pkg);
    await writePackageJson(entryPath, pkg);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    console.log('found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN);
  }

  console.log('installing dependencies...');
  await runNpmInstall(entryPath, ['--prefer-offline']);

  nextVersion = JSON.parse(
    await readFile(resolveFrom(entryPath, 'next/package.json'), 'utf8'),
  ).version;
  if (!nextVersion) throw new Error('Could not parse Next.js version');

  const isUpdated = (v: string) => {
    if (v === 'canary') return true;

    try {
      return semver.satisfies(v, '>=8.0.5-canary.14', {
        includePrerelease: true,
      });
    } catch (e) {
      return false;
    }
  };

  if ((meta.isDev || meta.requestPath) && !isUpdated(nextVersion)) {
    throw new Error(
      '`now dev` can only be used with Next.js >=8.0.5-canary.14!',
    );
  }

  console.log('running user script...');
  await runPackageJsonScript(entryPath, 'now-build');

  if (isLegacy) {
    console.log('running npm install --production...');
    await runNpmInstall(entryPath, ['--prefer-offline', '--production']);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    await unlinkFile(path.join(entryPath, '.npmrc'));
  }

  const lambdas: {[key: string]: Lambda} = {};

  if (isLegacy) {
    const filesAfterBuild = await glob('**', entryPath);

    console.log('preparing lambda files...');
    let buildId: string;
    try {
      buildId = await readFile(
        path.join(entryPath, '.next', 'BUILD_ID'),
        'utf8',
      );
    } catch (err) {
      console.error(
        'BUILD_ID not found in ".next". The "package.json" "build" script did not run "next build"',
      );
      throw new Error('Missing BUILD_ID');
    }
    const dotNextRootFiles = await glob('.next/*', entryPath);
    const dotNextServerRootFiles = await glob('.next/server/*', entryPath);
    const nodeModules = excludeFiles(
      await glob('node_modules/**', entryPath),
      file => file.startsWith('node_modules/.cache'),
    );
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
    };
    const nextFiles: {[key: string]: FileFsRef} = {
      ...nodeModules,
      ...dotNextRootFiles,
      ...dotNextServerRootFiles,
      ...launcherFiles,
    };
    if (filesAfterBuild['next.config.js']) {
      nextFiles['next.config.js'] = filesAfterBuild['next.config.js'];
    }
    const pages = await glob(
      '**/*.js',
      path.join(entryPath, '.next', 'server', 'static', buildId, 'pages'),
    );
    const launcherPath = path.join(__dirname, 'legacy-launcher.js');
    const launcherData = await readFile(launcherPath, 'utf8');

    await Promise.all(
      Object.keys(pages).map(async (page) => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');
        const launcher = launcherData.replace(
          'PATHNAME_PLACEHOLDER',
          `/${pathname.replace(/(^|\/)index$/, '')}`,
        );

        const pageFiles = {
          [`.next/server/static/${buildId}/pages/_document.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_document.js`
          ],
          [`.next/server/static/${buildId}/pages/_app.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_app.js`
          ],
          [`.next/server/static/${buildId}/pages/_error.js`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/_error.js`
          ],
          [`.next/server/static/${buildId}/pages/${page}`]: filesAfterBuild[
            `.next/server/static/${buildId}/pages/${page}`
          ],
        };

        console.log(`Creating lambda for page: "${page}"...`);
        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...nextFiles,
            ...pageFiles,
            'now__launcher.js': new FileBlob({ data: launcher }),
          },
          handler: 'now__launcher.launcher',
          runtime: 'nodejs8.10',
        });
        console.log(`Created lambda for page: "${page}"`);
      }),
    );
  } else {
    console.log('preparing lambda files...');
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
      'now__launcher.js': new FileFsRef({
        fsPath: path.join(__dirname, 'launcher.js'),
      }),
    };
    const pages = await glob(
      '**/*.js',
      path.join(entryPath, '.next', 'serverless', 'pages'),
    );

    const pageKeys = Object.keys(pages);

    if (pageKeys.length === 0) {
      const nextConfig = await getNextConfig(workPath, entryPath);

      if (nextConfig != null) {
        console.info('Found next.config.js:');
        console.info(nextConfig);
        console.info();
      }

      throw new Error(
        'No serverless pages were built. https://err.sh/zeit/now-builders/now-next-no-serverless-pages-built',
      );
    }

    // An optional assets folder that is placed alongside every page entrypoint
    const assets = await glob(
      'assets/**',
      path.join(entryPath, '.next', 'serverless'),
    );

    const assetKeys = Object.keys(assets);
    if (assetKeys.length > 0) {
      console.log('detected assets to be bundled with lambda:');
      assetKeys.forEach(assetFile => console.log(`\t${assetFile}`));
    }

    await Promise.all(
      pageKeys.map(async (page) => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_error.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');

        console.log(`Creating lambda for page: "${page}"...`);
        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...launcherFiles,
            ...assets,
            'page.js': pages[page],
          },
          handler: 'now__launcher.launcher',
          runtime: 'nodejs8.10',
        });
        console.log(`Created lambda for page: "${page}"`);
      }),
    );
  }

  const nextStaticFiles = await glob(
    '**',
    path.join(entryPath, '.next', 'static'),
  );
  const staticFiles = Object.keys(nextStaticFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[file],
    }),
    {},
  );

  const staticDirectoryFiles = onlyStaticDirectory(
    includeOnlyEntryDirectory(files, entryDirectory),
    entryDirectory,
  );

  return {
    output: { ...lambdas, ...staticFiles, ...staticDirectoryFiles },
    watch: await getWatchers(dotNext),
  };
};

export const prepareCache = async ({ workPath, entrypoint }: PrepareCacheOptions) => {
  console.log('preparing cache ...');
  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);

  const pkg = await readPackageJson(entryPath);
  const nextVersion = getNextVersion(pkg);
  if (!nextVersion) throw new Error('Could not parse Next.js version')
  const isLegacy = isLegacyNext(nextVersion);

  if (isLegacy) {
    // skip caching legacy mode (swapping deps between all and production can get bug-prone)
    return {};
  }

  console.log('producing cache file manifest ...');
  const cacheEntrypoint = path.relative(workPath, entryPath);
  const cache = {
    ...(await glob(path.join(cacheEntrypoint, 'node_modules/**'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, '.next/cache/**'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, 'package-lock.json'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, 'yarn.lock'), workPath)),
  };
  console.log('cache file manifest produced');
  return cache;
};

export const shouldServe = async ({ entrypoint, files, requestPath }: {entrypoint: string, files: Files, requestPath: string}) => {
  const entry = path.dirname(entrypoint);
  const entryDirectory = entry === '.' ? '' : `${entry}/`;

  if (new RegExp(`^${entryDirectory}static/.+$`).test(requestPath)) return true;

  const pages = includeOnlyEntryDirectory(
    files,
    path.join(entryDirectory, 'pages'),
  );

  const isClientPage = new RegExp(
    `^${entryDirectory}_next/static/unoptimized-build/pages/(.+)\\.js$`,
  );
  if (isClientPage.test(requestPath)) {
    const requestedPage = requestPath.match(isClientPage);
    if (!requestedPage) return false;
    if (requestedPage[1] === '_error' || requestedPage[1] === '_document' || requestedPage[1] === '_app') return true;
    return pageExists(requestedPage[1], pages, entryDirectory);
  }

  if (new RegExp(`^${entryDirectory}_next.+$`).test(requestPath)) return true;

  return pageExists(
    requestPath.endsWith('/') ? requestPath.slice(0, -1) : requestPath,
    pages,
    entryDirectory,
  );
};
