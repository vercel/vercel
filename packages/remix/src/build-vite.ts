import { readFileSync, promises as fs, statSync, existsSync } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
import { isErrnoException } from '@vercel/error-utils';
import { nodeFileTrace, NodeFileTraceOptions } from '@vercel/nft';
import {
  BuildResultV2Typical,
  debug,
  execCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  glob,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
  FileBlob,
  FileFsRef,
  EdgeFunction,
  NodejsLambda,
} from '@vercel/build-utils';
import {
  getPathFromRoute,
  getRegExpFromPath,
  getPackageVersion,
  hasScript,
  logNftWarnings,
  findConfig,
} from './utils';
import type { BuildV2, Files, NodeVersion } from '@vercel/build-utils';

const DEFAULTS_PATH = join(__dirname, '../defaults');

const edgeServerSrcPromise = fs.readFile(
  join(DEFAULTS_PATH, 'server-edge.mjs'),
  'utf-8'
);
const nodeServerSrcPromise = fs.readFile(
  join(DEFAULTS_PATH, 'server-node.mjs'),
  'utf-8'
);
const reactRouterServerSrcPromise = fs.readFile(
  join(DEFAULTS_PATH, 'server-react-router.mjs'),
  'utf-8'
);

interface BuildResultBase {
  buildManifest: {
    serverBundles?: Record<
      string,
      { id: string; file: string; config: Record<string, unknown> }
    >;
    routeIdToServerBundleId?: Record<string, string>;
    routes: Record<
      string,
      {
        id: string;
        file: string;
        path?: string;
        index?: boolean;
        parentId?: string;
        config: Record<string, unknown>;
      }
    >;
  };
  viteConfig?: {
    build?: {
      assetsDir: string;
    };
  };
}

interface RemixBuildResult extends BuildResultBase {
  remixConfig: {
    buildDirectory: string;
  };
}

interface ReactRouterBuildResult extends BuildResultBase {
  reactRouterConfig: {
    buildDirectory: string;
  };
}

type BuildResult = RemixBuildResult | ReactRouterBuildResult;

interface RenderFunctionOptions {
  nodeVersion: NodeVersion;
  entrypointDir: string;
  rootDir: string;
  serverBuildPath: string;
  serverEntryPoint: string | undefined;
  frameworkVersion: string;
  config: /*TODO: ResolvedNodeRouteConfig*/ any;
}

interface FrameworkSettings {
  primaryPackageName: string;
  buildCommand: string;
  buildResultFilePath: string;
  presetDocumentationLink: string;

  createRenderFunction: (
    options: RenderFunctionOptions
  ) => Promise<EdgeFunction | NodejsLambda>;
}

const REMIX_FRAMEWORK_SETTINGS: FrameworkSettings = {
  primaryPackageName: '@remix-run/dev',
  buildCommand: 'remix build',
  buildResultFilePath: '.vercel/remix-build-result.json',
  presetDocumentationLink:
    'https://vercel.com/docs/frameworks/remix#vercel-vite-preset',

  createRenderFunction({
    nodeVersion,
    entrypointDir,
    rootDir,
    serverBuildPath,
    serverEntryPoint,
    frameworkVersion,
    config,
  }: RenderFunctionOptions): Promise<EdgeFunction | NodejsLambda> {
    if (config.runtime === 'edge') {
      return createRenderEdgeFunction(
        entrypointDir,
        rootDir,
        serverBuildPath,
        serverEntryPoint,
        frameworkVersion,
        config
      );
    }

    return createRenderNodeFunction(
      nodeVersion,
      entrypointDir,
      rootDir,
      serverBuildPath,
      serverEntryPoint,
      frameworkVersion,
      config
    );
  },
};

const REACT_ROUTER_FRAMEWORK_SETTINGS: FrameworkSettings = {
  primaryPackageName: 'react-router',
  buildCommand: 'react-router build',
  buildResultFilePath: '.vercel/react-router-build-result.json',
  presetDocumentationLink: '', // TODO waiting on posted documentation

  createRenderFunction({
    nodeVersion,
    entrypointDir,
    rootDir,
    serverBuildPath,
    serverEntryPoint,
    frameworkVersion,
    config,
  }: RenderFunctionOptions): Promise<EdgeFunction | NodejsLambda> {
    return createRenderReactRouterFunction(
      nodeVersion,
      entrypointDir,
      rootDir,
      serverBuildPath,
      serverEntryPoint,
      frameworkVersion,
      config
    );
  },
};

