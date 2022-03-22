import ms from 'ms';
import path from 'path';
import fetch from 'node-fetch';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import frameworks, { Framework } from '@vercel/frameworks';
import { ChildProcess, SpawnOptions } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { cpus } from 'os';
import {
  BuildV2,
  Files,
  FileFsRef,
  Config,
  PackageJson,
  PrepareCache,
  glob,
  download,
  spawnAsync,
  execCommand,
  spawnCommand,
  runNpmInstall,
  getNodeBinPath,
  runBundleInstall,
  runPipInstall,
  runPackageJsonScript,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  debug,
  NowBuildError,
  scanParentDirs,
} from '@vercel/build-utils';
import { Route, Source } from '@vercel/routing-utils';
import {
  readBuildOutputDirectory,
  readBuildOutputConfig,
} from './utils/read-build-output';
import * as GatsbyUtils from './utils/gatsby';
import * as NuxtUtils from './utils/nuxt';
import { ImagesConfig, BuildConfig } from './utils/_shared';

const sleep = (n: number) => new Promise(resolve => setTimeout(resolve, n));

const DEV_SERVER_PORT_BIND_TIMEOUT = ms('5m');

async function checkForPort(
  port: number | undefined,
  timeout: number
): Promise<void> {
  const start = Date.now();
  while (!(await isPortReachable(port))) {
    if (Date.now() - start > timeout) {
      throw new Error(`Detecting port ${port} timed out after ${ms(timeout)}`);
    }
    await sleep(100);
  }
}

function validateDistDir(distDir: string) {
  const distDirName = path.basename(distDir);
  const exists = () => existsSync(distDir);
  const isDirectory = () => statSync(distDir).isDirectory();
  const isEmpty = () => readdirSync(distDir).length === 0;

  const link = 'https://vercel.link/missing-public-directory';

  if (!exists()) {
    throw new NowBuildError({
      code: 'STATIC_BUILD_NO_OUT_DIR',
      message: `No Output Directory named "${distDirName}" found after the Build completed. You can configure the Output Directory in your Project Settings.`,
      link,
    });
  }

  if (!isDirectory()) {
    throw new NowBuildError({
      code: 'STATIC_BUILD_NOT_A_DIR',
      message: `The path specified as Output Directory ("${distDirName}") is not actually a directory.`,
      link,
    });
  }

  if (isEmpty()) {
    throw new NowBuildError({
      code: 'STATIC_BUILD_EMPTY_OUT_DIR',
      message: `The Output Directory "${distDirName}" is empty.`,
      link,
    });
  }
}

function hasScript(script: string, pkg: PackageJson) {
  const scripts = (pkg && pkg.scripts) || {};
  return typeof scripts[script] === 'string';
}

function getScriptName(pkg: PackageJson, cmd: string, { zeroConfig }: Config) {
  // The `dev` script can be `now-dev`
  const nowCmd = `now-${cmd}`;

  if (!zeroConfig && cmd === 'dev') {
    return nowCmd;
  }

  if (hasScript(nowCmd, pkg)) {
    return nowCmd;
  }

  if (hasScript(cmd, pkg)) {
    return cmd;
  }

  return zeroConfig ? cmd : nowCmd;
}

function getCommand(
  name: 'install' | 'build' | 'dev',
  pkg: PackageJson | null,
  config: Config,
  framework: Framework | undefined
): string | null {
  if (!config.zeroConfig) {
    return null;
  }

  const propName = `${name}Command`;
  const propValue = config[propName];

  if (typeof propValue === 'string') {
    return propValue;
  }

  if (pkg) {
    const scriptName = getScriptName(pkg, name, config);

    if (hasScript(scriptName, pkg)) {
      return null;
    }
  }

  if (framework) {
    switch (name) {
      case 'install':
        return null; // Install command never has default value
      case 'build':
        return framework.settings.buildCommand.value;
      case 'dev':
        return framework.settings.devCommand.value;
      default: {
        const _exhaustiveCheck: never = name;
        throw new Error(`Unhandled command: ${_exhaustiveCheck}`);
      }
    }
  }

  return null;
}

export const version = 2;

const nowDevScriptPorts = new Map<string, number>();
const nowDevChildProcesses = new Set<ChildProcess>();

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.once(signal as NodeJS.Signals, () => {
    for (const child of nowDevChildProcesses) {
      debug(
        `Got ${signal}, killing dev server child process (pid=${child.pid})`
      );
      process.kill(child.pid!, signal);
    }
    process.exit(0);
  });
});

