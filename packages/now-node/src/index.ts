import { fork, spawn } from 'child_process';
import {
  readFileSync,
  lstatSync,
  readlinkSync,
  statSync,
  promises as fsp,
} from 'fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
  parse as parsePath,
} from 'path';
// @ts-ignore - `@types/mkdirp-promise` is broken
import mkdirp from 'mkdirp-promise';
import once from '@tootallnate/once';
import { nodeFileTrace } from '@vercel/nft';
import buildUtils from './build-utils';
import {
  File,
  Files,
  Meta,
  PrepareCacheOptions,
  BuildOptions,
  Config,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';
const {
  glob,
  download,
  FileBlob,
  FileFsRef,
  createLambda,
  runNpmInstall,
  runPackageJsonScript,
  getNodeVersion,
  getSpawnOptions,
  shouldServe,
  debug,
  isSymbolicLink,
  walkParentDirs,
} = buildUtils;
import { makeNowLauncher, makeAwsLauncher } from './launcher';
import { Register, register } from './typescript';

export { shouldServe };
export { NowRequest, NowResponse } from './types';

interface DownloadOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  config: Config;
  meta: Meta;
}

interface PortInfo {
  port: number;
}

function isPortInfo(v: any): v is PortInfo {
  return v && typeof v.port === 'number';
}

const tscPath = resolve(
  dirname(require.resolve(eval('"typescript"'))),
  '../bin/tsc'
);

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
    await runNpmInstall(entrypointFsDirname, [], spawnOpts, meta);
    debug(`Install complete [${Date.now() - installTime}ms]`);
  }

  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, entrypointFsDirname, nodeVersion, spawnOpts };
}