function determineFrameworkSettings(workPath: string) {
  const isReactRouter = findConfig(workPath, 'react-router.config', [
    '.js',
    '.ts',
    '.mjs',
    '.mts',
  ]);

  if (isReactRouter) {
    return REACT_ROUTER_FRAMEWORK_SETTINGS;
  }
  return REMIX_FRAMEWORK_SETTINGS;
}

export const build: BuildV2 = async ({
  entrypoint,
  workPath,
  repoRootPath,
  config,
  meta = {},
}) => {
  const { installCommand, buildCommand } = config;
  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);

  const frameworkSettings = determineFrameworkSettings(workPath);

  // Run "Install Command"
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
    undefined,
    config,
    meta
  );

  const {
    cliType,
    lockfileVersion,
    packageJson,
    packageJsonPackageManager,
    turboSupportsCorepackHome,
  } = await scanParentDirs(entrypointFsDirname, true);

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  if (!spawnOpts.env) {
    spawnOpts.env = {};
  }

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    nodeVersion,
    env: spawnOpts.env,
    turboSupportsCorepackHome,
  });

  if (typeof installCommand === 'string') {
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
    await runNpmInstall(entrypointFsDirname, [], spawnOpts, meta, nodeVersion);
  }

  // Determine the version of framework:
  //   Remix - use "@remix-run/dev"
  //   React Router - use "react-router"
  const frameworkVersion = await getPackageVersion(
    frameworkSettings.primaryPackageName,
    entrypointFsDirname,
    repoRootPath
  );

  // Run "Build Command"
  if (buildCommand) {
    debug(`Executing build command "${buildCommand}"`);
    await execCommand(buildCommand, {
      ...spawnOpts,
      cwd: entrypointFsDirname,
    });
  } else {
    if (hasScript('vercel-build', packageJson)) {
      debug(`Executing "vercel-build" script`);
      await runPackageJsonScript(
        entrypointFsDirname,
        'vercel-build',
        spawnOpts
      );
    } else if (hasScript('build', packageJson)) {
      debug(`Executing "build" script`);
      await runPackageJsonScript(entrypointFsDirname, 'build', spawnOpts);
    } else {
      await execCommand(frameworkSettings.buildCommand, {
        ...spawnOpts,
        cwd: entrypointFsDirname,
      });
    }
  }

  const buildResultJsonPath = join(
    entrypointFsDirname,
    frameworkSettings.buildResultFilePath
  );
  let buildResult: BuildResult | undefined;
  try {
    const buildResultContents = readFileSync(buildResultJsonPath, 'utf8');
    buildResult = JSON.parse(buildResultContents);
  } catch (err: unknown) {
    if (!isErrnoException(err) || err.code !== 'ENOENT') {
      throw err;
    }
    // The project has not configured the `vercelPreset()`
    // Preset in the "vite.config" file. Attempt to check
    // for the default build output directory.
    const buildDirectory = join(entrypointFsDirname, 'build');
    if (statSync(buildDirectory).isDirectory()) {
      console.warn('WARN: The `vercelPreset()` Preset was not detected.');
      console.warn(
        `See ${frameworkSettings.presetDocumentationLink} for more information`
      );
      buildResult = {
        buildManifest: {
          routes: {
            root: {
              path: '',
              id: 'root',
              file: 'app/root.tsx',
              config: {},
            },
            'routes/_index': {
              file: 'app/routes/_index.tsx',
              id: 'routes/_index',
              index: true,
              parentId: 'root',
              config: {},
            },
          },
        },
        remixConfig: {
          buildDirectory,
        },
      };
      // Detect if a server build exists (won't be the case when `ssr: false`)
      const serverPath = 'build/server/index.js';
      if (existsSync(join(entrypointFsDirname, serverPath))) {
        buildResult.buildManifest.routeIdToServerBundleId = {
          'routes/_index': '',
        };
        buildResult.buildManifest.serverBundles = {
          '': {
            id: '',
            file: serverPath,
            config: {},
          },
        };
      }
    }
  }

  if (!buildResult) {
    throw new Error(
      'Could not determine build output directory. Please configure the `vercelPreset()` Preset from the `@vercel/remix` npm package'
    );
  }

  const { buildManifest, viteConfig } = buildResult;
  const buildDirectory =
    'remixConfig' in buildResult
      ? buildResult.remixConfig.buildDirectory
      : buildResult.reactRouterConfig.buildDirectory;

  const staticDir = join(buildDirectory, 'client');
  const serverBundles = Object.values(buildManifest.serverBundles ?? {});

  const [staticFiles, ...functions] = await Promise.all([
    glob('**', staticDir),
    ...serverBundles.map(bundle => {
      return frameworkSettings.createRenderFunction({
        nodeVersion,
        entrypointDir: entrypointFsDirname,
        rootDir: repoRootPath,
        serverBuildPath: join(entrypointFsDirname, bundle.file),
        serverEntryPoint: undefined,
        frameworkVersion,
        config: bundle.config,
      });
    }),
  ]);

  const functionsMap = new Map<string, EdgeFunction | NodejsLambda>();
  for (let i = 0; i < serverBundles.length; i++) {
    functionsMap.set(serverBundles[i].id, functions[i]);
  }

  const output: BuildResultV2Typical['output'] = staticFiles;
  const assetsDir = viteConfig?.build?.assetsDir || 'assets';
  const routes: any[] = [
    {
      src: `^/${assetsDir}/(.*)$`,
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      handle: 'filesystem',
    },
  ];

  for (const [id, functionId] of Object.entries(
    buildManifest.routeIdToServerBundleId ?? {}
  )) {
    const route = buildManifest.routes[id];
    const { path, rePath } = getPathFromRoute(route, buildManifest.routes);

    // If the route is a pathless layout route (at the root level)
    // and doesn't have any sub-routes, then a function should not be created.
    if (!path) {
      continue;
    }

    const func = functionsMap.get(functionId);
    if (!func) {
      throw new Error(`Could not determine server bundle for "${id}"`);
    }

    output[path] = func;

    // If this is a dynamic route then add a Vercel route
    const re = getRegExpFromPath(rePath);
    if (re) {
      routes.push({
        src: re.source,
        dest: path,
      });
    }
  }

  // For the 404 case, invoke the Function (or serve the static file
  // for `ssr: false` mode) at the `/` path. Remix will serve its 404 route.
  routes.push({
    src: '/(.*)',
    dest: '/',
  });

  return { routes, output, framework: { version: frameworkVersion } };
};