const getDevRoute = (srcBase: string, devPort: number, route: Source) => {
  const basic: Source = {
    src: `${srcBase}${route.src}`,
    dest: `http://localhost:${devPort}${route.dest}`,
  };

  if (route.headers) {
    basic.headers = route.headers;
  }

  return basic;
};

async function getFrameworkRoutes(
  framework: Framework,
  dirPrefix: string
): Promise<Route[]> {
  if (!framework.defaultRoutes) {
    return [];
  }

  let routes: Route[];

  if (typeof framework.defaultRoutes === 'function') {
    routes = await framework.defaultRoutes(dirPrefix);
  } else {
    routes = framework.defaultRoutes;
  }

  return routes;
}

function getPkg(entrypoint: string, workPath: string) {
  if (path.basename(entrypoint) !== 'package.json') {
    return null;
  }

  const pkgPath = path.join(workPath, entrypoint);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
  return pkg;
}

function getFramework(
  config: Config | null,
  pkg?: PackageJson | null
): Framework | undefined {
  if (!config || !config.zeroConfig) {
    return;
  }
  const { framework: configFramework = null } = config || {};

  if (configFramework) {
    const framework = frameworks.find(({ slug }) => slug === configFramework);

    if (framework) {
      return framework;
    }
  }

  if (!pkg) {
    return;
  }

  const dependencies = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  const framework = frameworks.find(
    ({ dependency }) => dependencies[dependency || '']
  );
  return framework;
}

async function fetchBinary(url: string, framework: string, version: string) {
  const res = await fetch(url);
  if (res.status === 404) {
    throw new NowBuildError({
      code: 'STATIC_BUILD_BINARY_NOT_FOUND',
      message: `Version ${version} of ${framework} does not exist. Please specify a different one.`,
      link: 'https://vercel.com/docs/v2/build-step#framework-versioning',
    });
  }
  await spawnAsync(`curl -sSL ${url} | tar -zx -C /usr/local/bin`, [], {
    shell: true,
  });
}