async function compile(
  workPath: string,
  baseDir: string,
  entrypointPath: string,
  entrypoint: string,
  config: Config
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
        Object.values(files).map(async entry => {
          const { fsPath } = entry;
          const relPath = relative(baseDir, fsPath);
          fsCache.set(relPath, entry);
          const stream = entry.toStream();
          const { data } = await FileBlob.fromStream({ stream });
          if (relPath.endsWith('.ts') || relPath.endsWith('.tsx')) {
            sourceCache.set(
              relPath,
              compileTypeScript(fsPath, data.toString())
            );
          } else {
            sourceCache.set(relPath, data);
          }
          inputFiles.add(fsPath);
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
    const relPath = relative(baseDir, path);
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
      base: baseDir,
      processCwd: workPath,
      ts: true,
      mixedModules: true,
      ignore: config.excludeFiles,
      readFile(fsPath: string): Buffer | string | null {
        const relPath = relative(baseDir, fsPath);
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
      const fsPath = resolve(baseDir, path);
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
        baseDir,
        resolve(dirname(entry.fsPath), readlinkSync(entry.fsPath))
      );
      if (
        !symlinkTarget.startsWith('..' + sep) &&
        fileList.indexOf(symlinkTarget) === -1
      ) {
        const stats = statSync(resolve(baseDir, symlinkTarget));
        if (stats.isFile()) {
          fileList.push(symlinkTarget);
        }
      }
    }
    // Rename .ts -> .js (except for entry)
    // There is a bug on Windows where entrypoint uses forward slashes
    // and workPath uses backslashes so we use resolve before comparing.
    if (
      resolve(baseDir, path) !== resolve(workPath, entrypoint) &&
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
  repoRootPath,
  config = {},
  meta = {},
}: BuildOptions) {
  const shouldAddHelpers = !(
    config.helpers === false || process.env.NODEJS_HELPERS === '0'
  );

  const baseDir = repoRootPath || workPath;
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

  await runPackageJsonScript(
    entrypointFsDirname,
    // Don't consider "build" script since its intended for frontend code
    ['vercel-build', 'now-build'],
    spawnOpts
  );

  debug('Tracing input files...');
  const traceTime = Date.now();
  const { preparedFiles, shouldAddSourcemapSupport, watch } = await compile(
    workPath,
    baseDir,
    entrypointPath,
    entrypoint,
    config
  );
  debug(`Trace complete [${Date.now() - traceTime}ms]`);

  const makeLauncher = awsLambdaHandler ? makeAwsLauncher : makeNowLauncher;

  const launcherFiles: Files = {
    [`${LAUNCHER_FILENAME}.js`]: new FileBlob({
      data: makeLauncher({
        entrypointPath: `./${relative(baseDir, entrypointPath)}`,
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

export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { entrypoint, workPath, config, meta = {} } = opts;

  // Find the `tsconfig.json` file closest to the entrypoint file
  const projectTsConfig = await walkParentDirs({
    base: workPath,
    start: join(workPath, dirname(entrypoint)),
    filename: 'tsconfig.json',
  });

  const devServerPath = join(__dirname, 'dev-server.js');
  const child = fork(devServerPath, [], {
    cwd: workPath,
    execArgv: [],
    env: {
      ...process.env,
      ...meta.env,
      VERCEL_DEV_ENTRYPOINT: entrypoint,
      VERCEL_DEV_TSCONFIG: projectTsConfig || '',
      VERCEL_DEV_CONFIG: JSON.stringify(config),
      VERCEL_DEV_BUILD_ENV: JSON.stringify(meta.buildEnv || {}),
    },
  });

  const { pid } = child;
  const onMessage = once<{ port: number }>(child, 'message');
  const onExit = once.spread<[number, string | null]>(child, 'exit');
  const result = await Promise.race([onMessage, onExit]);
  onExit.cancel();
  onMessage.cancel();

  if (isPortInfo(result)) {
    // "message" event

    const ext = extname(entrypoint);
    if (ext === '.ts' || ext === '.tsx') {
      // Invoke `tsc --noEmit` asynchronously in the background, so
      // that the HTTP request is not blocked by the type checking.
      doTypeCheck(opts, projectTsConfig).catch((err: Error) => {
        console.error('Type check for %j failed:', entrypoint, err);
      });
    }

    return { port: result.port, pid };
  } else {
    // "exit" event
    throw new Error(
      `Failed to start dev server for "${entrypoint}" (code=${result[0]}, signal=${result[1]})`
    );
  }
}

async function doTypeCheck(
  { entrypoint, workPath, meta = {} }: StartDevServerOptions,
  projectTsConfig: string | null
): Promise<void> {
  const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
  const entrypointCacheDir = join(devCacheDir, 'node', entrypoint);

  // In order to type-check a single file, a standalone tsconfig
  // file needs to be created that inherits from the base one :(
  // See: https://stackoverflow.com/a/44748041/376773
  //
  // A different filename needs to be used for different `extends` tsconfig.json
  const tsconfigName = projectTsConfig
    ? `tsconfig-with-${relative(workPath, projectTsConfig).replace(
        /[\\/.]/g,
        '-'
      )}.json`
    : 'tsconfig.json';
  const tsconfigPath = join(entrypointCacheDir, tsconfigName);
  const tsconfig = {
    extends: projectTsConfig
      ? relative(entrypointCacheDir, projectTsConfig)
      : undefined,
    include: [relative(entrypointCacheDir, join(workPath, entrypoint))],
  };

  try {
    const json = JSON.stringify(tsconfig, null, '\t');
    await mkdirp(entrypointCacheDir);
    await fsp.writeFile(tsconfigPath, json, { flag: 'wx' });
  } catch (err) {
    // Don't throw if the file already exists
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  const child = spawn(
    process.execPath,
    [
      tscPath,
      '--project',
      tsconfigPath,
      '--noEmit',
      '--allowJs',
      '--esModuleInterop',
      '--jsx',
      'react',
    ],
    {
      cwd: workPath,
      stdio: 'inherit',
    }
  );
  await once.spread<[number, string | null]>(child, 'exit');
}
