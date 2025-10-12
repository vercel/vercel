import { isErrnoException } from '@vercel/error-utils';
import { createRequire } from 'module';
import { readFileSync, lstatSync, readlinkSync, statSync } from 'fs';
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
  parse as parsePath,
  extname,
} from 'path';
import { Project } from 'ts-morph';
import { nodeFileTrace } from '@vercel/nft';
import nftResolveDependency from '@vercel/nft/out/resolve-dependency';
import {
  glob,
  download,
  FileBlob,
  FileFsRef,
  EdgeFunction,
  NodejsLambda,
  runNpmInstall,
  runPackageJsonScript,
  getNodeVersion,
  getSpawnOptions,
  debug,
  isSymbolicLink,
  walkParentDirs,
  execCommand,
  getEnvForPackageManager,
  scanParentDirs,
} from '@vercel/build-utils';
import type {
  File,
  Files,
  Meta,
  Config,
  BuildV3,
  NodeVersion,
  BuildResultV3,
} from '@vercel/build-utils';
import { getConfig, type BaseFunctionConfig } from '@vercel/static-config';

import { Register, register } from './typescript';
import {
  validateConfiguredRuntime,
  entrypointToOutputPath,
  getRegExpFromMatchers,
  isEdgeRuntime,
} from './utils';

interface DownloadOptions {
  files: Files;
  entrypoint: string;
  workPath: string;
  config: Config;
  meta: Meta;
  considerBuildCommand: boolean;
}

const require_ = createRequire(__filename);

// eslint-disable-next-line no-useless-escape
const libPathRegEx = /^node_modules|[\/\\]node_modules[\/\\]/;

async function downloadInstallAndBundle({
  files,
  entrypoint,
  workPath,
  config,
  meta,
  considerBuildCommand,
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

  const {
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    turboSupportsCorepackHome,
  } = await scanParentDirs(entrypointFsDirname, true);

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    nodeVersion,
    env: spawnOpts.env || {},
    turboSupportsCorepackHome,
    projectCreatedAt: config.projectSettings?.createdAt,
  });

  const installCommand = config.projectSettings?.installCommand;
  if (typeof installCommand === 'string' && considerBuildCommand) {
    if (installCommand.trim()) {
      console.log(`Running "install" command: \`${installCommand}\`...`);
      await execCommand(installCommand, {
        ...spawnOpts,
        cwd: entrypointFsDirname,
      });
    } else {
      console.log(`Skipping "install" command...`);
    }
  } else {
    await runNpmInstall(
      entrypointFsDirname,
      [],
      spawnOpts,
      meta,
      nodeVersion,
      config.projectSettings?.createdAt
    );
  }
  const entrypointPath = downloadedFiles[entrypoint].fsPath;
  return { entrypointPath, entrypointFsDirname, nodeVersion, spawnOpts };
}

function renameTStoJS(path: string) {
  if (path.endsWith('.ts')) {
    return path.slice(0, -3) + '.js';
  }
  if (path.endsWith('.tsx')) {
    return path.slice(0, -4) + '.js';
  }
  if (path.endsWith('.mts')) {
    return path.slice(0, -4) + '.mjs';
  }
  if (path.endsWith('.cts')) {
    return path.slice(0, -4) + '.cjs';
  }
  return path;
}

