import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
  parse as parsePath,
} from 'path';
import nodeFileTrace from '@zeit/node-file-trace';
import {
  glob,
  download,
  File,
  FileBlob,
  FileFsRef,
  Files,
  Meta,
  createLambda,
  runNpmInstall,
  runPackageJsonScript,
  getNodeVersion,
  getSpawnOptions,
  PrepareCacheOptions,
  BuildOptions,
  shouldServe,
  Config,
  debug,
  isSymbolicLink,
} from '@now/build-utils';
export { shouldServe };
export { NowRequest, NowResponse } from './types';
import { makeNowLauncher, makeAwsLauncher } from './launcher';
import { readFileSync, lstatSync, readlinkSync, statSync } from 'fs';
import { Register, register } from './typescript';

interface CompilerConfig {
  debug?: boolean;
  includeFiles?: string | string[];
  excludeFiles?: string | string[];
}

interface DownloadOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  config: Config;
  meta: Meta;
}

// eslint-disable-next-line no-useless-escape
const libPathRegEx = /^node_modules|[\/\\]node_modules[\/\\]/;

const LAUNCHER_FILENAME = '___now_launcher';
const BRIDGE_FILENAME = '___now_bridge';
const HELPERS_FILENAME = '___now_helpers';
const SOURCEMAP_SUPPORT_FILENAME = '__sourcemap_support';

async function downloadInstallAndBundle({
  files,
  entrypoint,
  workPath,
  config,
  meta,
}: DownloadOptions) {
  const downloadedFiles = await download(files, workPath, meta);

  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
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
    await runNpmInstall(
      entrypointFsDirname,
      ['--prefer-offline'],
      spawnOpts,
      meta
    );
    debug(`Install complete [${Date.now() - installTime}ms]`);
  }

  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, entrypointFsDirname, nodeVersion, spawnOpts };
}

async function compile(
  workPath: string,
  entrypointPath: string,
  entrypoint: string,
  config: CompilerConfig
): Promise<{
  preparedFiles: Files;
  shouldAddSourcemapSupport: boolean;
  watch: string[];
}> {
  const inputFiles = new Set<string>([entrypointPath]);

  const sourceCache = new Map<string, string | Buffer | null>();
  const fsCache = new Map<string, File>();
  const tsCompiled = new Set<string>();

  let shouldAddSourcemapSupport = false;

  if (config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;

    for (const pattern of includeFiles) {
      const files = await glob(pattern, workPath);
      await Promise.all(
        Object.keys(files).map(async file => {
          const entry: FileFsRef = files[file];
          fsCache.set(file, entry);
          const stream = entry.toStream();
          const { data } = await FileBlob.fromStream({ stream });
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            sourceCache.set(
              file,
              compileTypeScript(resolve(workPath, file), data.toString())
            );
          } else {
            sourceCache.set(file, data);
          }
          inputFiles.add(resolve(workPath, file));
        })
      );
    }
  }

  debug(
    'Tracing input files: ' +
      [...inputFiles].map(p => relative(workPath, p)).join(', ')
  );

  const preparedFiles: Files = {};

  let tsCompile: Register;
  function compileTypeScript(path: string, source: string): string {
    const relPath = relative(workPath, path);
    if (!tsCompile) {
      tsCompile = register({
        basePath: workPath, // The base is the same as root now.json dir
        project: path, // Resolve tsconfig.json from entrypoint dir
        files: true, // Include all files such as global `.d.ts`
      });
    }
    const { code, map } = tsCompile(source, path);
    tsCompiled.add(relPath);
    preparedFiles[
      relPath.slice(0, -3 - Number(path.endsWith('x'))) + '.js.map'
    ] = new FileBlob({
      data: JSON.stringify(map),
    });
    source = code;
    shouldAddSourcemapSupport = true;
    return source;
  }

  const { fileList, esmFileList, warnings } = await nodeFileTrace(
    [...inputFiles],
    {
      base: workPath,
      ts: true,
      mixedModules: true,
      ignore: config.excludeFiles,
      readFile(fsPath: string): Buffer | string | null {
        const relPath = relative(workPath, fsPath);
        const cached = sourceCache.get(relPath);
        if (cached) return cached.toString();
        // null represents a not found
        if (cached === null) return null;
        try {
          let source: string | Buffer = readFileSync(fsPath);
          if (fsPath.endsWith('.ts') || fsPath.endsWith('.tsx')) {
            source = compileTypeScript(fsPath, source.toString());
          }
          const { mode } = lstatSync(fsPath);
          let entry: File;
          if (isSymbolicLink(mode)) {
            entry = new FileFsRef({ fsPath, mode });
          } else {
            entry = new FileBlob({ data: source, mode });
          }
          fsCache.set(relPath, entry);
          sourceCache.set(relPath, source);
          return source.toString();
        } catch (e) {
          if (e.code === 'ENOENT' || e.code === 'EISDIR') {
            sourceCache.set(relPath, null);
            return null;
          }
          throw e;
        }
      },
    }
  );

  for (const warning of warnings) {
    if (warning && warning.stack) {
      debug(warning.stack.replace('Error: ', 'Warning: '));
    }
  }

  for (const path of fileList) {
    let entry = fsCache.get(path);
    if (!entry) {
      const fsPath = resolve(workPath, path);
      const { mode } = lstatSync(fsPath);
      if (isSymbolicLink(mode)) {
        entry = new FileFsRef({ fsPath, mode });
      } else {
        const source = readFileSync(fsPath);
        entry = new FileBlob({ data: source, mode });
      }
    }
    if (isSymbolicLink(entry.mode) && entry.fsPath) {
      // ensure the symlink target is added to the file list
      const symlinkTarget = relative(
        workPath,
        resolve(dirname(entry.fsPath), readlinkSync(entry.fsPath))
      );
      if (
        !symlinkTarget.startsWith('..' + sep) &&
        fileList.indexOf(symlinkTarget) === -1
      ) {
        const stats = statSync(resolve(workPath, symlinkTarget));
        if (stats.isFile()) {
          fileList.push(symlinkTarget);
        }
      }
    }
    // Rename .ts -> .js (except for entry)
    // There is a bug on Windows where entrypoint uses forward slashes
    // and workPath uses backslashes so we use resolve before comparing.
    if (
      resolve(workPath, path) !== resolve(workPath, entrypoint) &&
      tsCompiled.has(path)
    ) {
      preparedFiles[
        path.slice(0, -3 - Number(path.endsWith('x'))) + '.js'
      ] = entry;
    } else preparedFiles[path] = entry;
  }

  // Compile ES Modules into CommonJS
  const esmPaths = esmFileList.filter(
    file =>
      !file.endsWith('.ts') &&
      !file.endsWith('.tsx') &&
      !file.match(libPathRegEx)
  );
  if (esmPaths.length) {
    const babelCompile = require('./babel').compile;
    for (const path of esmPaths) {
      const filename = basename(path);
      const { data: source } = await FileBlob.fromStream({
        stream: preparedFiles[path].toStream(),
      });

      const { code, map } = babelCompile(filename, source);
      shouldAddSourcemapSupport = true;
      preparedFiles[path] = new FileBlob({
        data: `${code}\n//# sourceMappingURL=${filename}.map`,
      });
      delete map.sourcesContent;
      preparedFiles[path + '.map'] = new FileBlob({
        data: JSON.stringify(map),
      });
    }
  }

  return {
    preparedFiles,
    shouldAddSourcemapSupport,
    watch: fileList,
  };
}

