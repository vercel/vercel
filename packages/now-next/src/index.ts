import { ChildProcess, fork, SpawnOptions } from 'child_process';
import {
  pathExists,
  readFile,
  unlink as unlinkFile,
  writeFile,
} from 'fs-extra';
import os from 'os';
import path from 'path';
import semver from 'semver';

import {
  BuildOptions,
  createLambda,
  download,
  FileBlob,
  FileFsRef,
  Files,
  glob,
  Lambda,
  PrepareCacheOptions,
  runNpmInstall,
  runPackageJsonScript,
} from '@now/build-utils';

import nextLegacyVersions from './legacy-versions';
import {
  EnvConfig,
  excludeFiles,
  getNextConfig,
  getPathsInside,
  getRoutes,
  includeOnlyEntryDirectory,
  normalizePackageJson,
  filesFromDirectory,
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

export const config = {
  maxLambdaSize: '5mb',
};

export const build = async ({
  files,
  workPath,
  entrypoint,
  meta = {} as BuildParamsMeta,
}: BuildParamsType): Promise<{
  routes?: ({ src?: string; dest?: string } | { handle: string })[];
  output: Files;
  watch?: string[];
  childProcesses: ChildProcess[];
}> => {
  validateEntrypoint(entrypoint);

  const entryDirectory = path.dirname(entrypoint);
  const entryPath = path.join(workPath, entryDirectory);
  const dotNext = path.join(entryPath, '.next');

  console.log(`${name} Downloading user files...`);
  await download(files, workPath, meta);

  const pkg = await readPackageJson(entryPath);
  const nextVersion = getNextVersion(pkg);

  if (!nextVersion) {
    throw new Error(
      'No Next.js version could be detected in "package.json". Make sure `"next"` is installed in "dependencies" or "devDependencies"'
    );
  }

  process.env.__NEXT_BUILDER_EXPERIMENTAL_TARGET = 'serverless';

  if (meta.isDev) {
    // eslint-disable-next-line no-underscore-dangle
    process.env.__NEXT_BUILDER_EXPERIMENTAL_DEBUG = 'true';
    let childProcess: ChildProcess | undefined;

    // If this is the initial build, we want to start the server
    if (!urls[entrypoint]) {
      console.log(`${name} Installing dependencies...`);
      await runNpmInstall(entryPath, ['--prefer-offline']);

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
      console.log(
        `${name} Development server for ${entrypoint} running at ${
          urls[entrypoint]
        }`
      );
    }

    const pathsInside = getPathsInside(entryDirectory, files);

    return {
      output: {},
      routes: getRoutes(entryDirectory, pathsInside, files, urls[entrypoint]),
      watch: pathsInside,
      childProcesses: childProcess ? [childProcess] : [],
    };
  }

  if (await pathExists(dotNext)) {
    console.warn(
      'WARNING: You should not upload the `.next` directory. See https://zeit.co/docs/v2/deployments/official-builders/next-js-now-next/ for more details.'
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
      "WARNING: your application is being deployed in @now/next's legacy mode. http://err.sh/zeit/now-builders/now-next-legacy-mode"
    );

    console.log('normalizing package.json');
    const packageJson = normalizePackageJson(pkg);
    console.log('normalized package.json result: ', packageJson);
    await writePackageJson(entryPath, packageJson);
  } else if (!pkg.scripts || !pkg.scripts['now-build']) {
    console.warn(
      'WARNING: "now-build" script not found. Adding \'"now-build": "next build"\' to "package.json" automatically'
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

  console.log('running user script...');
  const memoryToConsume = Math.floor(os.totalmem() / 1024 ** 2) - 128;
  await runPackageJsonScript(entryPath, 'now-build', {
    env: {
      ...process.env,
      NODE_OPTIONS: `--max_old_space_size=${memoryToConsume}`,
    },
  } as SpawnOptions);

  if (isLegacy) {
    console.log('running npm install --production...');
    await runNpmInstall(entryPath, ['--prefer-offline', '--production']);
  }

  if (process.env.NPM_AUTH_TOKEN) {
    await unlinkFile(path.join(entryPath, '.npmrc'));
  }

  const exportedPageRoutes: { src: string; dest: string }[] = [];
  const lambdas: { [key: string]: Lambda } = {};
  const staticPages: { [key: string]: FileFsRef } = {};

  if (isLegacy) {
    const filesAfterBuild = await glob('**', entryPath);

    console.log('preparing lambda files...');
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
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
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
      })
    );
  } else {
    console.log('preparing lambda files...');
    const launcherFiles = {
      'now__bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
      'now__launcher.js': new FileFsRef({
        fsPath: path.join(__dirname, 'launcher.js'),
      }),
    };
    const pagesDir = path.join(entryPath, '.next', 'serverless', 'pages');

    const pages = await glob('**/*.js', pagesDir);
    const staticPageFiles = await glob('**/*.html', pagesDir);

    Object.keys(staticPageFiles).forEach((page: string) => {
      const staticRoute = path.join(entryDirectory, page);
      staticPages[staticRoute] = staticPageFiles[page];

      const pathname = page.replace(/\.html$/, '');
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
        'No serverless pages were built. https://err.sh/zeit/now-builders/now-next-no-serverless-pages-built'
      );
    }

    // An optional assets folder that is placed alongside every page entrypoint
    const assets = await glob(
      'assets/**',
      path.join(entryPath, '.next', 'serverless')
    );

    const assetKeys = Object.keys(assets);
    if (assetKeys.length > 0) {
      console.log('detected assets to be bundled with lambda:');
      assetKeys.forEach(assetFile => console.log(`\t${assetFile}`));
    }

    await Promise.all(
      pageKeys.map(async page => {
        // These default pages don't have to be handled as they'd always 404
        if (['_app.js', '_document.js'].includes(page)) {
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
      // Next.js page lambdas, `static/` folder, reserved assets, and `public/`
      // folder
      { handle: 'filesystem' },
    ],
    watch: [],
    childProcesses: [],
  };
};

export const prepareCache = async ({
  workPath,
  entrypoint,
}: PrepareCacheOptions) => {
  console.log('preparing cache ...');
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