async function compile(
  workPath: string,
  baseDir: string,
  entrypointPath: string,
  config: Config,
  meta: Meta,
  nodeVersion: NodeVersion,
  isEdgeFunction: boolean
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

    for (const pattern of includeFiles) {
      const files = await glob(pattern, workPath);
      await Promise.all(
        Object.values(files).map(async entry => {
          const { fsPath } = entry;
          const relPath = relative(baseDir, fsPath);
          fsCache.set(relPath, entry);
          preparedFiles[relPath] = entry;
        })
      );
    }
  }

  let tsCompile: Register;
  function compileTypeScript(path: string, source: string): string {
    const relPath = relative(baseDir, path);
    if (!tsCompile) {
      tsCompile = register({
        basePath: workPath, // The base is the same as root now.json dir
        project: path, // Resolve tsconfig.json from entrypoint dir
        files: true, // Include all files such as global `.d.ts`
        nodeVersionMajor: nodeVersion.major,
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

  const conditions = isEdgeFunction
    ? ['edge-light', 'browser', 'module', 'import', 'require']
    : undefined;

  const { fileList, esmFileList, warnings } = await nodeFileTrace(
    [...inputFiles],
    {
      base: baseDir,
      processCwd: workPath,
      ts: true,
      mixedModules: true,
      conditions,
      resolve(id, parent, job, cjsResolve) {
        const normalizedWasmImports = id.replace(/\.wasm\?module$/i, '.wasm');
        return nftResolveDependency(
          normalizedWasmImports,
          parent,
          job,
          cjsResolve
        );
      },
      ignore: config.excludeFiles,
      async readFile(fsPath) {
        const relPath = relative(baseDir, fsPath);

        // If this file has already been read then return from the cache
        const cached = sourceCache.get(relPath);
        if (typeof cached !== 'undefined') return cached;

        try {
          let entry: File | undefined;
          let source: string | Buffer = readFileSync(fsPath);

          const { mode } = lstatSync(fsPath);
          if (isSymbolicLink(mode)) {
            entry = new FileFsRef({ fsPath, mode });
          }

          if (isEdgeFunction && basename(fsPath) === 'package.json') {
            // For Edge Functions, patch "main" field to prefer "browser" or "module"
            const pkgJson = JSON.parse(source.toString());
            for (const prop of ['browser', 'module']) {
              const val = pkgJson[prop];
              if (typeof val === 'string') {
                debug(`Using "${prop}" field in ${fsPath}`);
                pkgJson.main = val;

                // Create the `entry` with the original so that the output is unmodified
                if (!entry) {
                  entry = new FileBlob({ data: source, mode });
                }

                // Return the modified `package.json` to nft
                source = JSON.stringify(pkgJson);
                break;
              }
            }
          }

          if (
            (fsPath.endsWith('.ts') && !fsPath.endsWith('.d.ts')) ||
            fsPath.endsWith('.tsx') ||
            fsPath.endsWith('.mts') ||
            fsPath.endsWith('.cts')
          ) {
            source = compileTypeScript(fsPath, source.toString());
          }

          if (!entry) {
            entry = new FileBlob({ data: source, mode });
          }
          fsCache.set(relPath, entry);
          sourceCache.set(relPath, source);
          return source;
        } catch (error: unknown) {
          if (
            isErrnoException(error) &&
            (error.code === 'ENOENT' || error.code === 'EISDIR')
          ) {
            // `null` represents a not found
            sourceCache.set(relPath, null);
            return null;
          }
          throw error;
        }
      },
    }
  );

  for (const warning of warnings) {
    debug(`Warning from trace: ${warning.message}`);
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
    if (isSymbolicLink(entry.mode) && entry.type === 'FileFsRef') {
      // ensure the symlink target is added to the file list
      const symlinkTarget = relative(
        baseDir,
        resolve(dirname(entry.fsPath), readlinkSync(entry.fsPath))
      );
      if (
        !symlinkTarget.startsWith('..' + sep) &&
        !fileList.has(symlinkTarget)
      ) {
        const stats = statSync(resolve(baseDir, symlinkTarget));
        if (stats.isFile()) {
          fileList.add(symlinkTarget);
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
  const esmPaths = [...esmFileList].filter(
    file =>
      !file.endsWith('.ts') &&
      !file.endsWith('.tsx') &&
      !file.endsWith('.mts') &&
      !file.endsWith('.mjs') &&
      !file.match(libPathRegEx)
  );
  const babelCompileEnabled =
    !isEdgeFunction || process.env.VERCEL_EDGE_NO_BABEL !== '1';
  if (babelCompileEnabled && esmPaths.length) {
    const babelCompile = (await import('./babel.js')).compile;
    for (const path of esmPaths) {
      const pathDir = join(workPath, dirname(path));
      if (!pkgCache.has(pathDir)) {
        const pathToPkg = await walkParentDirs({
          base: workPath,
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

      if (!meta.compiledToCommonJS) {
        meta.compiledToCommonJS = true;
        console.warn(
          'Warning: Node.js functions are compiled from ESM to CommonJS. If this is not intended, add "type": "module" to your package.json file.'
        );
      }
      console.log(`Compiling "${filename}" from ESM to CommonJS...`);
      const { code, map } = babelCompile(filename, String(source));
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

export const build = async ({
  files,
  entrypoint,
  shim,
  useWebApi,
  workPath,
  repoRootPath,
  config = {},
  meta = {},
  considerBuildCommand = false,
  entrypointCallback,
}: Parameters<BuildV3>[0] & {
  shim?: (handler: string) => string;
  useWebApi?: boolean;
  considerBuildCommand?: boolean;
  /**
   * This is called once any user build scripts have run so that the entrypoint can be detected
   * from files that may have been created by the build script.
   */
  entrypointCallback?: () => Promise<string>;
}): Promise<BuildResultV3> => {
  const baseDir = repoRootPath || workPath;
  const awsLambdaHandler = getAWSLambdaHandler(entrypoint, config);

  const {
    entrypointPath: _entrypointPath,
    entrypointFsDirname,
    nodeVersion,
    spawnOpts,
  } = await downloadInstallAndBundle({
    files,
    entrypoint,
    workPath,
    config,
    meta,
    considerBuildCommand,
  });

  let entrypointPath = _entrypointPath;

  const projectBuildCommand = config.projectSettings?.buildCommand;

  // For traditional api-folder builds, the `build` script or project build command isn't used.
  // but we're reusing the node builder for hono and express, where they should be treated as the
  // primary builder
  if (projectBuildCommand && considerBuildCommand) {
    await execCommand(projectBuildCommand, {
      ...spawnOpts,

      // Yarn v2 PnP mode may be activated, so force
      // "node-modules" linker style
      env: {
        YARN_NODE_LINKER: 'node-modules',
        ...spawnOpts.env,
      },

      cwd: workPath,
    });
  } else {
    const possibleScripts = considerBuildCommand
      ? ['vercel-build', 'now-build', 'build']
      : ['vercel-build', 'now-build'];

    await runPackageJsonScript(
      entrypointFsDirname,
      possibleScripts,
      spawnOpts,
      config.projectSettings?.createdAt
    );
  }
  if (entrypointCallback) {
    const entrypoint = await entrypointCallback();
    entrypointPath = join(entrypointFsDirname, entrypoint);
    const functionConfig = config.functions?.[entrypoint];
    if (functionConfig) {
      const normalizeArray = (value: any) =>
        Array.isArray(value) ? value : value ? [value] : [];

      config.includeFiles = [
        ...normalizeArray(config.includeFiles),
        ...normalizeArray(functionConfig.includeFiles),
      ];
      config.excludeFiles = [
        ...normalizeArray(config.excludeFiles),
        ...normalizeArray(functionConfig.excludeFiles),
      ];
    }
  }

  const isMiddleware = config.middleware === true;
  let isEdgeFunction = isMiddleware;

  const project = new Project();
  const staticConfig = getConfig(project, entrypointPath);

  const runtime = staticConfig?.runtime;
  validateConfiguredRuntime(runtime, entrypoint);

  if (runtime) {
    isEdgeFunction = isEdgeRuntime(runtime);
  }

  debug('Tracing input files...');
  const traceTime = Date.now();
  const { preparedFiles, shouldAddSourcemapSupport } = await compile(
    workPath,
    baseDir,
    entrypointPath,
    config,
    meta,
    nodeVersion,
    isEdgeFunction
  );
  debug(`Trace complete [${Date.now() - traceTime}ms]`);

  let routes: BuildResultV3['routes'];
  let output: BuildResultV3['output'] | undefined;

  let handler = renameTStoJS(relative(baseDir, entrypointPath));
  const outputPath = entrypointToOutputPath(entrypoint, config.zeroConfig);

  // Add a `route` for Middleware
  if (isMiddleware) {
    // Middleware is a catch-all for all paths unless a `matcher` property is defined
    const src = getRegExpFromMatchers(staticConfig?.matcher);

    const middlewareRawSrc: string[] = [];
    if (staticConfig?.matcher) {
      if (Array.isArray(staticConfig.matcher)) {
        middlewareRawSrc.push(...staticConfig.matcher);
      } else {
        middlewareRawSrc.push(staticConfig.matcher as string);
      }
    }

    routes = [
      {
        src,
        middlewareRawSrc,
        middlewarePath: outputPath,
        continue: true,
        override: true,
      },
    ];
  }

  if (shim) {
    const handlerFilename = basename(handler);
    const handlerDir = dirname(handler);
    const extension = extname(handlerFilename);
    const extMap: Record<string, string> = {
      '.ts': '.js',
      '.mts': '.mjs',
      '.mjs': '.mjs',
      '.cjs': '.cjs',
      '.js': '.js',
    };
    const ext = extMap[extension];
    if (!ext) {
      throw new Error(`Unsupported extension for ${entrypoint}`);
    }
    const filename = `shim${ext}`;
    const shimHandler =
      handlerDir === '.' ? filename : join(handlerDir, filename);
    preparedFiles[shimHandler] = new FileBlob({
      data: shim(handlerFilename),
    });
    handler = shimHandler;
  }

  if (isEdgeFunction) {
    output = new EdgeFunction({
      entrypoint: handler,
      files: preparedFiles,
      regions: staticConfig?.regions,
      deploymentTarget: 'v8-worker',
    });
  } else {
    // "nodejs" runtime is the default
    const shouldAddHelpers = !(
      config.helpers === false || process.env.NODEJS_HELPERS === '0'
    );

    const supportsResponseStreaming =
      (staticConfig?.supportsResponseStreaming ??
        staticConfig?.experimentalResponseStreaming) === true
        ? true
        : undefined;

    output = new NodejsLambda({
      files: preparedFiles,
      handler,
      architecture: staticConfig?.architecture,
      runtime: nodeVersion.runtime,
      useWebApi: isMiddleware ? true : useWebApi,
      shouldAddHelpers: isMiddleware ? false : shouldAddHelpers,
      shouldAddSourcemapSupport,
      awsLambdaHandler,
      supportsResponseStreaming,
      maxDuration: staticConfig?.maxDuration,
      regions: normalizeRequestedRegions(
        staticConfig?.preferredRegion ?? staticConfig?.regions
      ),
    });
  }

  return { routes, output };
};

function normalizeRequestedRegions(
  regions: BaseFunctionConfig['regions'] | BaseFunctionConfig['preferredRegion']
): NodejsLambda['regions'] {
  if (regions === 'all') {
    return ['all'];
  } else if (regions === 'auto' || regions === 'default') {
    return undefined;
  }

  if (typeof regions === 'string') {
    return [regions];
  }

  return regions;
}