function getAWSLambdaHandler(entrypoint: string, config: Config) {
  if (config.awsLambdaHandler) {
    return config.awsLambdaHandler as string;
  }

  if (process.env.NODEJS_AWS_HANDLER_NAME) {
    const { dir, name } = parsePath(entrypoint);
    return `${dir}${dir ? sep : ''}${name}.${
      process.env.NODEJS_AWS_HANDLER_NAME
    }`;
  }

  return '';
}

export const version = 3;

export async function build({
  files,
  entrypoint,
  workPath,
  config = {},
  meta = {},
}: BuildOptions) {
  const shouldAddHelpers = !(
    config.helpers === false || process.env.NODEJS_HELPERS === '0'
  );
  const awsLambdaHandler = getAWSLambdaHandler(entrypoint, config);

  const {
    entrypointPath,
    entrypointFsDirname,
    nodeVersion,
    spawnOpts,
  } = await downloadInstallAndBundle({
    files,
    entrypoint,
    workPath,
    config,
    meta,
  });

  debug('Running user script...');
  const runScriptTime = Date.now();
  await runPackageJsonScript(entrypointFsDirname, 'now-build', spawnOpts);
  debug(`Script complete [${Date.now() - runScriptTime}ms]`);

  debug('Tracing input files...');
  const traceTime = Date.now();
  const { preparedFiles, shouldAddSourcemapSupport, watch } = await compile(
    workPath,
    entrypointPath,
    entrypoint,
    config
  );
  debug(`Trace complete [${Date.now() - traceTime}ms]`);

  const makeLauncher = awsLambdaHandler ? makeAwsLauncher : makeNowLauncher;

  const launcherFiles: Files = {
    [`${LAUNCHER_FILENAME}.js`]: new FileBlob({
      data: makeLauncher({
        entrypointPath: `./${entrypoint}`,
        bridgePath: `./${BRIDGE_FILENAME}`,
        helpersPath: `./${HELPERS_FILENAME}`,
        sourcemapSupportPath: `./${SOURCEMAP_SUPPORT_FILENAME}`,
        shouldAddHelpers,
        shouldAddSourcemapSupport,
        awsLambdaHandler,
      }),
    }),
    [`${BRIDGE_FILENAME}.js`]: new FileFsRef({
      fsPath: join(__dirname, 'bridge.js'),
    }),
  };

  if (shouldAddSourcemapSupport) {
    launcherFiles[`${SOURCEMAP_SUPPORT_FILENAME}.js`] = new FileFsRef({
      fsPath: join(__dirname, 'source-map-support.js'),
    });
  }

  if (shouldAddHelpers) {
    launcherFiles[`${HELPERS_FILENAME}.js`] = new FileFsRef({
      fsPath: join(__dirname, 'helpers.js'),
    });
  }

  const lambda = await createLambda({
    files: {
      ...preparedFiles,
      ...launcherFiles,
    },
    handler: `${LAUNCHER_FILENAME}.launcher`,
    runtime: nodeVersion.runtime,
  });

  return { output: lambda, watch };
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache = await glob('node_modules/**', workPath);
  return cache;
}
