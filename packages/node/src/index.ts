import { fork, spawn } from 'child_process';
import {
  createWriteStream,
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
import { Project } from 'ts-morph';
import once from '@tootallnate/once';
import { nodeFileTrace } from '@vercel/nft';
import {
  File,
  Files,
  PrepareCacheOptions,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  FileBlob,
  FileFsRef,
  getNodeVersion,
  getSpawnOptions,
  shouldServe,
  debug,
  isSymbolicLink,
  runNpmInstall,
  walkParentDirs,
} from '@vercel/build-utils';
import { FromSchema } from 'json-schema-to-ts';
import { getConfig, BaseFunctionConfigSchema } from '@vercel/static-config';
import { AbortController } from 'abort-controller';
import { Register, register } from './typescript';
import { pageToRoute } from './router/page-to-route';
import { isDynamicRoute } from './router/is-dynamic';

export { shouldServe };
export {
  NowRequest,
  NowResponse,
  VercelRequest,
  VercelResponse,
} from './types';

const require_ = eval('require');

// Load the helper files from the "dist" dir explicitly.
const DIST_DIR = join(__dirname, '..', 'dist');

const { makeVercelLauncher, makeAwsLauncher } = require_(
  join(DIST_DIR, 'launcher.js')
);

interface DownloadOptions {
  entrypoint: string;
  workPath: string;
}

interface PortInfo {
  port: number;
}

function isPortInfo(v: any): v is PortInfo {
  return v && typeof v.port === 'number';
}

const FunctionConfigSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...BaseFunctionConfigSchema.properties,
    helpers: {
      type: 'boolean',
    },
    nodeVersion: {
      type: 'string',
    },
    awsHandlerName: {
      type: 'string',
    },
    excludeFiles: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    includeFiles: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
  },
} as const;

type FunctionConfig = FromSchema<typeof FunctionConfigSchema>;

const tscPath = resolve(dirname(require_.resolve('typescript')), '../bin/tsc');

// eslint-disable-next-line no-useless-escape
const libPathRegEx = /^node_modules|[\/\\]node_modules[\/\\]/;

const LAUNCHER_FILENAME = '__launcher.js';
const BRIDGE_FILENAME = '__bridge.js';
const HELPERS_FILENAME = '__helpers.js';
const SOURCEMAP_SUPPORT_FILENAME = '__sourcemap_support.js';

async function downloadInstallAndBundle({
  entrypoint,
  workPath,
}: DownloadOptions) {
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const nodeVersion = await getNodeVersion(entrypointFsDirname);
  const spawnOpts = getSpawnOptions({}, nodeVersion);

  const installTime = Date.now();
  await runNpmInstall(entrypointFsDirname, [], spawnOpts, {}, nodeVersion);
  debug(`Install complete [${Date.now() - installTime}ms]`);

  return {
    nodeVersion,
    spawnOpts,
  };
}

function renameTStoJS(path: string) {
  if (path.endsWith('.ts')) {
    return path.slice(0, -3) + '.js';
  }
  if (path.endsWith('.tsx')) {
    return path.slice(0, -4) + '.js';
  }
  return path;
}

