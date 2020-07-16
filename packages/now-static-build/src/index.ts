import ms from 'ms';
import path from 'path';
import fetch from 'node-fetch';
import getPort from 'get-port';
import isPortReachable from 'is-port-reachable';
import { ChildProcess, SpawnOptions } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { frameworks, Framework } from './frameworks';
import buildUtils from './build-utils';
import {
  Files,
  FileFsRef,
  BuildOptions,
  Config,
  PackageJson,
  PrepareCacheOptions,
} from '@vercel/build-utils';
const {
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
} = buildUtils;
import { Route, Source } from '@vercel/routing-utils';
import { getVercelIgnore } from '@vercel/client';

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
  name: 'build' | 'dev',
  pkg: PackageJson | null,
  config: Config,
  framework: Framework | undefined
) {
  if (!config.zeroConfig) {
    return null;
  }

  const propName = name === 'build' ? 'buildCommand' : 'devCommand';

  if (typeof config[propName] === 'string') {
    return config[propName];
  }

  if (pkg) {
    const scriptName = getScriptName(pkg, name, config);

    if (hasScript(scriptName, pkg)) {
      return null;
    }
  }

  if (framework) {
    return framework[propName] || null;
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

  const devScript = pkg ? getScriptName(pkg, 'dev', config) : null;

  const framework = getFramework(config, pkg);

  const devCommand = getCommand('dev', pkg, config, framework);
  const buildCommand = getCommand('build', pkg, config, framework);

  if (pkg || buildCommand) {
    const gemfilePath = path.join(workPath, 'Gemfile');
    const requirementsPath = path.join(workPath, 'requirements.txt');

    let output: Files = {};

    const routes: Route[] = [];

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
    }

    const nodeVersion = await getNodeVersion(
      entrypointDir,
      undefined,
      config,
      meta
    );
    const spawnOpts = getSpawnOptions(meta, nodeVersion);

    if (meta.isDev) {
      debug('Skipping dependency installation because dev mode is enabled');
    } else {
      const installTime = Date.now();
      console.log('Installing dependencies...');
      await runNpmInstall(entrypointDir, ['--prefer-offline'], spawnOpts, meta);
      debug(`Install complete [${Date.now() - installTime}ms]`);
    }

    if (pkg && (buildCommand || devCommand)) {
      // We want to add `node_modules/.bin` after `npm install`
      const nodeBinPath = await getNodeBinPath({ cwd: entrypointDir });

      spawnOpts.env = {
        ...spawnOpts.env,
        PATH: `${nodeBinPath}${path.delimiter}${
          spawnOpts.env ? spawnOpts.env.PATH : ''
        }`,
      };

      debug(
        `Added "${nodeBinPath}" to PATH env because a package.json file was found.`
      );
    }

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
        debug(`WARN: A dev script is missing.`);
      }

      if (buildCommand) {
        debug(`Executing "${buildCommand}"`);
      }

      const found =
        typeof buildCommand === 'string'
          ? await execCommand(buildCommand, {
              ...spawnOpts,
              cwd: entrypointDir,
            })
          : await runPackageJsonScript(entrypointDir, 'build', spawnOpts);

      if (!found) {
        throw new Error(
          `Missing required "${
            buildCommand || 'build'
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

      validateDistDir(distPath);

      if (framework) {
        const frameworkRoutes = await getFrameworkRoutes(
          framework,
          outputDirPrefix
        );
        routes.push(...frameworkRoutes);
      }

      let ignore: string[] = [];
      if (config.zeroConfig) {
        const result = await getVercelIgnore(distPath);
        ignore = result.ignores
          .map(file => (file.endsWith('/') ? `${file}**` : file))
          .concat([
            '.env',
            '.env.*',
            'yarn.lock',
            'package-lock.json',
            'package.json',
          ]);
        debug(`Using ignore: ${JSON.stringify(ignore)}`);
      }
      output = await glob('**', { cwd: distPath, ignore }, mountpoint);
    }

    const watch = [path.join(mountpoint.replace(/^\.\/?/, ''), '**/*')];
    return { routes, watch, output, distPath };
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
