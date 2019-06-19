import { readFile } from 'fs-extra';
import { Assets, NccOptions } from '@zeit/ncc';
import { join, dirname, relative, sep } from 'path';
import { NccWatcher, WatcherResult } from '@zeit/ncc-watcher';
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
  enginesMatch,
  PrepareCacheOptions,
  BuildOptions,
  shouldServe,
} from '@now/build-utils';
import { SpawnOptions } from 'child_process';
export { NowRequest, NowResponse } from './types';

interface CompilerConfig {
  includeFiles?: string | string[];
}

interface DownloadOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  meta: Meta;
}

const watchers: Map<string, NccWatcher> = new Map();

function getWatcher(entrypoint: string, options: NccOptions): NccWatcher {
  let watcher = watchers.get(entrypoint);
  if (!watcher) {
    watcher = new NccWatcher(entrypoint, options);
    watchers.set(entrypoint, watcher);
  }
  return watcher;
}

function toBuffer(data: string | Buffer): Buffer {
  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8');
  }
  return data;
}

function getSpawnOptions(meta: Meta, useNode10: boolean): SpawnOptions {
  const opts = {
    env: { ...process.env },
  };

  if (!meta.isDev) {
    if (useNode10) {
      opts.env.PATH = '/node10/bin:' + opts.env.PATH;
    } else {
      opts.env.PATH = '/node8/bin:' + opts.env.PATH;
    }
  }

  return opts;
}

async function downloadInstallAndBundle({
  files,
  entrypoint,
  workPath,
  meta,
}: DownloadOptions) {
  console.log('downloading user files...');
  const downloadedFiles = await download(files, workPath, meta);

  console.log("installing dependencies for user's code...");
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const useNode10 = await enginesMatch(entrypointFsDirname, '10.x');
  const spawnOpts = getSpawnOptions(meta, useNode10);
  await runNpmInstall(entrypointFsDirname, ['--prefer-offline'], spawnOpts);

  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, entrypointFsDirname, useNode10, spawnOpts };
}

async function compile(
  workPath: string,
  entrypointPath: string,
  entrypoint: string,
  config: CompilerConfig,
  { isDev, filesChanged, filesRemoved }: Meta
): Promise<{ preparedFiles: Files; watch: string[] }> {
  const input = entrypointPath;
  const inputDir = dirname(input);
  const rootIncludeFiles = inputDir.split(sep).pop() || '';
  const options: NccOptions = {
    sourceMap: true,
    sourceMapRegister: true,
  };
  let code: string;
  let map: string | undefined;
  let assets: Assets | undefined;
  let watch: string[] = [];
  if (isDev) {
    const watcher = getWatcher(entrypointPath, options);
    const result = await watcher.build(
      Array.isArray(filesChanged)
        ? filesChanged.map(f => join(workPath, f))
        : undefined,
      Array.isArray(filesRemoved)
        ? filesRemoved.map(f => join(workPath, f))
        : undefined
    );
    code = result.code;
    map = result.map;
    assets = result.assets;
    watch = [...result.files, ...result.dirs, ...result.missing]
      .filter(f => f.startsWith(workPath))
      .map(f => relative(workPath, f));
  } else {
    const ncc = require('@zeit/ncc');
    const result = await ncc(input, {
      sourceMap: true,
      sourceMapRegister: true,
    });
    code = result.code;
    map = result.map;
    assets = result.assets;
  }

  if (!assets) assets = {};

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
          source: toBuffer(data),
          permissions: mode,
        };
      }
    }
  }

  const preparedFiles: Files = {};
  preparedFiles[entrypoint] = new FileBlob({ data: code });

  if (map) {
    preparedFiles[`${entrypoint.replace('.ts', '.js')}.map`] = new FileBlob({
      data: toBuffer(map),
    });
  }

  // move all user code to 'user' subdirectory
  // eslint-disable-next-line no-restricted-syntax
  for (const assetName of Object.keys(assets)) {
    const { source: data, permissions: mode } = assets[assetName];
    const blob2 = new FileBlob({ data, mode });
    preparedFiles[join(dirname(entrypoint), assetName)] = blob2;
  }

  return { preparedFiles, watch };
}

export const version = 2;

export const config = {
  maxLambdaSize: '5mb',
};

export async function build({
  files,
  entrypoint,
  workPath,
  config,
  meta = {},
}: BuildOptions) {
  const shouldAddHelpers = !(config && config.helpers === false);

  const {
    entrypointPath,
    entrypointFsDirname,
    useNode10,
    spawnOpts,
  } = await downloadInstallAndBundle({
    files,
    entrypoint,
    workPath,
    meta,
  });

  console.log('running user script...');
  await runPackageJsonScript(entrypointFsDirname, 'now-build', spawnOpts);

  console.log('compiling entrypoint with ncc...');
  const { preparedFiles, watch } = await compile(
    workPath,
    entrypointPath,
    entrypoint,
    config,
    meta
  );
  const launcherPath = join(__dirname, 'launcher.js');
  let launcherData = await readFile(launcherPath, 'utf8');

  launcherData = launcherData.replace(
    '// PLACEHOLDER:shouldStoreProxyRequests',
    shouldAddHelpers ? 'shouldStoreProxyRequests = true;' : ''
  );

  launcherData = launcherData.replace(
    '// PLACEHOLDER:setServer',
    [
      `let listener = require("./${entrypoint}");`,
      'if (listener.default) listener = listener.default;',
      shouldAddHelpers
        ? 'const server = require("./helpers").createServerWithHelpers(listener, bridge);'
        : 'const server = require("http").createServer(listener);',
      'bridge.setServer(server);',
    ].join(' ')
  );

  const launcherFiles: Files = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') }),
  };

  if (shouldAddHelpers) {
    launcherFiles['helpers.js'] = new FileFsRef({
      fsPath: join(__dirname, 'helpers.js'),
    });
  }

  const lambda = await createLambda({
    files: {
      ...preparedFiles,
      ...launcherFiles,
    },
    handler: 'launcher.launcher',
    runtime: useNode10 ? 'nodejs10.x' : 'nodejs8.10',
  });

  const output = { [entrypoint]: lambda };
  const result = { output, watch };
  return result;
}

export async function prepareCache({ workPath }: PrepareCacheOptions) {
  return {
    ...(await glob('node_modules/**', workPath)),
    ...(await glob('package-lock.json', workPath)),
    ...(await glob('yarn.lock', workPath)),
  };
}

export { shouldServe };
