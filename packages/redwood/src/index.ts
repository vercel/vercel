import { join, dirname, relative, parse as parsePath, sep } from 'path';
import { ChildProcess, SpawnOptions } from 'child_process';
import {
  BuildOptions,
  Lambda,
  Files,
  PrepareCacheOptions,
  createLambda,
  download,
  glob,
  debug,
  getNodeVersion,
  getSpawnOptions,
  runNpmInstall,
  execCommand,
  spawnCommand,
  readConfigFile,
  FileBlob,
  FileFsRef,
  NowBuildError,
} from '@vercel/build-utils';
import { makeAwsLauncher } from './launcher';
const {
  getDependencies,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('@netlify/zip-it-and-ship-it/src/dependencies.js');
//@ts-ignore
import isPortReachable from 'is-port-reachable';

interface RedwoodConfig {
  web?: {
    port?: number;
    apiProxyPath?: string;
  };
  api?: {
    port?: number;
  };
  browser?: {
    open?: boolean;
  };
}

const LAUNCHER_FILENAME = '___vc_launcher';
const BRIDGE_FILENAME = '___vc_bridge';
const HELPERS_FILENAME = '___vc_helpers';
const SOURCEMAP_SUPPORT_FILENAME = '__vc_sourcemap_support';

const entrypointToPort = new Map<string, number>();
const childProcesses = new Set<ChildProcess>();
export const version = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForPort(port: number): Promise<boolean> {
  for (let i = 0; i < 500; i++) {
    if (await isPortReachable(port)) {
      return true;
    }
    await sleep(100);
  }
  return false;
}

export async function build({
  workPath,
  files,
  entrypoint,
  meta = {},
  config = {},
}: BuildOptions) {
  await download(files, workPath, meta);

  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
    undefined,
    config,
    meta
  );

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  await runNpmInstall(
    entrypointFsDirname,
    ['--prefer-offline'],
    spawnOpts,
    meta
  );

  const {
    buildCommand = 'yarn rw db up --no-db-client --auto-approve && yarn rw build',
    devCommand = 'yarn rw dev',
  } = config;

  if (meta.isDev) {
    const toml = await readConfigFile<RedwoodConfig>(
      join(mountpoint, 'redwood.toml')
    );
    const webPort = toml?.web?.port || 8910;
    const apiPort = toml?.web?.port || 8911;
    let devPort = entrypointToPort.get(entrypoint);

    if (typeof devPort === 'number') {
      debug('`%s` server already running for %j', devCommand, entrypoint);
    } else {
      devPort = webPort;
      entrypointToPort.set(entrypoint, devPort);

      const opts: SpawnOptions = {
        cwd: mountpoint,
        stdio: 'inherit',
        env: { ...spawnOpts.env, PORT: String(devPort) },
      };

      const child = spawnCommand(devCommand, opts);
      child.on('exit', () => entrypointToPort.delete(entrypoint));
      childProcesses.add(child);

      const found = await waitForPort(devPort);
      if (!found) {
        throw new NowBuildError({
          code: 'REDWOOD_PORT_UNAVAILABLE',
          message: `Failed to detect a server running on port ${devPort}`,
          action: 'More Details',
          link:
            'https://err.sh/vercel/vercel/now-static-build-failed-to-detect-a-server',
        });
      }

      debug('Detected dev server for %j', entrypoint);
    }

    let srcBase = mountpoint.replace(/^\.\/?/, '');

    if (srcBase.length > 0) {
      srcBase = `/${srcBase}`;
    }

    return {
      routes: [
        {
          src: `${srcBase}/api/(.*)`,
          dest: `http://localhost:${apiPort}/$1`,
        },
        {
          src: `${srcBase}/(.*)`,
          dest: `http://localhost:${webPort}/$1`,
        },
      ],
      watch: [join(srcBase, '**/*')],
      output: {},
    };
  }

  debug('Running build command...');
  await execCommand(buildCommand, {
    ...spawnOpts,
    cwd: workPath,
  });

  const apiDistPath = join(workPath, 'api', 'dist', 'functions');
  const webDistPath = join(workPath, 'web', 'dist');
  const lambdaOutputs: { [filePath: string]: Lambda } = {};
  const staticOutputs = await glob('**', webDistPath);

  // Each file in the `functions` dir will become a lambda
  const functionFiles = await glob('*.js', apiDistPath);

  for (const [funcName, fileFsRef] of Object.entries(functionFiles)) {
    const outputName = join('api', parsePath(funcName).name); // remove `.js` extension
    const absEntrypoint = fileFsRef.fsPath;
    const dependencies: string[] = await getDependencies(
      absEntrypoint,
      workPath
    );
    const relativeEntrypoint = relative(workPath, absEntrypoint);
    const awsLambdaHandler = getAWSLambdaHandler(relativeEntrypoint, 'handler');

    const lambdaFiles: Files = {
      [`${LAUNCHER_FILENAME}.js`]: new FileBlob({
        data: makeAwsLauncher({
          entrypointPath: `./${relativeEntrypoint}`,
          bridgePath: `./${BRIDGE_FILENAME}`,
          helpersPath: `./${HELPERS_FILENAME}`,
          sourcemapSupportPath: `./${SOURCEMAP_SUPPORT_FILENAME}`,
          shouldAddHelpers: false,
          shouldAddSourcemapSupport: false,
          awsLambdaHandler,
        }),
      }),
      [`${BRIDGE_FILENAME}.js`]: new FileFsRef({
        fsPath: join(__dirname, 'bridge.js'),
      }),
    };

    dependencies.forEach(fsPath => {
      lambdaFiles[relative(workPath, fsPath)] = new FileFsRef({ fsPath });
    });

    lambdaFiles[relative(workPath, fileFsRef.fsPath)] = fileFsRef;

    const lambda = await createLambda({
      files: lambdaFiles,
      handler: `${LAUNCHER_FILENAME}.launcher`,
      runtime: nodeVersion.runtime,
      environment: {},
    });
    lambdaOutputs[outputName] = lambda;
  }

  return {
    output: { ...staticOutputs, ...lambdaOutputs },
    routes: [{ handle: 'filesystem' }, { src: '/.*', dest: '/index.html' }],
    watch: [],
  };
}

function getAWSLambdaHandler(filePath: string, handlerName: string) {
  const { dir, name } = parsePath(filePath);
  return `${dir}${dir ? sep : ''}${name}.${handlerName}`;
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache = await glob('node_modules/**', workPath);
  return cache;
}
