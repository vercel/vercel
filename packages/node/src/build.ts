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
import { getConfig } from '@vercel/static-config';

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
  await runNpmInstall(
    entrypointFsDirname,
    [],
    spawnOpts,
    meta,
    nodeVersion,
    config.projectSettings?.createdAt
  );
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
            fsPath.endsWith('.tsx')
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

export const build: BuildV3 = async ({
  files,
  entrypoint,
  workPath,
  repoRootPath,
  config = {},
  meta = {},
}) => {
  const baseDir = repoRootPath || workPath;
  const awsLambdaHandler = getAWSLambdaHandler(entrypoint, config);

  const { entrypointPath, entrypointFsDirname, nodeVersion, spawnOpts } =
    await downloadInstallAndBundle({
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
    spawnOpts,
    config.projectSettings?.createdAt
  );

  const isMiddleware = config.middleware === true;

  // Will output an `EdgeFunction` for when `config.middleware = true`
  // (i.e. for root-level "middleware" file) or if source code contains:
  // `export const config = { runtime: 'edge' }`
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

  const handler = renameTStoJS(relative(baseDir, entrypointPath));
  const outputPath = entrypointToOutputPath(entrypoint, config.zeroConfig);

  // Add a `route` for Middleware
  if (isMiddleware) {
    if (!isEdgeFunction) {
      // Root-level middleware file can not have `export const config = { runtime: 'nodejs' }`
      throw new Error(
        `Middleware file can not be a Node.js Serverless Function`
      );
    }

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
      runtime: nodeVersion.runtime,
      shouldAddHelpers,
      shouldAddSourcemapSupport,
      awsLambdaHandler,
      supportsResponseStreaming,
      maxDuration: staticConfig?.maxDuration,
    });
  }

  return { routes, output };
};
