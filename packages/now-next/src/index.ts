import { ChildProcess, fork } from 'child_process';
import {
  pathExists,
  readFile,
  unlink as unlinkFile,
  writeFile,
} from 'fs-extra';
import os from 'os';
import path from 'path';
import resolveFrom from 'resolve-from';
import semver from 'semver';

import {
  BuildOptions,
  Config,
  createLambda,
  download,
  FileBlob,
  FileFsRef,
  Files,
  getNodeVersion,
  getSpawnOptions,
  glob,
  Lambda,
  PrepareCacheOptions,
  Route,
  runNpmInstall,
  runPackageJsonScript,
  debug,
} from '@now/build-utils';
import nodeFileTrace from '@zeit/node-file-trace';

import createServerlessConfig from './create-serverless-config';
import nextLegacyVersions from './legacy-versions';
import {
  EnvConfig,
  excludeFiles,
  ExperimentalTraceVersion,
  filesFromDirectory,
  getDynamicRoutes,
  getNextConfig,
  getPathsInside,
  getRoutes,
  includeOnlyEntryDirectory,
  isDynamicRoute,
  normalizePackageJson,
  normalizePage,
  stringMap,
  syncEnvVars,
  validateEntrypoint,
} from './utils';

interface BuildParamsMeta {
  isDev: boolean | undefined;
  env?: EnvConfig;
  buildEnv?: EnvConfig;
}

interface BuildParamsType extends BuildOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  meta: BuildParamsMeta;
}

export const version = 2;

/**
 * Read package.json from files
 */
