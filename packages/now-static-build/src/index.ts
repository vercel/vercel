import path from 'path';
import spawn from 'cross-spawn';
import getPort from 'get-port';
import { timeout } from 'promise-timeout';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import frameworks from './frameworks';
import {
  glob,
  download,
  runNpmInstall,
  runPackageJsonScript,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  Files,
  Route,
  BuildOptions,
  Config,
} from '@now/build-utils';

interface PackageJson {
  scripts?: {
    [key: string]: string;
  };
  dependencies?: {
    [key: string]: string;
  };
  devDependencies?: {
    [key: string]: string;
  };
}

interface Framework {
  name: string;
  dependency: string;
  getOutputDirName: (dirPrefix: string) => Promise<string>;
  defaultRoutes?: Route[];
  minNodeRange?: string;
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

const nowDevScriptPorts = new Map();

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

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}: BuildOptions) {
  console.log('Downloading user files...');
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
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    let output: Files = {};
    let framework: Framework | undefined = undefined;
    let minNodeRange: string | undefined = undefined;

    const routes: Route[] = [];
    const devScript = getCommand(pkg, 'dev', config as Config);

    if (config.zeroConfig) {
      // `public` is the default for zero config
      distPath = path.join(workPath, path.dirname(entrypoint), 'public');

      const dependencies = Object.assign(
        {},
        pkg.dependencies,
        pkg.devDependencies
      );

      framework = frameworks.find(({ dependency }) => dependencies[dependency]);
    }

    if (framework) {
      console.log(
        `Detected ${framework.name} framework. Optimizing your deployment...`
      );

      if (framework.minNodeRange) {
        minNodeRange = framework.minNodeRange;
        console.log(
          `${framework.name} requires Node.js ${
            framework.minNodeRange
          }. Switching...`
        );
      } else {
        console.log(
          `${
            framework.name
          } does not require a specific Node.js version. Continuing ...`
        );
      }
    }

    const nodeVersion = await getNodeVersion(
      entrypointDir,
      minNodeRange,
      config
    );
    const spawnOpts = getSpawnOptions(meta, nodeVersion);

    await runNpmInstall(entrypointDir, ['--prefer-offline'], spawnOpts);

    if (meta.isDev && pkg.scripts && pkg.scripts[devScript]) {
      let devPort: number | undefined = nowDevScriptPorts.get(entrypoint);

      if (framework && framework.defaultRoutes) {
        // We need to delete the routes for `now dev`
        // since in this case it will get proxied to
        // a custom server we don't have controll over
        delete framework.defaultRoutes;
      }

      if (typeof devPort === 'number') {
        console.log(
          '`%s` server already running for %j',
          devScript,
          entrypoint
        );
      } else {
        // Run the `now-dev` or `dev` script out-of-bounds, since it is assumed that
        // it will launch a dev server that never "completes"
        devPort = await getPort();
        nowDevScriptPorts.set(entrypoint, devPort);

        const opts = {
          cwd: entrypointDir,
          env: { ...process.env, PORT: String(devPort) },
        };

        const child = spawn('yarn', ['run', devScript], opts);
        child.on('exit', () => nowDevScriptPorts.delete(entrypoint));
        if (child.stdout) {
          child.stdout.setEncoding('utf8');
          child.stdout.pipe(process.stdout);
        }
        if (child.stderr) {
          child.stderr.setEncoding('utf8');
          child.stderr.pipe(process.stderr);
        }

        // Now wait for the server to have listened on `$PORT`, after which we
        // will ProxyPass any requests to that development server that come in
        // for this builder.
        try {
          await timeout(
            new Promise(resolve => {
              const checkForPort = (data: string) => {
                // Check the logs for the URL being printed with the port number
                // (i.e. `http://localhost:47521`).
                if (data.indexOf(`:${devPort}`) !== -1) {
                  resolve();
                }
              };
              if (child.stdout) {
                child.stdout.on('data', checkForPort);
              }
              if (child.stderr) {
                child.stderr.on('data', checkForPort);
              }
            }),
            5 * 60 * 1000
          );
        } catch (err) {
          throw new Error(
            `Failed to detect a server running on port ${devPort}.\nDetails: https://err.sh/zeit/now-builders/now-static-build-failed-to-detect-a-server`
          );
        }

        console.log('Detected dev server for %j', entrypoint);
      }

      let srcBase = mountpoint.replace(/^\.\/?/, '');

      if (srcBase.length > 0) {
        srcBase = `/${srcBase}`;
      }

      if (framework && framework.defaultRoutes) {
        for (const route of framework.defaultRoutes) {
          routes.push(getDevRoute(srcBase, devPort, route));
        }
      }

      routes.push(
        getDevRoute(srcBase, devPort, {
          src: '/(.*)',
          dest: '/$1',
        })
      );
    } else {
      if (meta.isDev) {
        console.log(`WARN: "${devScript}" script is missing from package.json`);
        console.log(
          'See the local development docs: https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build/#local-development'
        );
      }

      const buildScript = getCommand(pkg, 'build', config as Config);
      console.log(`Running "${buildScript}" script in "${entrypoint}"`);

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

      if (framework) {
        const outputDirPrefix = path.join(workPath, path.dirname(entrypoint));
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
      output = await glob('**', distPath, mountpoint);

      if (framework && framework.defaultRoutes) {
        routes.push(...framework.defaultRoutes);
      }
    }

    const watch = [path.join(mountpoint.replace(/^\.\/?/, ''), '**/*')];
    return { routes, watch, output };
  }

  if (!config.zeroConfig && entrypointName.endsWith('.sh')) {
    console.log(`Running build script "${entrypoint}"`);
    const nodeVersion = await getNodeVersion(entrypointDir, undefined, config);
    const spawnOpts = getSpawnOptions(meta, nodeVersion);
    await runShellScript(path.join(workPath, entrypoint), [], spawnOpts);
    validateDistDir(distPath, meta.isDev, config);
    
    const output = await glob('**', distPath, mountpoint);

    return {
      output,
      routes: [],
      watch: []
    };
  }

  let message = `Build "src" is "${entrypoint}" but expected "package.json"`;

  if (!config.zeroConfig) {
    message += ' or "build.sh"';
  }

  throw new Error(message);
}
