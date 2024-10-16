import { readFileSync, promises as fs, statSync, existsSync } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
import { isErrnoException } from '@vercel/error-utils';
import { nodeFileTrace } from '@vercel/nft';
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
  getRemixVersion,
  hasScript,
  logNftWarnings,
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

interface RemixBuildResult {
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
  remixConfig: {
    buildDirectory: string;
  };
  viteConfig?: {
    build?: {
      assetsDir: string;
    };
  };
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

  // Determine the version of Remix based on the `@remix-run/dev`
  // package version.
  const remixVersion = await getRemixVersion(entrypointFsDirname, repoRootPath);

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
      await execCommand('remix build', {
        ...spawnOpts,
        cwd: entrypointFsDirname,
      });
    }
  }

  const remixBuildResultPath = join(
    entrypointFsDirname,
    '.vercel/remix-build-result.json'
  );
  let remixBuildResult: RemixBuildResult | undefined;
  try {
    const remixBuildResultContents = readFileSync(remixBuildResultPath, 'utf8');
    remixBuildResult = JSON.parse(remixBuildResultContents);
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
      remixBuildResult = {
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
        remixBuildResult.buildManifest.routeIdToServerBundleId = {
          'routes/_index': '',
        };
        remixBuildResult.buildManifest.serverBundles = {
          '': {
            id: '',
            file: serverPath,
            config: {},
          },
        };
      }
    }
  }

  if (!remixBuildResult) {
    throw new Error(
      'Could not determine build output directory. Please configure the `vercelPreset()` Preset from the `@vercel/remix` npm package'
    );
  }

  const { buildManifest, remixConfig, viteConfig } = remixBuildResult;

  const staticDir = join(remixConfig.buildDirectory, 'client');
  const serverBundles = Object.values(buildManifest.serverBundles ?? {});

  const [staticFiles, ...functions] = await Promise.all([
    glob('**', staticDir),
    ...serverBundles.map(bundle => {
      if (bundle.config.runtime === 'edge') {
        return createRenderEdgeFunction(
          entrypointFsDirname,
          repoRootPath,
          join(entrypointFsDirname, bundle.file),
          undefined,
          remixVersion,
          bundle.config
        );
      }

      return createRenderNodeFunction(
        nodeVersion,
        entrypointFsDirname,
        repoRootPath,
        join(entrypointFsDirname, bundle.file),
        undefined,
        remixVersion,
        bundle.config
      );
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

  return { routes, output, framework: { version: remixVersion } };
};

async function createRenderNodeFunction(
  nodeVersion: NodeVersion,
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  serverEntryPoint: string | undefined,
  remixVersion: string,
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
      version: remixVersion,
    },
  });

  return fn;
}

async function createRenderEdgeFunction(
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  serverEntryPoint: string | undefined,
  remixVersion: string,
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
      version: remixVersion,
    },
  });

  return fn;
}