async function createRenderReactRouterFunction(
  nodeVersion: NodeVersion,
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  serverEntryPoint: string | undefined,
  frameworkVersion: string,
  config: /*TODO: ResolvedNodeRouteConfig*/ any
): Promise<EdgeFunction | NodejsLambda> {
  const isEdgeFunction = config.runtime === 'edge';
  const files: Files = {};

  let handler = relative(rootDir, serverBuildPath);
  let handlerPath = join(rootDir, handler);
  if (!serverEntryPoint) {
    const baseServerBuildPath = basename(serverBuildPath, '.js');
    handler = join(dirname(handler), `server-${baseServerBuildPath}.mjs`);
    handlerPath = join(rootDir, handler);

    // Copy the `server-react-router.mjs` file into the "build" directory
    const reactRouterServerSrc = await reactRouterServerSrcPromise;
    await fs.writeFile(
      handlerPath,
      reactRouterServerSrc.replace(
        'ENTRYPOINT_PLACEHOLDER',
        `./${baseServerBuildPath}.js`
      )
    );
  }

  // Trace the handler with `@vercel/nft`
  let conditions: NodeFileTraceOptions['conditions'];
  let readFile: NodeFileTraceOptions['readFile'];
  if (isEdgeFunction) {
    conditions = ['edge-light', 'browser', 'module', 'import', 'require'];
    readFile = async fsPath => {
      let source: Buffer | string;
      try {
        source = await fs.readFile(fsPath);
      } catch (err: any) {
        if (err.code === 'ENOENT' || err.code === 'EISDIR') {
          return null;
        }
        throw err;
      }
      if (basename(fsPath) === 'package.json') {
        // For Edge Functions, patch "main" field to prefer "browser" or "module"
        const pkgJson = JSON.parse(source.toString());

        for (const prop of ['browser', 'module']) {
          const val = pkgJson[prop];
          if (typeof val === 'string') {
            pkgJson.main = val;

            // Return the modified `package.json` to nft
            source = JSON.stringify(pkgJson);
            break;
          }
        }
      }
      return source;
    };
  }
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
    conditions,
    readFile,
  });

  logNftWarnings(trace.warnings, 'react-router');

  for (const file of trace.fileList) {
    files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
  }

  let fn: NodejsLambda | EdgeFunction;
  if (isEdgeFunction) {
    fn = new EdgeFunction({
      files,
      deploymentTarget: 'v8-worker',
      entrypoint: handler,
      regions: config.regions,
      framework: {
        slug: 'react-router',
        version: frameworkVersion,
      },
    });
  } else {
    fn = new NodejsLambda({
      files,
      handler,
      runtime: nodeVersion.runtime,
      shouldAddHelpers: false,
      shouldAddSourcemapSupport: false,
      operationType: 'SSR',
      supportsResponseStreaming: true,
      useWebApi: true,
      regions: config.regions,
      memory: config.memory,
      maxDuration: config.maxDuration,
      framework: {
        slug: 'react-router',
        version: frameworkVersion,
      },
    });
  }

  return fn;
}