export const build: BuildV2 = async ({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}) => {
  await download(files, workPath, meta);

  const mountpoint = path.dirname(entrypoint);
  const entrypointDir = path.join(workPath, mountpoint);

  let distPath = path.join(
    workPath,
    path.dirname(entrypoint),
    (config && (config.distDir as string)) ||
      (config.outputDirectory as string) ||
      'dist'
  );

  const pkg = getPkg(entrypoint, workPath);

  const devScript = pkg ? getScriptName(pkg, 'dev', config) : null;

  const framework = getFramework(config, pkg);

  const devCommand = getCommand('dev', pkg, config, framework);
  const buildCommand = getCommand('build', pkg, config, framework);
  const installCommand = getCommand('install', pkg, config, framework);

  if (pkg || buildCommand) {
    const gemfilePath = path.join(workPath, 'Gemfile');
    const requirementsPath = path.join(workPath, 'requirements.txt');
    let isNpmInstall = false;
    let isBundleInstall = false;
    let isPipInstall = false;
    let output: Files = {};
    let images: ImagesConfig | undefined;
    const routes: Route[] = [];

    if (config.zeroConfig) {
      const { HUGO_VERSION, ZOLA_VERSION, GUTENBERG_VERSION } = process.env;

      if (HUGO_VERSION && !meta.isDev) {
        console.log('Installing Hugo version ' + HUGO_VERSION);
        const [major, minor] = HUGO_VERSION.split('.').map(Number);
        const isOldVersion = major === 0 && minor < 43;
        const prefix = isOldVersion ? `hugo_` : `hugo_extended_`;
        const url = `https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${prefix}${HUGO_VERSION}_Linux-64bit.tar.gz`;
        await fetchBinary(url, 'Hugo', HUGO_VERSION);
      }

      if (ZOLA_VERSION && !meta.isDev) {
        console.log('Installing Zola version ' + ZOLA_VERSION);
        const url = `https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;
        await fetchBinary(url, 'Zola', ZOLA_VERSION);
      }

      if (GUTENBERG_VERSION && !meta.isDev) {
        console.log('Installing Gutenberg version ' + GUTENBERG_VERSION);
        const url = `https://github.com/getzola/zola/releases/download/v${GUTENBERG_VERSION}/gutenberg-v${GUTENBERG_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;
        await fetchBinary(url, 'Gutenberg', GUTENBERG_VERSION);
      }

      // `public` is the default for zero config
      distPath = path.join(
        workPath,
        path.dirname(entrypoint),
        (config.outputDirectory as string) || 'public'
      );
    }

    if (framework) {
      debug(
        `Detected ${framework.name} framework. Optimizing your deployment...`
      );

      if (process.env.VERCEL_URL) {
        const { envPrefix } = framework;
        if (envPrefix) {
          Object.keys(process.env)
            .filter(key => key.startsWith('VERCEL_'))
            .forEach(key => {
              const newKey = `${envPrefix}${key}`;
              if (!(newKey in process.env)) {
                process.env[newKey] = process.env[key];
              }
            });
        }
      }

      if (process.env.VERCEL_ANALYTICS_ID) {
        const frameworkDirectory = path.join(
          workPath,
          path.dirname(entrypoint)
        );
        switch (framework.slug) {
          case 'gatsby':
            await GatsbyUtils.injectVercelAnalyticsPlugin(frameworkDirectory);
            break;
          case 'nuxtjs':
            await NuxtUtils.injectVercelAnalyticsPlugin(frameworkDirectory);
            break;
          default:
            debug(
              `No analytics plugin injected for framework ${framework.slug}`
            );
            break;
        }
      }
    }

    const nodeVersion = await getNodeVersion(
      entrypointDir,
      undefined,
      config,
      meta
    );
    const spawnOpts = getSpawnOptions(meta, nodeVersion);

    /* Don't fail the build on warnings from Create React App.
    Node.js will load 'false' as a string, not a boolean, so it's truthy still.
    This is to ensure we don't accidentally break other packages that check
    if process.env.CI is true somewhere.
    
    https://github.com/facebook/create-react-app/issues/2453
    https://github.com/facebook/create-react-app/pull/2501
    https://github.com/vercel/community/discussions/30
    */
    if (framework && framework.slug === 'create-react-app') {
      if (!spawnOpts.env) {
        spawnOpts.env = {};
      }
      spawnOpts.env.CI = 'false';
    }

    if (meta.isDev) {
      debug('Skipping dependency installation because dev mode is enabled');
    } else {
      let hasPrintedInstall = false;
      const printInstall = () => {
        if (!hasPrintedInstall) {
          console.log('Installing dependencies...');
          hasPrintedInstall = true;
        }
      };

      if (!config.zeroConfig) {
        debug('Detected "builds" - not zero config');
        printInstall();
        const installTime = Date.now();
        await runNpmInstall(entrypointDir, [], spawnOpts, meta, nodeVersion);
        debug(`Install complete [${Date.now() - installTime}ms]`);
        isNpmInstall = true;
      } else if (typeof installCommand === 'string') {
        if (installCommand.trim()) {
          console.log(`Running "install" command: \`${installCommand}\`...`);
          const { cliType, lockfileVersion } = await scanParentDirs(
            entrypointDir
          );
          const env: Record<string, string> = {
            YARN_NODE_LINKER: 'node-modules',
            ...spawnOpts.env,
          };

          if (cliType === 'npm') {
            if (
              typeof lockfileVersion === 'number' &&
              lockfileVersion >= 2 &&
              (nodeVersion?.major || 0) < 16
            ) {
              // Ensure that npm 7 is at the beginning of the `$PATH`
              env.PATH = `/node16/bin-npm7:${env.PATH}`;
              console.log('Detected `package-lock.json` generated by npm 7...');
            }
          }
          await execCommand(installCommand, {
            ...spawnOpts,

            // Yarn v2 PnP mode may be activated, so force
            // "node-modules" linker style
            env,
            cwd: entrypointDir,
          });
          // Its not clear which command was run, so assume all
          isNpmInstall = true;
          isBundleInstall = true;
          isPipInstall = true;
        } else {
          console.log(`Skipping "install" command...`);
        }
      } else {
        if (existsSync(gemfilePath)) {
          debug('Detected Gemfile');
          printInstall();
          const opts = {
            env: {
              ...process.env,
              // See more: https://git.io/JtDwx
              BUNDLE_BIN: 'vendor/bin',
              BUNDLE_CACHE_PATH: 'vendor/cache',
              BUNDLE_PATH: 'vendor/bundle',
              BUNDLE_RETRY: '5',
              BUNDLE_JOBS: String(cpus().length || 1),
              BUNDLE_SILENCE_ROOT_WARNING: '1',
              BUNDLE_DISABLE_SHARED_GEMS: '1',
              BUNDLE_DISABLE_VERSION_CHECK: '1',
            },
          };
          await runBundleInstall(workPath, [], opts, meta);
          isBundleInstall = true;
        }
        if (existsSync(requirementsPath)) {
          debug('Detected requirements.txt');
          printInstall();
          await runPipInstall(
            workPath,
            ['-r', requirementsPath],
            undefined,
            meta
          );
          isPipInstall = true;
        }
        if (pkg) {
          console.log('Detected package.json');
          printInstall();
          const installTime = Date.now();
          await runNpmInstall(entrypointDir, [], spawnOpts, meta, nodeVersion);
          debug(`Install complete [${Date.now() - installTime}ms]`);
          isNpmInstall = true;
        }
      }
    }

    let gemHome: string | undefined = undefined;
    const pathList = [];

    if (isNpmInstall || (pkg && (buildCommand || devCommand))) {
      const nodeBinPath = await getNodeBinPath({ cwd: entrypointDir });
      pathList.push(nodeBinPath); // Add `./node_modules/.bin`
      debug(
        `Added "${nodeBinPath}" to PATH env because a package.json file was found`
      );
    }

    if (isBundleInstall) {
      const vendorBin = path.join(workPath, 'vendor', 'bin');
      pathList.push(vendorBin); // Add `./vendor/bin`
      debug(`Added "${vendorBin}" to PATH env because a Gemfile was found`);
      const dir = path.join(workPath, 'vendor', 'bundle', 'ruby');
      const rubyVersion =
        existsSync(dir) && statSync(dir).isDirectory()
          ? readdirSync(dir)[0]
          : '';
      if (rubyVersion) {
        gemHome = path.join(dir, rubyVersion); // Add `./vendor/bundle/ruby/2.7.0`
        debug(`Set GEM_HOME="${gemHome}" because a Gemfile was found`);
      }
    }

    if (isPipInstall) {
      // TODO: Add bins to PATH once we implement pip caching
    }

    if (spawnOpts?.env?.PATH) {
      // Append system path last so others above take precedence
      pathList.push(spawnOpts.env.PATH);
    }

    spawnOpts.env = {
      ...spawnOpts.env,
      PATH: pathList.join(path.delimiter),
      GEM_HOME: gemHome,
    };

    if (
      meta.isDev &&
      (devCommand ||
        (pkg && devScript && pkg.scripts && pkg.scripts[devScript]))
    ) {
      let devPort: number | undefined = nowDevScriptPorts.get(entrypoint);

      if (typeof devPort === 'number') {
        debug(
          '`%s` server already running for %j',
          devCommand || devScript,
          entrypoint
        );
      } else {
        // Run the `now-dev` or `dev` script out-of-bounds, since it is assumed that
        // it will launch a dev server that never "completes"
        devPort = await getPort();
        nowDevScriptPorts.set(entrypoint, devPort);

        const opts: SpawnOptions = {
          cwd: entrypointDir,
          stdio: 'inherit',
          env: { ...spawnOpts.env, PORT: String(devPort) },
        };

        const cmd = devCommand || `yarn run ${devScript}`;
        const child: ChildProcess = spawnCommand(cmd, opts);

        child.on('exit', () => nowDevScriptPorts.delete(entrypoint));
        nowDevChildProcesses.add(child);

        // Wait for the server to have listened on `$PORT`, after which we
        // will ProxyPass any requests to that development server that come in
        // for this builder.
        try {
          await checkForPort(devPort, DEV_SERVER_PORT_BIND_TIMEOUT);
        } catch (err) {
          throw new Error(
            `Failed to detect a server running on port ${devPort}.\nDetails: https://err.sh/vercel/vercel/now-static-build-failed-to-detect-a-server`
          );
        }

        debug('Detected dev server for %j', entrypoint);
      }

      let srcBase = mountpoint.replace(/^\.\/?/, '');

      if (srcBase.length > 0) {
        srcBase = `/${srcBase}`;
      }

      // We ignore defaultRoutes for `vercel dev`
      // since in this case it will get proxied to
      // a custom server we don't have control over
      routes.push(
        getDevRoute(srcBase, devPort, {
          src: '/(.*)',
          dest: '/$1',
        })
      );
    } else {
      if (meta.isDev) {
        debug(`WARN: A dev script is missing`);
      }

      if (buildCommand) {
        debug(`Executing "${buildCommand}"`);
      }

      const found =
        typeof buildCommand === 'string'
          ? await execCommand(buildCommand, {
              ...spawnOpts,

              // Yarn v2 PnP mode may be activated, so force
              // "node-modules" linker style
              env: {
                YARN_NODE_LINKER: 'node-modules',
                ...spawnOpts.env,
              },

              cwd: entrypointDir,
            })
          : await runPackageJsonScript(
              entrypointDir,
              ['vercel-build', 'now-build', 'build'],
              spawnOpts
            );

      if (!found) {
        throw new Error(
          `Missing required "${
            buildCommand || 'vercel-build'
          }" script in "${entrypoint}"`
        );
      }

      const outputDirPrefix = path.join(workPath, path.dirname(entrypoint));

      if (framework) {
        const outputDirName = config.outputDirectory
          ? config.outputDirectory
          : await framework.getOutputDirName(outputDirPrefix);

        distPath = path.join(outputDirPrefix, outputDirName);
      } else if (!config || !config.distDir) {
        // Select either `dist` or `public` as directory
        const publicPath = path.join(entrypointDir, 'public');

        if (
          !existsSync(distPath) &&
          existsSync(publicPath) &&
          statSync(publicPath).isDirectory()
        ) {
          distPath = publicPath;
        }
      }

      const extraOutputs = await readBuildOutputDirectory({
        workPath,
        nodeVersion,
      });

      if (extraOutputs.routes) {
        routes.push(...extraOutputs.routes);
      }

      if (extraOutputs.images) {
        images = extraOutputs.images;
      }

      if (extraOutputs.staticFiles) {
        output = Object.assign(
          {},
          extraOutputs.staticFiles,
          extraOutputs.functions
        );
      } else {
        // No need to verify the dist dir if there are other output files.
        if (!extraOutputs.functions) {
          validateDistDir(distPath);
        }

        if (framework && !extraOutputs.routes) {
          const frameworkRoutes = await getFrameworkRoutes(
            framework,
            outputDirPrefix
          );
          routes.push(...frameworkRoutes);
        }

        let ignore: string[] = [];
        if (config.zeroConfig && config.outputDirectory === '.') {
          ignore = [
            '.env',
            '.env.*',
            '.git/**',
            '.vercel/**',
            'node_modules/**',
            'yarn.lock',
            'package-lock.json',
            'package.json',
            '.vercel_build_output',
          ];
          debug(`Using ignore: ${JSON.stringify(ignore)}`);
        }
        output = await glob('**', { cwd: distPath, ignore }, mountpoint);
        Object.assign(output, extraOutputs.functions);
      }
    }

    return { routes, images, output };
  }

  if (!config.zeroConfig && entrypoint.endsWith('.sh')) {
    debug(`Running build script "${entrypoint}"`);
    const nodeVersion = await getNodeVersion(
      entrypointDir,
      undefined,
      config,
      meta
    );
    const spawnOpts = getSpawnOptions(meta, nodeVersion);
    await runShellScript(path.join(workPath, entrypoint), [], spawnOpts);
    validateDistDir(distPath);

    const output = await glob('**', distPath, mountpoint);

    return {
      output,
      routes: [],
    };
  }

  let message = `Build "src" is "${entrypoint}" but expected "package.json"`;

  if (!config.zeroConfig) {
    message += ' or "build.sh"';
  }

  throw new Error(message);
};

export const prepareCache: PrepareCache = async ({
  entrypoint,
  workPath,
  config,
}) => {
  const buildConfig = await readBuildOutputConfig<BuildConfig>({
    workPath,
    configFileName: 'build.json',
  });

  if (buildConfig?.cache && Array.isArray(buildConfig.cache)) {
    const cacheFiles = {};
    for (const cacheGlob of buildConfig.cache) {
      Object.assign(cacheFiles, await glob(cacheGlob, workPath));
    }
    return cacheFiles;
  }

  const defaultCacheFiles = await glob(
    '{.shadow-cljs,node_modules}/**',
    workPath
  );

  let frameworkCacheFiles: { [path: string]: FileFsRef } = {};
  const pkg = getPkg(entrypoint, workPath);
  const framework = getFramework(config, pkg);

  if (framework?.cachePattern) {
    frameworkCacheFiles = await glob(framework.cachePattern, workPath);
  }

  return { ...defaultCacheFiles, ...frameworkCacheFiles };
};
