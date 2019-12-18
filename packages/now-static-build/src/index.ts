import ms from 'ms';
import path from 'path';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import { ChildProcess, SpawnOptions } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { frameworks, Framework } from './frameworks';
import {
  glob,
  download,
  execAsync,
  spawnAsync,
  execCommand,
  spawnCommand,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runPackageJsonScript,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  Files,
  FileFsRef,
  BuildOptions,
  Config,
  debug,
  PackageJson,
  PrepareCacheOptions,
} from '@now/build-utils';
import { Route, Source } from '@now/routing-utils';

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

function validateDistDir(
  distDir: string,
  isDev: boolean | undefined,
  config: Config
) {
  const distDirName = path.basename(distDir);
  const exists = () => existsSync(distDir);
  const isDirectory = () => statSync(distDir).isDirectory();
  const isEmpty = () => readdirSync(distDir).length === 0;

  const hash = isDev
    ? '#local-development'
    : '#configuring-the-build-output-directory';
  const docsUrl = `https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build${hash}`;

  const info = config.zeroConfig
    ? '\nMore details: https://zeit.co/docs/v2/platform/frequently-asked-questions#missing-public-directory'
    : `\nMake sure you configure the the correct distDir: ${docsUrl}`;

  if (!exists()) {
    throw new Error(`No output directory named "${distDirName}" found.${info}`);
  }

  if (!isDirectory()) {
    throw new Error(
      `Build failed because distDir is not a directory: "${distDirName}".${info}`
    );
  }

  if (isEmpty()) {
    throw new Error(
      `Build failed because distDir is empty: "${distDirName}".${info}`
    );
  }
}

