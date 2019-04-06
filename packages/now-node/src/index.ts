import { join, dirname } from 'path';
import { remove, readFile } from 'fs-extra';
import {
  glob,
  download,
  FileBlob,
  FileFsRef,
  Files,
  createLambda,
  runNpmInstall,
  runPackageJsonScript,
  PrepareCacheOptions,
  BuildOptions,
} from '@now/build-utils';

interface CompilerConfig {
  includeFiles?: string[]
}

interface DownloadOptions {
  files: Files,
  entrypoint: string;
  workPath: string;
  npmArguments?: string[];
}

async function downloadInstallAndBundle({
  files,
  entrypoint,
  workPath,
  npmArguments = []
}: DownloadOptions) {
  const userPath = join(workPath, 'user');
  const nccPath = join(workPath, 'ncc');

  console.log('downloading user files...');
  const downloadedFiles = await download(files, userPath);

  console.log("installing dependencies for user's code...");
  const entrypointFsDirname = join(userPath, dirname(entrypoint));
  await runNpmInstall(entrypointFsDirname, npmArguments);

  console.log('writing ncc package.json...');
  await download(
    {
      'package.json': new FileBlob({
        data: JSON.stringify({
          license: 'UNLICENSED',
          dependencies: {
            '@zeit/ncc': '0.17.3',
          }
        })
      })
    },
    nccPath
  );

  console.log('installing dependencies for ncc...');
  await runNpmInstall(nccPath, npmArguments);
  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, workNccPath: nccPath, entrypointFsDirname };
}

async function compile(workNccPath: string, entrypointPath: string, entrypoint: string, config: CompilerConfig): Promise<Files> {
  const input = entrypointPath;
  const inputDir = dirname(input);
  const ncc = require(join(workNccPath, 'node_modules/@zeit/ncc'));
  const { code, assets } = await ncc(input);

  if (config && config.includeFiles) {
    for (const pattern of config.includeFiles) {
      const files = await glob(pattern, inputDir);

      for (const assetName of Object.keys(files)) {
        const stream = files[assetName].toStream();
        const { mode } = files[assetName];
        const { data } = await FileBlob.fromStream({ stream });

        assets[assetName] = {
          'source': data,
          'permissions': mode
        };
      }
    }
  }

  const preparedFiles: Files = {};
  const blob = new FileBlob({ data: code });
  // move all user code to 'user' subdirectory
  preparedFiles[join('user', entrypoint)] = blob;
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const { source: data, permissions: mode } = assets[assetName];
    const blob2 = new FileBlob({ data, mode });
    preparedFiles[join('user', dirname(entrypoint), assetName)] = blob2;
  }

  return preparedFiles;
}

export const config = {
  maxLambdaSize: '5mb'
};

export async function build({ files, entrypoint, workPath, config }: BuildOptions) {
  const {
    entrypointPath,
    workNccPath,
    entrypointFsDirname
 } = await downloadInstallAndBundle(
    { files, entrypoint, workPath, npmArguments: ['--prefer-offline'] }
  );

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build');

  console.log('compiling entrypoint with ncc...');
  const preparedFiles = await compile(workNccPath, entrypointPath, entrypoint, config);
  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  launcherData = launcherData.replace(
    '// PLACEHOLDER',
    [
      'process.chdir("./user");',
      `listener = require("./${join('user', entrypoint)}");`,
      'if (listener.default) listener = listener.default;'
    ].join(' ')
  );

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  };

  const lambda = await createLambda({
    files: { ...preparedFiles, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10'
  });

  return { [entrypoint]: lambda };
}

export async function prepareCache({ workPath }: PrepareCacheOptions) {
  return {
    ...(await glob('user/node_modules/**', workPath)),
    ...(await glob('user/package-lock.json', workPath)),
    ...(await glob('user/yarn.lock', workPath)),
    ...(await glob('ncc/node_modules/**', workPath)),
    ...(await glob('ncc/package-lock.json', workPath)),
    ...(await glob('ncc/yarn.lock', workPath))
  };
}
