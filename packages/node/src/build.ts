import { isErrnoException } from '@vercel/error-utils';
import { createRequire } from 'module';
import {
  readFileSync,
  lstatSync,
  readlinkSync,
  statSync,
  existsSync,
} from 'fs';
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
  extname,
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
import { build as rolldownBuild, RolldownPlugin } from 'rolldown';

import { Register, register } from './typescript';
import {
  validateConfiguredRuntime,
  entrypointToOutputPath,
  getRegExpFromMatchers,
  isEdgeRuntime,
} from './utils';
import { outputFile, rm, mkdirp } from 'fs-extra';
import { spawn } from 'child_process';
import { symlink } from 'fs/promises';

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
    entrypointPath = join(entrypointFsDirname, await entrypointCallback());
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

  let preparedFiles: Files;
  let shouldAddSourcemapSupport: boolean;
  let handler = renameTStoJS(relative(baseDir, entrypointPath));
  let routes: BuildResultV3['routes'];
  let output: BuildResultV3['output'] | undefined;

  if (process.env.VERCEL_NODE_BUILD_USE_ROLLDOWN) {
    console.warn(
      `Using experimental rolldown to build ${relative(baseDir, entrypointPath)}`
    );
    const rolldownResult = await rolldownCompile(
      workPath,
      baseDir,
      entrypointPath,
      config,
      meta
      // nodeVersion,
      // isEdgeFunction
    );
    preparedFiles = rolldownResult.preparedFiles;
    shouldAddSourcemapSupport = rolldownResult.shouldAddSourcemapSupport;
    handler = rolldownResult.handler;

    if (rolldownResult.proxyRoutes.length > 0) {
      routes = [
        {
          handle: 'filesystem',
        },
      ];
      for (const route of rolldownResult.proxyRoutes) {
        routes.push(route);
      }
      routes.push({
        src: '/(.*)',
        dest: '/',
      });
    }
  } else {
    debug('Tracing input files...');
    const traceTime = Date.now();
    const compileResult = await compile(
      workPath,
      baseDir,
      entrypointPath,
      config,
      meta,
      nodeVersion,
      isEdgeFunction
    );
    preparedFiles = compileResult.preparedFiles;
    shouldAddSourcemapSupport = compileResult.shouldAddSourcemapSupport;
    debug(`Trace complete [${Date.now() - traceTime}ms]`);
  }

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

