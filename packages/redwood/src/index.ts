import { join, dirname, parse } from 'path';
import buildUtils from './build-utils';
import { BuildOptions, Lambda as LambdaType } from '@vercel/build-utils';
const {
  download,
  glob,
  shouldServe,
  debug,
  getNodeVersion,
  getSpawnOptions,
  runNpmInstall,
  spawnAsync,
  Lambda,
  streamToBuffer,
} = buildUtils;
// @ts-ignore
import { zipFunctions } from '@netlify/zip-it-and-ship-it';

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

  const lambdaOutputs: { [filePath: string]: LambdaType } = {};

  const staticOutputs = await glob('**', {
    cwd: join(workPath, 'web', 'dist'),
  });

  /*
  const inputFsFiles = await glob('*.js', {
    cwd: join(workPath, 'api', 'dist', 'functions'),
  });
  */

  const apiDistPath = join(workPath, 'api', 'dist', 'functions');
  const zipBallPath = join(workPath, 'api', 'zipballs');
  console.log(`zisi: zip ${apiDistPath} and ship ${zipBallPath}`);
  await zipFunctions(apiDistPath, zipBallPath);

  const zipballs = await glob('*.zip', {
    cwd: zipBallPath,
  });

  for (const [filePath, zipFile] of Object.entries(zipballs)) {
    const functionName = parse(filePath).name;
    const zipBuffer = await streamToBuffer(zipFile.toStream());
    const lambda = new Lambda({
      zipBuffer,
      handler: `${functionName}.handler`,
      runtime: nodeVersion.runtime,
      environment: {},
    });
    lambdaOutputs[join('api', functionName)] = lambda;
  }

  return {
    output: { ...staticOutputs, ...lambdaOutputs },
    routes: [{ handle: 'filesystem' }, { src: '/.*', dest: '/index.html' }],
    watch: [],
  };
}

export { shouldServe };