async function compile(
  baseDir: string,
  entrypointPath: string,
  config: FunctionConfig
): Promise<{
  preparedFiles: Files;
  shouldAddSourcemapSupport: boolean;
}> {
  const inputFiles = new Set<string>([entrypointPath]);
  const preparedFiles: Files = {};
  const sourceCache = new Map<string, string | Buffer | null>();
  const fsCache = new Map<string, File>();
  const tsCompiled = new Set<string>();
  const pkgCache = new Map<string, { type?: string }>();

  let shouldAddSourcemapSupport = false;

  if (config.includeFiles) {
    const includeFiles =
      typeof config.includeFiles === 'string'
        ? [config.includeFiles]
        : config.includeFiles;
    const rel = includeFiles.map(f => {
      return relative(baseDir, join(dirname(entrypointPath), f));
    });
    console.log({ baseDir, entrypointPath, includeFiles, rel });

    for (const pattern of rel) {
      const files = await glob(pattern, baseDir);
      await Promise.all(
        Object.values(files).map(async entry => {
          const { fsPath } = entry;
          const relPath = relative(baseDir, fsPath);
          fsCache.set(relPath, entry);
          preparedFiles[relPath] = entry;
        })
      );
    }

    console.log({ preparedFiles });
  }

  debug(
    'Tracing input files: ' +
      [...inputFiles].map(p => relative(baseDir, p)).join(', ')
  );

  let tsCompile: Register;
  function compileTypeScript(path: string, source: string): string {
    const relPath = relative(baseDir, path);
    if (!tsCompile) {
      tsCompile = register({
        basePath: baseDir, // The base is the same as root now.json dir
        project: path, // Resolve tsconfig.json from entrypoint dir
        files: true, // Include all files such as global `.d.ts`
      });
    }
    const { code, map } = tsCompile(source, path);
    tsCompiled.add(relPath);
    preparedFiles[renameTStoJS(relPath) + '.map'] = new FileBlob({
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
      processCwd: baseDir,
      ts: true,
      mixedModules: true,
      //ignore: config.excludeFiles,
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

    if (tsCompiled.has(path)) {
      preparedFiles[renameTStoJS(path)] = entry;
    } else {
      preparedFiles[path] = entry;
    }
  }

  // Compile ES Modules into CommonJS
  const esmPaths = esmFileList.filter(
    file =>
      !file.endsWith('.ts') &&
      !file.endsWith('.tsx') &&
      !file.endsWith('.mjs') &&
      !file.match(libPathRegEx)
  );
  if (esmPaths.length) {
    const babelCompile = require('./babel').compile;
    for (const path of esmPaths) {
      const pathDir = join(baseDir, dirname(path));
      if (!pkgCache.has(pathDir)) {
        const pathToPkg = await walkParentDirs({
          base: baseDir,
          start: pathDir,
          filename: 'package.json',
        });
        const pkg = pathToPkg ? require_(pathToPkg) : {};
        pkgCache.set(pathDir, pkg);
      }
      const pkg = pkgCache.get(pathDir) || {};
      if (pkg.type === 'module' && path.endsWith('.js')) {
        // Found parent package.json indicating this file is already ESM
        // so we should not transpile to CJS.
        // https://nodejs.org/api/packages.html#packages_type
        continue;
      }
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
  };
}

function getAWSLambdaHandler(entrypoint: string, config: FunctionConfig) {
  const handler = config.awsHandlerName || process.env.NODEJS_AWS_HANDLER_NAME;
  if (handler) {
    const { dir, name } = parsePath(entrypoint);
    return `${join(dir, name)}.${handler}`;
  }
}

// TODO NATE: turn this into a `@vercel/plugin-utils` helper function?
export async function build({ workPath }: { workPath: string }) {
  const project = new Project();
  const entrypoints = await glob('api/**/*.[jt]s', workPath);
  for (const entrypoint of Object.keys(entrypoints)) {
    // Dotfiles are not compiled
    if (entrypoint.includes('/.')) continue;

    // Files starting with an `_` (or within a directory) are not compiled
    if (entrypoint.includes('/_')) continue;

    // Files within a `node_modules` directory are not compiled
    if (entrypoint.includes('/node_modules/')) continue;

    // TypeScript definition files are not compiled
    if (entrypoint.endsWith('.d.ts')) continue;

    const absEntrypoint = join(workPath, entrypoint);
    const config =
      getConfig(project, absEntrypoint, FunctionConfigSchema) || {};

    // No config exported means "node", but if there is a config
    // and "runtime" is defined, but it is not "node" then don't
    // compile this file.
    if (config.runtime && config.runtime !== 'node') {
      continue;
    }

    await buildEntrypoint({ workPath, entrypoint, config });
  }
}

export async function buildEntrypoint({
  workPath,
  entrypoint,
  config,
}: {
  workPath: string;
  entrypoint: string;
  config: FunctionConfig;
}) {
  const outputDirPath = join(workPath, '.output');
  const { dir, name } = parsePath(entrypoint);
  const entrypointWithoutExt = join('/', dir, name);
  const entrypointWithoutExtIndex = join(
    dir,
    name,
    name === 'index' ? '' : 'index'
  );
  const outputWorkPath = join(
    outputDirPath,
    'server/pages',
    entrypointWithoutExtIndex
  );
  await fsp.mkdir(outputWorkPath, { recursive: true });
  console.log(`Compiling "${entrypoint}" to "${outputWorkPath}"`);

  const shouldAddHelpers =
    config.helpers !== false && process.env.NODEJS_HELPERS !== '0';
  const awsLambdaHandler = getAWSLambdaHandler(entrypoint, config);

  const { nodeVersion } = await downloadInstallAndBundle({
    entrypoint,
    workPath,
  });
  const entrypointPath = join(workPath, entrypoint);

  // TODO NATE: do we want to run the build script?
  // The frontend build command probably already did this
  //await runPackageJsonScript(
  //  entrypointFsDirname,
  //  // Don't consider "build" script since its intended for frontend code
  //  ['vercel-build', 'now-build'],
  //  spawnOpts
  //);

  debug('Tracing input files...');
  const traceTime = Date.now();
  const { preparedFiles, shouldAddSourcemapSupport } = await compile(
    workPath,
    entrypointPath,
    config
  );
  debug(`Trace complete [${Date.now() - traceTime}ms]`);

  const getFileName = (str: string) => `___vc/${str}`;

  const launcher = awsLambdaHandler ? makeAwsLauncher : makeVercelLauncher;
  const launcherSource = launcher({
    entrypointPath: `../${renameTStoJS(relative(workPath, entrypointPath))}`,
    bridgePath: `./${BRIDGE_FILENAME}`,
    helpersPath: `./${HELPERS_FILENAME}`,
    sourcemapSupportPath: `./${SOURCEMAP_SUPPORT_FILENAME}`,
    shouldAddHelpers,
    shouldAddSourcemapSupport,
    awsLambdaHandler,
  });

  const launcherFiles: Files = {
    [getFileName('package.json')]: new FileBlob({
      data: JSON.stringify({ type: 'commonjs' }),
    }),
    [getFileName(LAUNCHER_FILENAME)]: new FileBlob({
      data: launcherSource,
    }),
    [getFileName(BRIDGE_FILENAME)]: new FileFsRef({
      fsPath: join(DIST_DIR, 'bridge.js'),
    }),
  };

  if (shouldAddSourcemapSupport) {
    launcherFiles[getFileName(SOURCEMAP_SUPPORT_FILENAME)] = new FileFsRef({
      fsPath: join(DIST_DIR, 'source-map-support.js'),
    });
  }

  if (shouldAddHelpers) {
    launcherFiles[getFileName(HELPERS_FILENAME)] = new FileFsRef({
      fsPath: join(DIST_DIR, 'helpers.js'),
    });
  }

  // Map `files` to the output workPath
  const files = {
    ...preparedFiles,
    ...launcherFiles,
  };

  for (const filename of Object.keys(files)) {
    const outPath = join(outputWorkPath, filename);
    const file = files[filename];
    await fsp.mkdir(dirname(outPath), { recursive: true });
    const ws = createWriteStream(outPath, {
      mode: file.mode,
    });
    const finishPromise = once(ws, 'finish');
    file.toStream().pipe(ws);
    await finishPromise;
  }

  // Update the `functions-mainifest.json` file with this entrypoint
  // TODO NATE: turn this into a `@vercel/plugin-utils` helper function?
  const functionsManifestPath = join(outputDirPath, 'functions-manifest.json');
  let functionsManifest: any = {};
  try {
    functionsManifest = JSON.parse(
      await fsp.readFile(functionsManifestPath, 'utf8')
    );
  } catch (_err) {
    // ignore...
  }
  if (!functionsManifest.version) functionsManifest.version = 1;
  if (!functionsManifest.pages) functionsManifest.pages = {};
  functionsManifest.pages[entrypointWithoutExtIndex] = {
    handler: `${getFileName(LAUNCHER_FILENAME).slice(0, -3)}.launcher`,
    runtime: nodeVersion.runtime,
  };
  await fsp.writeFile(
    functionsManifestPath,
    JSON.stringify(functionsManifest, null, 2)
  );

  // Update the `routes-mainifest.json` file with the wildcard route
  // when the entrypoint is dynamic (i.e. `/api/[id].ts`).
  if (isDynamicRoute(entrypointWithoutExt)) {
    const routesManifestPath = join(outputDirPath, 'routes-manifest.json');
    let routesManifest: any = {};
    try {
      routesManifest = JSON.parse(
        await fsp.readFile(routesManifestPath, 'utf8')
      );
    } catch (_err) {
      // ignore...
    }
    if (!routesManifest.dynamicRoutes) routesManifest.dynamicRoutes = [];
    routesManifest.dynamicRoutes.push(pageToRoute(entrypointWithoutExt));
    await fsp.writeFile(
      routesManifestPath,
      JSON.stringify(routesManifest, null, 2)
    );
  }
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
  const entryDir = join(workPath, dirname(entrypoint));
  const projectTsConfig = await walkParentDirs({
    base: workPath,
    start: entryDir,
    filename: 'tsconfig.json',
  });
  const pathToPkg = await walkParentDirs({
    base: workPath,
    start: entryDir,
    filename: 'package.json',
  });
  const pkg = pathToPkg ? require_(pathToPkg) : {};
  const isEsm =
    entrypoint.endsWith('.mjs') ||
    (pkg.type === 'module' && entrypoint.endsWith('.js'));

  const devServerPath = join(DIST_DIR, 'dev-server.js');
  const child = fork(devServerPath, [], {
    cwd: workPath,
    execArgv: [],
    env: {
      ...process.env,
      ...meta.env,
      VERCEL_DEV_ENTRYPOINT: entrypoint,
      VERCEL_DEV_TSCONFIG: projectTsConfig || '',
      VERCEL_DEV_IS_ESM: isEsm ? '1' : undefined,
      VERCEL_DEV_CONFIG: JSON.stringify(config),
      VERCEL_DEV_BUILD_ENV: JSON.stringify(meta.buildEnv || {}),
    },
  });

  const { pid } = child;
  const controller = new AbortController();
  const { signal } = controller;
  const onMessage = once(child, 'message', { signal });
  const onExit = once(child, 'exit', { signal });
  try {
    const result = await Promise.race([onMessage, onExit]);

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
      // Got "exit" event from child process
      const [exitCode, signal] = result;
      const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
      throw new Error(`\`node ${entrypoint}\` failed with ${reason}`);
    }
  } finally {
    controller.abort();
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
    await fsp.mkdir(entrypointCacheDir, { recursive: true });
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
  await once(child, 'exit');
}
