import { readFileSync, promises as fs } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
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
  ensureResolvable,
  getPathFromRoute,
  getRegExpFromPath,
  hasScript,
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

  const { cliType, lockfileVersion, packageJson } = await scanParentDirs(
    entrypointFsDirname,
    true
  );

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  if (!spawnOpts.env) {
    spawnOpts.env = {};
  }

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    nodeVersion,
    env: spawnOpts.env,
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
  const remixRunDevPath = await ensureResolvable(
    entrypointFsDirname,
    repoRootPath,
    '@remix-run/dev'
  );
  const remixRunDevPkg = JSON.parse(
    readFileSync(join(remixRunDevPath, 'package.json'), 'utf8')
  );
  const remixVersion = remixRunDevPkg.version;

  const cleanupOps: Promise<void>[] = [];

  try {
    // Make `remix build` output production mode
    spawnOpts.env.NODE_ENV = 'production';

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
  } finally {
    await Promise.all(cleanupOps);
  }

  // This needs to happen before we run NFT to create the Node/Edge functions
  // TODO: maybe remove this?
  await Promise.all([
    ensureResolvable(
      entrypointFsDirname,
      repoRootPath,
      '@remix-run/server-runtime'
    ),
    ensureResolvable(entrypointFsDirname, repoRootPath, '@remix-run/node'),
  ]);

  const remixBuildResultPath = join(
    entrypointFsDirname,
    '.vercel/remix-build-result.json'
  );
  const {
    buildManifest,
    remixConfig,
  }: {
    buildManifest: {
      serverBundles?: Record<string, { id: string; file: string; config: any }>;
      routeIdToServerBundleId?: Record<string, string>;
      routes: Record<string, any>;
    };
    remixConfig: {
      buildDirectory: string;
      publicPath: string;
    };
  } = JSON.parse(readFileSync(remixBuildResultPath, 'utf8'));
  console.log(buildManifest);
  console.log(remixConfig);

  const staticDir = join(remixConfig.buildDirectory, 'client');
  const serverBundles = Object.values(buildManifest.serverBundles ?? {});

  const [staticFiles, ...functions] = await Promise.all([
    glob('**', staticDir),
    //glob('**', remixConfig.assetsBuildDirectory),
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
  console.log(functionsMap);

  //const transformedBuildAssets = rename(buildAssets, name => {
  //  return posix.join('./', remixConfig.publicPath, name);
  //});

  const output: BuildResultV2Typical['output'] = staticFiles;
  const routes: any[] = [
    {
      src: `^/${remixConfig.publicPath.replace(/^\/|\/$/g, '')}/(.*)$`,
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
    console.log({ id, functionId, path });

    // If the route is a pathless layout route (at the root level)
    // and doesn't have any sub-routes, then a function should not be created.
    if (!path) {
      continue;
    }

    const func = functionsMap.get(functionId);

    if (!func) {
      throw new Error(`Could not determine server bundle for "${id}"`);
    }

    output[path] =
      func instanceof EdgeFunction
        ? // `EdgeFunction` currently requires the "name" property to be set.
          // Ideally this property will be removed, at which point we can
          // return the same `edgeFunction` instance instead of creating a
          // new one for each page.
          new EdgeFunction({
            ...func,
            name: path,
          })
        : func;

    // If this is a dynamic route then add a Vercel route
    const re = getRegExpFromPath(rePath);
    if (re) {
      routes.push({
        src: re.source,
        dest: path,
      });
    }
  }

  // Add a 404 path for not found pages to be server-side rendered by Remix.
  // Use an edge function bundle if one was generated, otherwise use Node.js.
  //if (!output['404']) {
  //  //const edgeFunctionIndex = Array.from(functionsMap.keys()).findIndex(
  //  //  id => {
  //  //    const serverBundle = buildManifest.serverBundles[id];
  //  //    return serverBundle.config.runtime === 'edge';
  //  //  }
  //  //);
  //  //const func =
  //  //  edgeFunctionIndex !== -1 ? functions[edgeFunctionIndex] : functions[0];
  //  const func = functions[0];
  //  output['404'] = func;
  //}

  routes.push({
    src: '/(.*)',
    dest: '/',
  });
  console.log(routes);
  console.log(output);

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
    await writeEntrypointFile(
      handlerPath,
      nodeServerSrc.replace(
        '@remix-run/dev/server-build',
        `./${baseServerBuildPath}.js`
      ),
      rootDir
    );
  }

  // Trace the handler with `@vercel/nft`
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
  });

  for (const warning of trace.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

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
    await writeEntrypointFile(
      handlerPath,
      edgeServerSrc.replace(
        '@remix-run/dev/server-build',
        `./${baseServerBuildPath}.js`
      ),
      rootDir
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

        // When `@remix-run/vercel` is detected, we need to modify the `package.json`
        // to include the "browser" field so that the proper Edge entrypoint file
        // is used. This is a temporary stop gap until this PR is merged:
        // https://github.com/remix-run/remix/pull/5537
        if (pkgJson.name === '@remix-run/vercel') {
          pkgJson.browser = 'dist/edge.js';
          pkgJson.dependencies['@remix-run/server-runtime'] =
            pkgJson.dependencies['@remix-run/node'];

          if (!remixRunVercelPkgJson) {
            remixRunVercelPkgJson = JSON.stringify(pkgJson, null, 2) + '\n';

            // Copy in the edge entrypoint so that NFT can properly resolve it
            const vercelEdgeEntrypointPath = join(
              DEFAULTS_PATH,
              'vercel-edge-entrypoint.js'
            );
            const vercelEdgeEntrypointDest = join(
              dirname(fsPath),
              'dist/edge.js'
            );
            await fs.copyFile(
              vercelEdgeEntrypointPath,
              vercelEdgeEntrypointDest
            );
          }
        }

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

  for (const warning of trace.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

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

async function writeEntrypointFile(
  path: string,
  data: string,
  rootDir: string
) {
  try {
    await fs.writeFile(path, data);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `The "${relative(
          rootDir,
          dirname(path)
        )}" directory does not exist. Please contact support at https://vercel.com/help.`
      );
    }
    throw err;
  }
}
