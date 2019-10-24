import ms from 'ms';
import path from 'path';
import spawn from 'cross-spawn';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import { ChildProcess, SpawnOptions } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { frameworks, Framework } from './frameworks';
import {
  glob,
  download,
  spawnAsync,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runPackageJsonScript,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  Files,
  Route,
  BuildOptions,
  Config,
  debug,
  PackageJson,
  PrepareCacheOptions,
} from '@now/build-utils';

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
    ? '\nMore details: https://zeit.co/docs/v2/advanced/platform/frequently-asked-questions#missing-public-directory'
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

const getDevRoute = (srcBase: string, devPort: number, route: Route) => {
  const basic: Route = {
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

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}: BuildOptions) {
  debug('Downloading user files...');
  await download(files, workPath, meta);

  const mountpoint = path.dirname(entrypoint);
  const entrypointDir = path.join(workPath, mountpoint);

  let distPath = path.join(
    workPath,
    path.dirname(entrypoint),
    (config && (config.distDir as string)) || 'dist'
  );

  const entrypointName = path.basename(entrypoint);

  if (entrypointName === 'package.json') {
    const pkgPath = path.join(workPath, entrypoint);
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
    const gemfilePath = path.join(workPath, 'Gemfile');
    const requirementsPath = path.join(workPath, 'requirements.txt');

    let output: Files = {};
    let framework: Framework | undefined = undefined;
    let minNodeRange: string | undefined = undefined;

    const routes: Route[] = [];
    const devScript = getCommand(pkg, 'dev', config as Config);

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
      distPath = path.join(workPath, path.dirname(entrypoint), 'public');

      const dependencies = Object.assign(
        {},
        pkg.dependencies,
        pkg.devDependencies
      );

      framework = frameworks.find(
        ({ dependency }) => dependencies[dependency || '']
      );
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

      if (framework.beforeBuildHook) {
        await framework.beforeBuildHook(entrypointDir);
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

    if (meta.isDev && pkg.scripts && pkg.scripts[devScript]) {
      let devPort: number | undefined = nowDevScriptPorts.get(entrypoint);

      if (typeof devPort === 'number') {
        debug('`%s` server already running for %j', devScript, entrypoint);
      } else {
        // Run the `now-dev` or `dev` script out-of-bounds, since it is assumed that
        // it will launch a dev server that never "completes"
        devPort = await getPort();
        nowDevScriptPorts.set(entrypoint, devPort);

        const opts: SpawnOptions = {
          cwd: entrypointDir,
          stdio: 'inherit',
          env: { ...process.env, PORT: String(devPort) },
        };

        const child: ChildProcess = spawn('yarn', ['run', devScript], opts);
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
        debug(`WARN: "${devScript}" script is missing from package.json`);
        debug(
          'See the local development docs: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#local-development'
        );
      }

      const buildScript = getCommand(pkg, 'build', config as Config);
      debug(`Running "${buildScript}" script in "${entrypoint}"`);

      const found = await runPackageJsonScript(
        entrypointDir,
        buildScript,
        spawnOpts
      );

      if (!found) {
        throw new Error(
          `Missing required "${buildScript}" script in "${entrypoint}"`
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

  if (!config.zeroConfig && entrypointName.endsWith('.sh')) {
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

export async function prepareCache({ workPath }: PrepareCacheOptions) {
  return {
    ...(await glob('node_modules/**', workPath)),
    ...(await glob('package-lock.json', workPath)),
    ...(await glob('yarn.lock', workPath)),
  };
}