async function readPackageJson(entryPath: string) {
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
async function writePackageJson(workPath: string, packageJson: Object) {
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

function getNextVersion(packageJson: {
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
}) {
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

const name = '[@now/next]';
const urls: stringMap = {};

function startDevServer(entryPath: string, runtimeEnv: EnvConfig) {
  // The runtime env vars are encoded and passed in as `argv[2]`, so that the
  // dev-server process can replace them onto `process.env` after the Next.js
  // "prepare" step
  const encodedEnv = Buffer.from(JSON.stringify(runtimeEnv)).toString('base64');

  // `env` is omitted since that
  // makes it default to `process.env`
  const forked = fork(path.join(__dirname, 'dev-server.js'), [encodedEnv], {
    cwd: entryPath,
    execArgv: [],
  });

  const getUrl = () =>
    new Promise<string>((resolve, reject) => {
      forked.on('message', resolve);
      forked.on('error', reject);
    });

  return { forked, getUrl };
}

export const build = async ({
  files,
  workPath,
  entrypoint,
  config = {} as Config,
  meta = {} as BuildParamsMeta,
}: BuildParamsType): Promise<{
  routes: Route[];
  output: Files;
  watch?: string[];
  childProcesses: ChildProcess[];
}> => {
  validateEntrypoint(entrypoint);

  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);
  const dotNextStatic = path.join(entryPath, '.next/static');

  debug(`${name} Downloading user files...`);
  await download(files, workPath, meta);

  const pkg = await readPackageJson(entryPath);
  const nextVersion = getNextVersion(pkg);

  const nodeVersion = await getNodeVersion(entryPath, undefined, config);
  const spawnOpts = getSpawnOptions(meta, nodeVersion);

  if (!nextVersion) {
    throw new Error(
      'No Next.js version could be detected in "package.json". Make sure `"next"` is installed in "dependencies" or "devDependencies"'
    );
  }

  if (meta.isDev) {
    let childProcess: ChildProcess | undefined;

    // If this is the initial build, we want to start the server
    if (!urls[entrypoint]) {
      debug(`${name} Installing dependencies...`);
      await runNpmInstall(entryPath, ['--prefer-offline'], spawnOpts);

      if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'development';
      }

      // The runtime env vars consist of the base `process.env` vars, but with the
      // build env vars removed, and the runtime env vars mixed in afterwards
      const runtimeEnv: EnvConfig = Object.assign({}, process.env);
      syncEnvVars(runtimeEnv, meta.buildEnv || {}, meta.env || {});

      const { forked, getUrl } = startDevServer(entryPath, runtimeEnv);
      urls[entrypoint] = await getUrl();
      childProcess = forked;
      debug(
        `${name} Development server for ${entrypoint} running at ${urls[entrypoint]}`
      );
    }

    const pathsInside = getPathsInside(entryDirectory, files);

    return {
      output: {},
      routes: getRoutes(
        entryPath,
        entryDirectory,
        pathsInside,
        files,
        urls[entrypoint]
      ),
      watch: pathsInside,
      childProcesses: childProcess ? [childProcess] : [],
    };
  }

  if (await pathExists(dotNextStatic)) {
    console.warn(
      'WARNING: You should not upload the `.next` directory. See https://zeit.co/docs/v2/deployments/official-builders/next-js-now-next/ for more details.'
    );
  }

  const isLegacy = isLegacyNext(nextVersion);

  debug(`MODE: ${isLegacy ? 'legacy' : 'serverless'}`);

  if (isLegacy) {
    try {
      await unlinkFile(path.join(entryPath, 'yarn.lock'));
    } catch (err) {
      debug('no yarn.lock removed');
    }

    try {
      await unlinkFile(path.join(entryPath, 'package-lock.json'));
    } catch (err) {
      debug('no package-lock.json removed');
    }

    console.warn(
      "WARNING: your application is being deployed in @now/next's legacy mode. http://err.sh/zeit/now/now-next-legacy-mode"
    );

    debug('normalizing package.json');
    const packageJson = normalizePackageJson(pkg);
    debug('normalized package.json result: ', packageJson);
    await writePackageJson(entryPath, packageJson);
  } else if (!pkg.scripts || !pkg.scripts['now-build']) {
    debug(
      'Your application is being built using `next build`. ' +
        'If you need to define a different build step, please create a `now-build` script in your `package.json` ' +
        '(e.g. `{ "scripts": { "now-build": "npm run prepare && next build" } }`).'
    );
    pkg.scripts = {
      'now-build': 'next build',
      ...(pkg.scripts || {}),
    };
    await writePackageJson(entryPath, pkg);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    debug('found NPM_AUTH_TOKEN in environment, creating .npmrc');
    await writeNpmRc(entryPath, process.env.NPM_AUTH_TOKEN);
  }

  debug('installing dependencies...');
  await runNpmInstall(entryPath, ['--prefer-offline'], spawnOpts);

  let realNextVersion: string | undefined;
  try {
    realNextVersion = require(resolveFrom(entryPath, 'next/package.json'))
      .version;

    debug(`detected Next.js version: ${realNextVersion}`);
  } catch (_ignored) {
    debug(`could not identify real Next.js version, that's OK!`);
  }

  if (!isLegacy) {
    await createServerlessConfig(workPath, realNextVersion);
  }

  debug('running user script...');
  const memoryToConsume = Math.floor(os.totalmem() / 1024 ** 2) - 128;
  const env = { ...spawnOpts.env } as any;
  env.NODE_OPTIONS = `--max_old_space_size=${memoryToConsume}`;
  await runPackageJsonScript(entryPath, 'now-build', { ...spawnOpts, env });

  if (isLegacy) {
    debug('running npm install --production...');
    await runNpmInstall(
      entryPath,
      ['--prefer-offline', '--production'],
      spawnOpts
    );
  }

  if (process.env.NPM_AUTH_TOKEN) {
    await unlinkFile(path.join(entryPath, '.npmrc'));
  }

  const exportedPageRoutes: Route[] = [];
  const lambdas: { [key: string]: Lambda } = {};
  const staticPages: { [key: string]: FileFsRef } = {};
  const dynamicPages: string[] = [];

  if (isLegacy) {
    const filesAfterBuild = await glob('**', entryPath);

    debug('preparing lambda files...');
    let buildId: string;
    try {
      buildId = await readFile(
        path.join(entryPath, '.next', 'BUILD_ID'),
        'utf8'
      );
    } catch (err) {
      console.error(
        'BUILD_ID not found in ".next". The "package.json" "build" script did not run "next build"'
      );
      throw new Error('Missing BUILD_ID');
    }
    const dotNextRootFiles = await glob('.next/*', entryPath);
    const dotNextServerRootFiles = await glob('.next/server/*', entryPath);
    const nodeModules = excludeFiles(
      await glob('node_modules/**', entryPath),
      file => file.startsWith('node_modules/.cache')
    );
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({
        fsPath: path.join(__dirname, 'now__bridge.js'),
      }),
    };
    const nextFiles: { [key: string]: FileFsRef } = {
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
      path.join(entryPath, '.next', 'server', 'static', buildId, 'pages')
    );
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

        debug(`Creating lambda for page: "${page}"...`);
        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...nextFiles,
            ...pageFiles,
            'now__launcher.js': new FileBlob({ data: launcher }),
          },
          handler: 'now__launcher.launcher',
          runtime: nodeVersion.runtime,
        });
        debug(`Created lambda for page: "${page}"`);
      })
    );
  } else {
    debug('preparing lambda files...');
    const pagesDir = path.join(entryPath, '.next', 'serverless', 'pages');

    const pages = await glob('**/*.js', pagesDir);
    const staticPageFiles = await glob('**/*.html', pagesDir);

    Object.keys(staticPageFiles).forEach((page: string) => {
      const staticRoute = path.join(entryDirectory, page);
      staticPages[staticRoute] = staticPageFiles[page];

      const pathname = page.replace(/\.html$/, '');

      if (isDynamicRoute(pathname)) {
        dynamicPages.push(normalizePage(pathname));
        return;
      }

      exportedPageRoutes.push({
        src: `^${path.join('/', entryDirectory, pathname)}$`,
        dest: path.join('/', staticRoute),
      });
    });

    const pageKeys = Object.keys(pages);

    if (pageKeys.length === 0) {
      const nextConfig = await getNextConfig(workPath, entryPath);

      if (nextConfig != null) {
        console.info('Found next.config.js:');
        console.info(nextConfig);
        console.info();
      }

      throw new Error(
        'No serverless pages were built. https://err.sh/zeit/now/now-next-no-serverless-pages-built'
      );
    }

    // Assume tracing to be safe, bail if we know we don't need it.
    let requiresTracing = true;
    try {
      if (
        realNextVersion &&
        semver.lt(realNextVersion, ExperimentalTraceVersion)
      ) {
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
      | {
          [filePath: string]: FileFsRef;
        }
      | undefined;
    const tracedFiles: {
      [filePath: string]: FileFsRef;
    } = {};
    if (requiresTracing) {
      const tracingLabel = 'Tracing Next.js lambdas for external files ...';
      console.time(tracingLabel);

      const { fileList, reasons } = ((await nodeFileTrace(
        Object.keys(pages).map(page => pages[page].fsPath),
        { base: workPath }
      )) as any) as {
        fileList: string[];
        reasons: {
          [fileName: string]: {
            type: string;
            ignored: boolean;
            parents: string[];
          };
        };
      };
      debug(`node-file-trace result for pages: ${fileList}`);
      fileList.forEach(file => {
        const reason = reasons[file];
        if (reason && reason.type === 'initial') {
          // Initial files are manually added to the lambda later
          return;
        }

        tracedFiles[file] = new FileFsRef({
          fsPath: path.join(workPath, file),
        });
      });

      console.timeEnd(tracingLabel);
    } else {
      // An optional assets folder that is placed alongside every page
      // entrypoint.
      // This is a legacy feature that was needed before we began tracing
      // lambdas.
      assets = await glob(
        'assets/**',
        path.join(entryPath, '.next', 'serverless')
      );

      const assetKeys = Object.keys(assets!);
      if (assetKeys.length > 0) {
        debug('detected (legacy) assets to be bundled with lambda:');
        assetKeys.forEach(assetFile => debug(`\t${assetFile}`));
        debug(
          '\nPlease upgrade to Next.js 9.1 to leverage modern asset handling.'
        );
      }
    }

    const launcherPath = path.join(__dirname, 'templated-launcher.js');
    const launcherData = await readFile(launcherPath, 'utf8');
    await Promise.all(
      pageKeys.map(async page => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_document.js'].includes(page)) {
          return;
        }

        const pathname = page.replace(/\.js$/, '');

        if (isDynamicRoute(pathname)) {
          dynamicPages.push(normalizePage(pathname));
        }

        const label = `Creating lambda for page: "${page}"...`;
        console.time(label);

        const pageFileName = path.normalize(
          path.relative(workPath, pages[page].fsPath)
        );
        const launcher = launcherData.replace(
          /__LAUNCHER_PAGE_PATH__/g,
          JSON.stringify(requiresTracing ? `./${pageFileName}` : './page')
        );
        const launcherFiles = {
          'now__bridge.js': new FileFsRef({
            fsPath: path.join(__dirname, 'now__bridge.js'),
          }),
          'now__launcher.js': new FileBlob({ data: launcher }),
        };

        lambdas[path.join(entryDirectory, pathname)] = await createLambda({
          files: {
            ...launcherFiles,
            ...assets,
            ...tracedFiles,
            [requiresTracing ? pageFileName : 'page.js']: pages[page],
          },
          handler: 'now__launcher.launcher',
          runtime: nodeVersion.runtime,
        });
        console.timeEnd(label);
      })
    );
  }

  const nextStaticFiles = await glob(
    '**',
    path.join(entryPath, '.next', 'static')
  );
  const staticFiles = Object.keys(nextStaticFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [path.join(entryDirectory, `_next/static/${file}`)]: nextStaticFiles[
        file
      ],
    }),
    {}
  );

  const entryDirectoryFiles = includeOnlyEntryDirectory(files, entryDirectory);
  const staticDirectoryFiles = filesFromDirectory(
    entryDirectoryFiles,
    path.join(entryDirectory, 'static')
  );
  const publicDirectoryFiles = filesFromDirectory(
    entryDirectoryFiles,
    path.join(entryDirectory, 'public')
  );
  const publicFiles = Object.keys(publicDirectoryFiles).reduce(
    (mappedFiles, file) => ({
      ...mappedFiles,
      [file.replace(/public[/\\]+/, '')]: publicDirectoryFiles[file],
    }),
    {}
  );
  let dynamicPrefix = path.join('/', entryDirectory);
  dynamicPrefix = dynamicPrefix === '/' ? '' : dynamicPrefix;

  let dynamicRoutes = getDynamicRoutes(
    entryPath,
    entryDirectory,
    dynamicPages
  ).map(route => {
    // make sure .html is added to dest for now until
    // outputting static files to clean routes is available
    if (staticPages[`${route.dest}.html`.substr(1)]) {
      route.dest = `${route.dest}.html`;
    }
    route.src = route.src.replace('^', `^${dynamicPrefix}`);
    return route;
  });

  return {
    output: {
      ...publicFiles,
      ...lambdas,
      ...staticPages,
      ...staticFiles,
      ...staticDirectoryFiles,
    },
    routes: [
      // Static exported pages (.html rewrites)
      ...exportedPageRoutes,
      // Before we handle static files we need to set proper caching headers
      {
        // This ensures we only match known emitted-by-Next.js files and not
        // user-emitted files which may be missing a hash in their filename.
        src: '/_next/static/(?:[^/]+/pages|chunks|runtime)/.+',
        // Next.js assets contain a hash or entropy in their filenames, so they
        // are guaranteed to be unique and cacheable indefinitely.
        headers: { 'cache-control': 'public,max-age=31536000,immutable' },
        continue: true,
      },
      // Next.js page lambdas, `static/` folder, reserved assets, and `public/`
      // folder
      { handle: 'filesystem' },
      // Dynamic routes
      ...dynamicRoutes,
      ...(isLegacy
        ? []
        : [
            {
              src: path.join('/', entryDirectory, '.*'),
              dest: path.join('/', entryDirectory, '_error'),
              status: 404,
            },
          ]),
    ],
    watch: [],
    childProcesses: [],
  };
};

export const prepareCache = async ({
  workPath,
  entrypoint,
}: PrepareCacheOptions) => {
  debug('preparing cache ...');
  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);

  const pkg = await readPackageJson(entryPath);
  const nextVersion = getNextVersion(pkg);
  if (!nextVersion) throw new Error('Could not parse Next.js version');
  const isLegacy = isLegacyNext(nextVersion);

  if (isLegacy) {
    // skip caching legacy mode (swapping deps between all and production can get bug-prone)
    return {};
  }

  debug('producing cache file manifest ...');
  const cacheEntrypoint = path.relative(workPath, entryPath);
  const cache = {
    ...(await glob(path.join(cacheEntrypoint, 'node_modules/**'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, '.next/cache/**'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, 'package-lock.json'), workPath)),
    ...(await glob(path.join(cacheEntrypoint, 'yarn.lock'), workPath)),
  };
  debug('cache file manifest produced');
  return cache;
};
