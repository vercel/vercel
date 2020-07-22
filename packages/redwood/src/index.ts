import { join, dirname, relative, parse as parsePath, sep } from 'path';
import {
  BuildOptions,
  Lambda,
  Files,
  PrepareCacheOptions,
  createLambda,
  download,
  glob,
  shouldServe,
  debug,
  getNodeVersion,
  getSpawnOptions,
  runNpmInstall,
  spawnAsync,
  execCommand,
  FileBlob,
  FileFsRef,
} from '@vercel/build-utils';
import { makeAwsLauncher } from './launcher';
const {
  getDependencies,
  // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('@netlify/zip-it-and-ship-it/src/dependencies.js');

const LAUNCHER_FILENAME = '___vc_launcher';
const BRIDGE_FILENAME = '___vc_bridge';
const HELPERS_FILENAME = '___vc_helpers';
const SOURCEMAP_SUPPORT_FILENAME = '__vc_sourcemap_support';

export const version = 2;

export async function build({
  workPath,
  files,
  entrypoint,
  meta = {},
  config = {},
}: BuildOptions) {
  await download(files, workPath, meta);

  const entrypointFsDirname = join(workPath, dirname(entrypoint));
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

  debug('Running build script...');
  await spawnAsync('yarn', ['rw', 'build'], {
    ...spawnOpts,
    cwd: workPath,
    prettyCommand: 'yarn rw build',
  });

  const {
    buildCommand = 'yarn rw db up --no-db-client --auto-approve && yarn rw build',
  } = config;

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

export { shouldServe };
