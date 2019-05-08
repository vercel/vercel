import { join, dirname, sep } from 'path';
import { readFile } from 'fs-extra';
import {
  glob,
  download,
  FileBlob,
  FileFsRef,
  Files,
  Meta,
  createLambda,
  runNpmInstall,
  runPackageJsonScript,
  PrepareCacheOptions,
  BuildOptions,
  shouldServe,
} from '@now/build-utils';

interface CompilerConfig {
  includeFiles?: string | string[];
}

interface DownloadOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  meta?: Meta;
  npmArguments?: string[];
}

async function downloadInstallAndBundle({
  files,
  entrypoint,
  workPath,
  meta,
  npmArguments = [],
}: DownloadOptions) {
  console.log('downloading user files...');
  const downloadedFiles = await download(files, workPath, meta);

  console.log("installing dependencies for user's code...");
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, npmArguments);

  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, entrypointFsDirname };
}

async function compile(
  entrypointPath: string,
  entrypoint: string,
  config: CompilerConfig
): Promise<Files> {
  const input = entrypointPath;
  const inputDir = dirname(input);
  const rootIncludeFiles = inputDir.split(sep).pop() || '';
  const ncc = require('@zeit/ncc');
  const { code, map, assets } = await ncc(input, {
    sourceMap: true,
    sourceMapRegister: true,
  });

  if (config && config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;

    for (const pattern of includeFiles) {
      const files = await glob(pattern, inputDir);

      for (const assetName of Object.keys(files)) {
        const stream = files[assetName].toStream();
        const { mode } = files[assetName];
        const { data } = await FileBlob.fromStream({ stream });
        let fullPath = join(rootIncludeFiles, assetName);

        // if asset contain directory
        // no need to use `rootIncludeFiles`
        if (assetName.includes(sep)) {
          fullPath = assetName;
        }

        assets[fullPath] = {
          source: data,
          permissions: mode,
        };
      }
    }
  }

  const preparedFiles: Files = {};
  // move all user code to 'user' subdirectory
  preparedFiles[entrypoint] = new FileBlob({ data: code });
  preparedFiles[`${entrypoint.replace('.ts', '.js')}.map`] = new FileBlob({
    data: map,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const { source: data, permissions: mode } = assets[assetName];
    const blob2 = new FileBlob({ data, mode });
    preparedFiles[join(dirname(entrypoint), assetName)] = blob2;
  }

  return preparedFiles;
}

export const config = {
  maxLambdaSize: '5mb',
};

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta,
}: BuildOptions) {
  const {
    entrypointPath,
    entrypointFsDirname,
  } = await downloadInstallAndBundle({
    files,
    entrypoint,
    workPath,
    meta,
    npmArguments: ['--prefer-offline'],
  });

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('compiling entrypoint with ncc...');
  const preparedFiles = await compile(entrypointPath, entrypoint, config);
  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [
      `listener = require("./${entrypoint}");`,
      'if (listener.default) listener = listener.default;',
    ].join(' ')
  );

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
  };

  const lambda = await createLambda({
    files: { ...preparedFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10',
  });

  return { [entrypoint]: lambda };
}

export async function prepareCache({ workPath }: PrepareCacheOptions) {
  return {
    ...(await glob('node_modules/**', workPath)),
    ...(await glob('package-lock.json', workPath)),
    ...(await glob('yarn.lock', workPath)),
  };
}

export { shouldServe };