async function rolldownCompile(
  workPath: string,
  baseDir: string,
  entrypointPath: string,
  config: Config,
  meta: Meta
  // nodeVersion: NodeVersion,
  // isEdgeFunction: boolean
): Promise<{
  preparedFiles: Files;
  shouldAddSourcemapSupport: boolean;
  handler: string;
  proxyRoutes: { src: string; dest: string; methods: string[] }[];
}> {
  const preparedFiles: Files = {};
  const shouldAddSourcemapSupport = false;

  const extension = extname(entrypointPath);
  const extensionMap: Record<
    string,
    { format: 'esm' | 'cjs' | 'auto'; extension: string }
  > = {
    '.ts': { format: 'auto', extension: 'js' },
    '.mts': { format: 'esm', extension: 'mjs' },
    '.cts': { format: 'cjs', extension: 'cjs' },
    '.cjs': { format: 'cjs', extension: 'cjs' },
    '.js': { format: 'auto', extension: 'js' },
    '.mjs': { format: 'esm', extension: 'mjs' },
  };

  const extensionInfo = extensionMap[extension];
  let format = extensionInfo.format;

  // Always include package.json from the entrypoint directory
  const packageJsonPath = join(workPath, 'package.json');
  const external: string[] = [];
  if (existsSync(packageJsonPath)) {
    const { mode } = lstatSync(packageJsonPath);
    const source = readFileSync(packageJsonPath);
    const relPath = relative(baseDir, packageJsonPath);
    const pkg = JSON.parse(source.toString());
    if (format === 'auto') {
      if (pkg.type === 'module') {
        format = 'esm';
      } else {
        format = 'cjs';
      }
    }
    for (const dependency of Object.keys(pkg.dependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.devDependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.peerDependencies || {})) {
      external.push(dependency);
    }
    for (const dependency of Object.keys(pkg.optionalDependencies || {})) {
      external.push(dependency);
    }
    preparedFiles[relPath] = new FileBlob({ data: source, mode });
  }

  const absoluteImportPlugin: RolldownPlugin = {
    name: 'absolute-import-resolver',
    resolveId(source: string) {
      if (external.includes(source)) {
        return { id: source, external: true };
      }
      return null;
    },
  };

  let tsconfigPath: string | null = join(workPath, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    tsconfigPath = await walkParentDirs({
      base: workPath,
      start: workPath,
      filename: 'tsconfig.json',
    });
  }

  let outputEntry: string | null = null;
  // @ts-ignore TS doesn't like the tsconfig option, but it's here https://rolldown.rs/reference/config-options#tsconfig
  await rolldownBuild({
    input: entrypointPath,
    cwd: workPath,
    platform: 'node',
    external: /node_modules/,
    plugins: [absoluteImportPlugin],
    tsconfig: tsconfigPath || undefined,
    output: {
      dir: join(workPath, '.vercel', 'output', 'functions', 'index.func'),
      entryFileNames: info => {
        const facadeModuleId = info.facadeModuleId;
        if (!facadeModuleId) {
          throw new Error(`Unable to resolve module for ${info.name}`);
        }
        const relPath = relative(workPath, facadeModuleId);
        const extension = extname(relPath);
        const extensionMap: Record<string, string> = {
          '.ts': '.js',
          '.mts': '.mjs',
          '.cts': '.cjs',
          '.cjs': '.cjs',
          '.js': '.js',
        };
        const ext = extensionMap[extension];
        const nameWithJS = relPath.slice(0, -extension.length) + ext;
        if (info.isEntry) {
          outputEntry = nameWithJS;
        }
        return nameWithJS;
      },
      format,
      preserveModules: true,
      sourcemap: false,
    },
  });
  const handler = outputEntry;

  if (!handler) {
    throw new Error('Unable to resolve module for entrypoint');
  }
  if (!outputEntry) {
    throw new Error('Unable to resolve module for entrypoint');
  }

  const outPath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    outputEntry
  );

  const { fileList } = await nodeFileTrace([outPath], {
    base: workPath,
    processCwd: workPath,
    ts: true,
    mixedModules: true,
    ignore: config.excludeFiles,
  });

  for (const file of fileList) {
    const fsPath = resolve(workPath, file);
    const { mode } = lstatSync(fsPath);
    preparedFiles[file] = new FileFsRef({ fsPath, mode });
  }
  const expressPath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    'node_modules',
    'express',
    'index.js'
  );
  await outputFile(
    expressPath,
    `'use strict';

const fs = require('fs');
const path = require('path');

const mod = require('../../../../../../node_modules/express/lib/express');

const routesFile = path.join(__dirname, '..', '..', 'routes.json');
const routes = {};

const staticPaths = {}
const originalStatic = mod.static

mod.static = (...args) => {
  staticPaths[args[0]] = args[1] || true
  return originalStatic(...args)
}

let app = null;
const func2 = (...args) => {
  app = mod(...args);

  return app;
}
let views = ''
let viewEngine = ''

// Copy all properties from the original module to preserve functionality
Object.setPrototypeOf(func2, mod);
Object.assign(func2, mod);

const extractRoutes = () => {
  const methods = ["all", "get", "post", "put", "delete", "patch", "options", "head"]
  for (const route of app.router.stack) {
    if(route.route) {
      const m = [];
      for (const method of methods) {
        if(route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      routes[route.route.path] = { methods: m };
    }
  }
  console.log(app.settings)
  views = app.settings.views
  viewEngine = app.settings['view engine']
  fs.writeFileSync(routesFile, JSON.stringify({routes, views, staticPaths, viewEngine}, null, 2));
}

process.on('exit', () => {
  extractRoutes()
});

process.on('SIGINT', () => {
  extractRoutes()
  process.exit(0);
});
// Write routes to file on SIGTERM
process.on('SIGTERM', () => {
  extractRoutes()
  process.exit(0);
});

module.exports = func2

  `
  );

  // Capture routes using child process
  await new Promise(resolve => {
    const child = spawn('node', [outPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workPath,
      env: { ...process.env, ...(meta.env || {}), ...(meta.buildEnv || {}) },
    });

    child.stderr.on('data', data => {
      console.error(`stderr: ${data}`);
    });

    // Kill after 2 seconds
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 1000);

    // Wait for child to complete
    child.on('close', () => {
      resolve(undefined);
    });
  });

  // Process includeFiles if specified
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
          preparedFiles[relPath] = entry;
          console.log('Added includeFile to preparedFiles:', relPath);
        })
      );
    }
  }
  const routesFilePath = join(
    workPath,
    '.vercel',
    'output',
    'functions',
    'index.func',
    'routes.json'
  );
  const routesFile = readFileSync(routesFilePath, 'utf8');
  await rm(routesFilePath);
  await rm(
    join(
      workPath,
      '.vercel',
      'output',
      'functions',
      'index.func',
      'node_modules'
    ),
    { recursive: true, force: true }
  );

  const convertExpressRoute = async (
    route: string,
    routeData: { methods: string[] }
  ) => {
    // Convert Express params (:id) to Vercel params ([id])
    const dest = route.replace(/:([^/]+)/g, '[$1]');

    // Convert Express params to regex for src
    const src = route.replace(/:([^/]+)/g, '([^/]+)');

    // create symlink to index.func with fs-extra
    // if the dest path has a parent, create the parent directory
    const destPath = join(
      workPath,
      '.vercel',
      'output',
      'functions',
      `${dest}.func`
    );
    const destPathParent = join(
      workPath,
      '.vercel',
      'output',
      'functions',
      dest.split(sep).slice(0, -1).join(sep)
    );
    if (dest.split(sep).length > 2) {
      await mkdirp(destPathParent);
    }
    if (existsSync(destPath)) {
      await rm(destPath);
    }

    // Create relative path symlink
    const targetPath = join(
      workPath,
      '.vercel',
      'output',
      'functions',
      'index.func'
    );
    const relativeTargetPath = relative(dirname(destPath), targetPath);

    await symlink(relativeTargetPath, destPath);

    return {
      src: `^${src}$`,
      dest: dest,
      methods: routeData.methods,
    };
  };

  const data = JSON.parse(routesFile || '{}');
  if (data.views) {
    const viewsPath = relative(workPath, data.views);
    const views = await glob(`${viewsPath}/**/*`, workPath);
    for (const file of Object.keys(views)) {
      preparedFiles[file] = new FileBlob({
        data: readFileSync(file),
        mode: 0o644,
      });
    }
  }
  if (data.viewEngine) {
    const viewEngineDep = require_.resolve(data.viewEngine, {
      paths: [workPath],
    });
    const { fileList } = await nodeFileTrace([viewEngineDep], {
      base: workPath,
      processCwd: workPath,
      ts: true,
      mixedModules: true,
      ignore: config.excludeFiles,
    });
    for (const file of fileList) {
      preparedFiles[file] = new FileFsRef({ fsPath: file, mode: 0o644 });
    }
  }
  /**
   * TODO: for static paths declared without any options
   * we can put them on the CDN instead of including them
   * here. But for now, just include them
   */
  if (data.staticPaths) {
    const staticPaths = data.staticPaths;

    for (const path of Object.keys(staticPaths)) {
      if (path !== 'public') {
        const files = await glob(`${path}/**/*`, workPath);
        for (const file of Object.keys(files)) {
          preparedFiles[file] = new FileBlob({
            data: readFileSync(file),
            mode: 0o644,
          });
        }
      }
    }
  }
  const routesData = JSON.parse(routesFile?.routes || '{}');
  const routePaths = Object.keys(routesData);
  const proxyRoutes = await Promise.all(
    routePaths.map(route => convertExpressRoute(route, routesData[route]))
  );

  return {
    proxyRoutes,
    preparedFiles,
    shouldAddSourcemapSupport,
    handler,
  };
}