async function createRenderNodeFunction(
  nodeVersion: NodeVersion,
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  serverEntryPoint: string | undefined,
  frameworkVersion: string,
  config: /*TODO: ResolvedNodeRouteConfig*/ any
): Promise<NodejsLambda> {
  const files: Files = {};

  let handler = relative(rootDir, serverBuildPath);
  let handlerPath = join(rootDir, handler);
  if (!serverEntryPoint) {
    const baseServerBuildPath = basename(serverBuildPath, '.js');
    handler = join(dirname(handler), `server-${baseServerBuildPath}.mjs`);
    handlerPath = join(rootDir, handler);

    // Copy the `server-node.mjs` file into the "build" directory
    const nodeServerSrc = await nodeServerSrcPromise;
    await fs.writeFile(
      handlerPath,
      nodeServerSrc.replace(
        '@remix-run/dev/server-build',
        `./${baseServerBuildPath}.js`
      )
    );
  }

  // Trace the handler with `@vercel/nft`
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
  });

  logNftWarnings(trace.warnings, '@remix-run/node');

  for (const file of trace.fileList) {
    files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
  }

  const fn = new NodejsLambda({
    files,
    handler,
    runtime: nodeVersion.runtime,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    operationType: 'SSR',
    supportsResponseStreaming: true,
    regions: config.regions,
    memory: config.memory,
    maxDuration: config.maxDuration,
    framework: {
      slug: 'remix',
      version: frameworkVersion,
    },
  });

  return fn;
}

async function createRenderEdgeFunction(
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  serverEntryPoint: string | undefined,
  frameworkVersion: string,
  config: /* TODO: ResolvedEdgeRouteConfig*/ any
): Promise<EdgeFunction> {
  const files: Files = {};

  let handler = relative(rootDir, serverBuildPath);
  let handlerPath = join(rootDir, handler);
  if (!serverEntryPoint) {
    const baseServerBuildPath = basename(serverBuildPath, '.js');
    handler = join(dirname(handler), `server-${baseServerBuildPath}.mjs`);
    handlerPath = join(rootDir, handler);

    // Copy the `server-edge.mjs` file into the "build" directory
    const edgeServerSrc = await edgeServerSrcPromise;
    await fs.writeFile(
      handlerPath,
      edgeServerSrc.replace(
        '@remix-run/dev/server-build',
        `./${baseServerBuildPath}.js`
      )
    );
  }

  let remixRunVercelPkgJson: string | undefined;

  // Trace the handler with `@vercel/nft`
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
    conditions: ['edge-light', 'browser', 'module', 'import', 'require'],
    async readFile(fsPath) {
      let source: Buffer | string;
      try {
        source = await fs.readFile(fsPath);
      } catch (err: any) {
        if (err.code === 'ENOENT' || err.code === 'EISDIR') {
          return null;
        }
        throw err;
      }
      if (basename(fsPath) === 'package.json') {
        // For Edge Functions, patch "main" field to prefer "browser" or "module"
        const pkgJson = JSON.parse(source.toString());

        for (const prop of ['browser', 'module']) {
          const val = pkgJson[prop];
          if (typeof val === 'string') {
            pkgJson.main = val;

            // Return the modified `package.json` to nft
            source = JSON.stringify(pkgJson);
            break;
          }
        }
      }
      return source;
    },
  });

  logNftWarnings(trace.warnings, '@remix-run/server-runtime');

  for (const file of trace.fileList) {
    if (
      remixRunVercelPkgJson &&
      file.endsWith(`@remix-run${sep}vercel${sep}package.json`)
    ) {
      // Use the modified `@remix-run/vercel` package.json which contains "browser" field
      files[file] = new FileBlob({ data: remixRunVercelPkgJson });
    } else {
      files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
    }
  }

  const fn = new EdgeFunction({
    files,
    deploymentTarget: 'v8-worker',
    entrypoint: handler,
    regions: config.regions,
    framework: {
      slug: 'remix',
      version: frameworkVersion,
    },
  });

  return fn;
}