function getCommand(pkg: PackageJson, cmd: string, { zeroConfig }: Config) {
  // The `dev` script can be `now dev`
  const nowCmd = `now-${cmd}`;

  if (!zeroConfig && cmd === 'dev') {
    return nowCmd;
  }

  const scripts = (pkg && pkg.scripts) || {};

  if (scripts[nowCmd]) {
    return nowCmd;
  }

  if (scripts[cmd]) {
    return cmd;
  }

  return zeroConfig ? cmd : nowCmd;
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
      process.kill(child.pid, signal);
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

function getFramework(config: Config | null, pkg?: PackageJson | null) {
  const { framework: configFramework = null, outputDirectory = null } =
    config || {};

  if (configFramework && configFramework.slug) {
    const framework = frameworks.find(
      ({ dependency }) => dependency === configFramework.slug
    );

    if (framework) {
      if (!framework.getOutputDirName && outputDirectory) {
        return {
          ...framework,
          getOutputDirName(prefix: string) {
            return Promise.resolve(path.join(prefix, outputDirectory));
          },
        };
      }

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

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}: BuildOptions) {
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

  if (pkg || config.buildCommand) {
    const gemfilePath = path.join(workPath, 'Gemfile');
    const requirementsPath = path.join(workPath, 'requirements.txt');

    let output: Files = {};
    let framework: Framework | undefined = undefined;
    let minNodeRange: string | undefined = undefined;

    const routes: Route[] = [];
    const devScript = pkg ? getCommand(pkg, 'dev', config) : null;

    if (config.zeroConfig) {
      if (existsSync(gemfilePath) && !meta.isDev) {
        debug('Detected Gemfile, executing bundle install...');
        await runBundleInstall(workPath, [], undefined, meta);
      }
      if (existsSync(requirementsPath) && !meta.isDev) {
        debug('Detected requirements.txt, executing pip install...');
        await runPipInstall(
          workPath,
          ['-r', requirementsPath],
          undefined,
          meta
        );
      }

      const { HUGO_VERSION, ZOLA_VERSION, GUTENBERG_VERSION } = process.env;

      if (HUGO_VERSION && !meta.isDev) {
        console.log('Installing Hugo version ' + HUGO_VERSION);
        const [major, minor] = HUGO_VERSION.split('.').map(Number);
        const isOldVersion = major === 0 && minor < 43;
        const prefix = isOldVersion ? `hugo_` : `hugo_extended_`;
        const url = `https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${prefix}${HUGO_VERSION}_Linux-64bit.tar.gz`;
        await spawnAsync(`curl -sSL ${url} | tar -zx -C /usr/local/bin`, [], {
          shell: true,
        });
      }

      if (ZOLA_VERSION && !meta.isDev) {
        console.log('Installing Zola version ' + ZOLA_VERSION);
        const url = `https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/zola-v${ZOLA_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;
        await spawnAsync(`curl -sSL ${url} | tar -zx -C /usr/local/bin`, [], {
          shell: true,
        });
      }

      if (GUTENBERG_VERSION && !meta.isDev) {
        console.log('Installing Gutenberg version ' + GUTENBERG_VERSION);
        const url = `https://github.com/getzola/zola/releases/download/v${GUTENBERG_VERSION}/gutenberg-v${GUTENBERG_VERSION}-x86_64-unknown-linux-gnu.tar.gz`;
        await spawnAsync(`curl -sSL ${url} | tar -zx -C /usr/local/bin`, [], {
          shell: true,
        });
      }

      // `public` is the default for zero config
      distPath = path.join(
        workPath,
        path.dirname(entrypoint),
        (config.outputDirectory as string) || 'public'
      );

      framework = getFramework(config, pkg);
    }

    if (framework) {
      debug(
        `Detected ${framework.name} framework. Optimizing your deployment...`
      );

      if (framework.minNodeRange) {
        minNodeRange = framework.minNodeRange;
        debug(
          `${framework.name} requires Node.js ${framework.minNodeRange}. Switching...`
        );
      } else {
        debug(
          `${framework.name} does not require a specific Node.js version. Continuing ...`
        );
      }
    }

    const nodeVersion = await getNodeVersion(
      entrypointDir,
      minNodeRange,
      config
    );
    const spawnOpts = getSpawnOptions(meta, nodeVersion);

    console.log('Installing dependencies...');
    await runNpmInstall(entrypointDir, ['--prefer-offline'], spawnOpts, meta);

    if (pkg && (config.buildCommand || config.devCommand)) {
      // We want to add `node_modules/.bin` after `npm install`
      const { stdout } = await execAsync('yarn', ['bin'], {
        cwd: entrypointDir,
      });

      spawnOpts.env = {
        ...spawnOpts.env,
        PATH: `${stdout.trim()}${path.delimiter}${
          spawnOpts.env ? spawnOpts.env.PATH : ''
        }`,
      };

      debug(
        `Added "${stdout.trim()}" to PATH env because a package.json file was found.`
      );
    }

    if (
      meta.isDev &&
      (config.devCommand ||
        (pkg && devScript && pkg.scripts && pkg.scripts[devScript]))
    ) {
      let devPort: number | undefined = nowDevScriptPorts.get(entrypoint);

      if (typeof devPort === 'number') {
        debug(
          '`%s` server already running for %j',
          config.devCommand || devScript,
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

        const cmd = config.devCommand || `yarn run ${devScript}`;
        const child: ChildProcess = spawnCommand(cmd, opts);

        child.on('exit', () => nowDevScriptPorts.delete(entrypoint));
        nowDevChildProcesses.add(child);

        // Now wait for the server to have listened on `$PORT`, after which we
        // will ProxyPass any requests to that development server that come in
        // for this builder.
        try {
          await checkForPort(devPort, DEV_SERVER_PORT_BIND_TIMEOUT);
        } catch (err) {
          throw new Error(
            `Failed to detect a server running on port ${devPort}.\nDetails: https://err.sh/zeit/now/now-static-build-failed-to-detect-a-server`
          );
        }

        debug('Detected dev server for %j', entrypoint);
      }

      let srcBase = mountpoint.replace(/^\.\/?/, '');

      if (srcBase.length > 0) {
        srcBase = `/${srcBase}`;
      }

      // We ignore defaultRoutes for `now dev`
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
        debug(`WARN: A dev script is missing.`);
        debug(
          'See the local development docs: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#local-development'
        );
      }

      const buildScript = pkg ? getCommand(pkg, 'build', config) : null;
      debug(
        `Running "${config.buildCommand ||
          buildScript}" script in "${entrypoint}"`
      );

      const found =
        typeof config.buildCommand === 'string'
          ? await execCommand(config.buildCommand, {
              ...spawnOpts,
              cwd: entrypointDir,
            })
          : await runPackageJsonScript(entrypointDir, buildScript!, spawnOpts);

      if (!found) {
        throw new Error(
          `Missing required "${config.buildCommand ||
            buildScript}" script in "${entrypoint}"`
        );
      }

      const outputDirPrefix = path.join(workPath, path.dirname(entrypoint));

      if (framework) {
        const outputDirName = await framework.getOutputDirName(outputDirPrefix);

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

      validateDistDir(distPath, meta.isDev, config);

      if (framework) {
        const frameworkRoutes = await getFrameworkRoutes(
          framework,
          outputDirPrefix
        );
        routes.push(...frameworkRoutes);
      }

      output = await glob('**', distPath, mountpoint);
    }

    const watch = [path.join(mountpoint.replace(/^\.\/?/, ''), '**/*')];
    return { routes, watch, output, distPath };
  }

  if (!config.zeroConfig && entrypoint.endsWith('.sh')) {
    debug(`Running build script "${entrypoint}"`);
    const nodeVersion = await getNodeVersion(entrypointDir, undefined, config);
    const spawnOpts = getSpawnOptions(meta, nodeVersion);
    await runShellScript(path.join(workPath, entrypoint), [], spawnOpts);
    validateDistDir(distPath, meta.isDev, config);

    const output = await glob('**', distPath, mountpoint);

    return {
      output,
      routes: [],
      watch: [],
      distPath,
    };
  }

  let message = `Build "src" is "${entrypoint}" but expected "package.json"`;

  if (!config.zeroConfig) {
    message += ' or "build.sh"';
  }

  throw new Error(message);
}

export async function prepareCache({
  entrypoint,
  workPath,
  config,
}: PrepareCacheOptions): Promise<Files> {
  // default cache paths
  const defaultCacheFiles = await glob('node_modules/**', workPath);

  // framework specific cache paths
  let frameworkCacheFiles: { [path: string]: FileFsRef } | null = null;

  const pkg = getPkg(entrypoint, workPath);
  if (pkg) {
    const framework = getFramework(config, pkg);

    if (framework && framework.cachePattern) {
      frameworkCacheFiles = await glob(framework.cachePattern, workPath);
    }
  }

  return { ...defaultCacheFiles, ...frameworkCacheFiles };
}
