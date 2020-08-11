import { join, dirname, relative, parse as parsePath, sep } from 'path';
import { readFileSync } from 'fs';
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
  runPackageJsonScript,
  execCommand,
  FileBlob,
  FileFsRef,
  PackageJson,
  NowBuildError,
} from '@vercel/build-utils';
import { makeAwsLauncher } from './launcher';
import _frameworks, { Framework } from '@vercel/frameworks';
const frameworks = _frameworks as Framework[];
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

  if (meta.isDev) {
    debug('Detected @vercel/redwood dev, returning routes...');

    let srcBase = mountpoint.replace(/^\.\/?/, '');

    if (srcBase.length > 0) {
      srcBase = `/${srcBase}`;
    }

    return {
      routes: [
        {
          src: `${srcBase}/(.*)`,
          dest: `http://localhost:$PORT/$1`,
        },
      ],
      output: {},
    };
  }

  const { buildCommand } = config;
  const frmwrkCmd = frameworks.find(f => f.slug === 'redwoodjs')?.settings
    .buildCommand;
  const pkgPath = join(workPath, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
  if (buildCommand) {
    debug(`Executing build command "${buildCommand}"`);
    await execCommand(buildCommand, {
      ...spawnOpts,
      cwd: workPath,
    });
  } else if (hasScript('vercel-build', pkg)) {
    debug(`Executing "yarn vercel-build"`);
    await runPackageJsonScript(workPath, 'vercel-build', spawnOpts);
  } else if (hasScript('build', pkg)) {
    debug(`Executing "yarn build"`);
    await runPackageJsonScript(workPath, 'build', spawnOpts);
  } else if (frmwrkCmd && 'value' in frmwrkCmd) {
    const cmd = frmwrkCmd.value;
    debug(`Executing framework command "${cmd}"`);
    await execCommand(cmd, {
      ...spawnOpts,
      cwd: workPath,
    });
  } else {
    throw new NowBuildError({
      code: 'REDWOOD_BUILD_COMMAND_MISSING',
      message:
        'An unexpected error occurred while building RedwoodJS. Please contact support.',
      action: 'Contact Support',
      link: 'https://vercel.com/support/request',
    });
  }

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

    for (const fsPath of dependencies) {
      lambdaFiles[relative(workPath, fsPath)] = await FileFsRef.fromFsPath({
        fsPath,
      });
    }

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

function hasScript(scriptName: string, pkg: PackageJson) {
  const scripts = (pkg && pkg.scripts) || {};
  return typeof scripts[scriptName] === 'string';
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache = await glob('node_modules/**', workPath);
  return cache;
}
