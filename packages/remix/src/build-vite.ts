import { readFileSync } from 'fs';
import { dirname, join, posix } from 'path';
import {
  BuildResultV2Typical,
  debug,
  execCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  glob,
  rename,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
} from '@vercel/build-utils';
import { chdirAndReadConfig, ensureResolvable, hasScript } from './utils';
import type { BuildV2 } from '@vercel/build-utils';

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

  const { cliType, lockfileVersion, packageJson, packageJsonPath } =
    await scanParentDirs(entrypointFsDirname, true);

  if (!packageJsonPath) {
    throw new Error('Failed to locate `package.json` file in your project');
  }

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
  // TODO: inject Verel Remix config to vite config

  try {
    // Make `remix build` output production mode
    spawnOpts.env.NODE_ENV = 'production';
    console.log(packageJson);

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
  await Promise.all([
    ensureResolvable(
      entrypointFsDirname,
      repoRootPath,
      '@remix-run/server-runtime'
    ),
    ensureResolvable(entrypointFsDirname, repoRootPath, '@remix-run/node'),
  ]);

  const staticDir = join(entrypointFsDirname, 'public');

  const remixConfig = await chdirAndReadConfig(
    remixRunDevPath,
    entrypointFsDirname,
    packageJsonPath
  );

  const [staticFiles, buildAssets /*, ...functions*/] = await Promise.all([
    glob('**', staticDir),
    glob('**', remixConfig.assetsBuildDirectory),
    //...serverBundles.map(bundle => {
    //  const firstRoute = remixConfig.routes[bundle.routes[0]];
    //  const config = resolvedConfigsMap.get(firstRoute) ?? {
    //    runtime: 'nodejs',
    //  };

    //  if (config.runtime === 'edge') {
    //    return createRenderEdgeFunction(
    //      entrypointFsDirname,
    //      repoRootPath,
    //      join(entrypointFsDirname, bundle.serverBuildPath),
    //      serverEntryPoint,
    //      remixVersion,
    //      config
    //    );
    //  }

    //  return createRenderNodeFunction(
    //    nodeVersion,
    //    entrypointFsDirname,
    //    repoRootPath,
    //    join(entrypointFsDirname, bundle.serverBuildPath),
    //    serverEntryPoint,
    //    remixVersion,
    //    config
    //  );
    //}),
  ]);

  const transformedBuildAssets = rename(buildAssets, name => {
    return posix.join('./', remixConfig.publicPath, name);
  });

  const output: BuildResultV2Typical['output'] = {
    ...staticFiles,
    ...transformedBuildAssets,
  };
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

  //for (const route of remixRoutes) {
  //  // Layout routes don't get a function / route added
  //  if (isLayoutRoute(route.id, remixRoutes)) continue;

  //  const { path, rePath } = getPathFromRoute(route, remixConfig.routes);

  //  // If the route is a pathless layout route (at the root level)
  //  // and doesn't have any sub-routes, then a function should not be created.
  //  if (!path) {
  //    continue;
  //  }

  //  const funcIndex = serverBundles.findIndex(bundle => {
  //    return bundle.routes.includes(route.id);
  //  });
  //  const func = functions[funcIndex];

  //  if (!func) {
  //    throw new Error(`Could not determine server bundle for "${route.id}"`);
  //  }

  //  output[path] =
  //    func instanceof EdgeFunction
  //      ? // `EdgeFunction` currently requires the "name" property to be set.
  //        // Ideally this property will be removed, at which point we can
  //        // return the same `edgeFunction` instance instead of creating a
  //        // new one for each page.
  //        new EdgeFunction({
  //          ...func,
  //          name: path,
  //        })
  //      : func;

  //  // If this is a dynamic route then add a Vercel route
  //  const re = getRegExpFromPath(rePath);
  //  if (re) {
  //    routes.push({
  //      src: re.source,
  //      dest: path,
  //    });
  //  }
  //}

  //// Add a 404 path for not found pages to be server-side rendered by Remix.
  //// Use an edge function bundle if one was generated, otherwise use Node.js.
  //if (!output['404']) {
  //  const edgeFunctionIndex = Array.from(serverBundlesMap.values()).findIndex(
  //    routes => {
  //      const runtime = resolvedConfigsMap.get(routes[0])?.runtime;
  //      return runtime === 'edge';
  //    }
  //  );
  //  const func =
  //    edgeFunctionIndex !== -1 ? functions[edgeFunctionIndex] : functions[0];
  //  output['404'] =
  //    func instanceof EdgeFunction
  //      ? new EdgeFunction({ ...func, name: '404' })
  //      : func;
  //}
  routes.push({
    src: '/(.*)',
    dest: '/404',
  });

  return { routes, output, framework: { version: remixVersion } };
};
