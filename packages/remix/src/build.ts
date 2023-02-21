import { Project } from 'ts-morph';
import { promises as fs } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import {
  debug,
  download,
  execCommand,
  FileFsRef,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  glob,
  EdgeFunction,
  NodejsLambda,
  readConfigFile,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
  walkParentDirs,
} from '@vercel/build-utils';
import { getConfig } from '@vercel/static-config';
import { nodeFileTrace } from '@vercel/nft';
import { readConfig, RemixConfig } from '@remix-run/dev/dist/config';
import type {
  BuildV2,
  Files,
  NodeVersion,
  PackageJson,
  BuildResultV2Typical,
} from '@vercel/build-utils';
import type { ConfigRoute } from '@remix-run/dev/dist/config/routes';
import {
  findConfig,
  getPathFromRoute,
  getRegExpFromPath,
  isLayoutRoute,
} from './utils';

const _require: typeof require = eval('require');

export const build: BuildV2 = async ({
  entrypoint,
  files,
  workPath,
  repoRootPath,
  config,
  meta = {},
}) => {
  const { installCommand, buildCommand } = config;

  await download(files, workPath, meta);

  const mountpoint = dirname(entrypoint);
  const entrypointFsDirname = join(workPath, mountpoint);

  // Run "Install Command"
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
    undefined,
    config,
    meta
  );

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  if (!spawnOpts.env) {
    spawnOpts.env = {};
  }
  const { cliType, lockfileVersion } = await scanParentDirs(
    entrypointFsDirname
  );

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    nodeVersion,
    env: spawnOpts.env || {},
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

  // Make `remix build` output production mode
  spawnOpts.env.NODE_ENV = 'production';

  // We need to patch the `remix.config.js` file to force some values necessary
  // for a build that works on either Node.js or the Edge runtime
  const remixConfigPath = findConfig(entrypointFsDirname, 'remix.config');
  const renamedRemixConfigPath = remixConfigPath
    ? `${remixConfigPath}.original${extname(remixConfigPath)}`
    : undefined;
  if (remixConfigPath && renamedRemixConfigPath) {
    await fs.rename(remixConfigPath, renamedRemixConfigPath);

    // Figure out if the `remix.config` file is using ESM syntax
    let isESM = false;
    try {
      _require(renamedRemixConfigPath);
    } catch (err: any) {
      if (err.code === 'ERR_REQUIRE_ESM') {
        isESM = true;
      } else {
        throw err;
      }
    }

    let patchedConfig: string;
    if (isESM) {
      patchedConfig = `import config from './${basename(
        renamedRemixConfigPath
      )}';
config.serverBuildTarget = undefined;
config.server = undefined;
config.serverModuleFormat = 'cjs';
config.serverPlatform = 'node';
config.serverBuildPath = 'build/index.js';
export default config;`;
    } else {
      patchedConfig = `const config = require('./${basename(
        renamedRemixConfigPath
      )}');
config.serverBuildTarget = undefined;
config.server = undefined;
config.serverModuleFormat = 'cjs';
config.serverPlatform = 'node';
config.serverBuildPath = 'build/index.js';
module.exports = config;`;
    }
    await fs.writeFile(remixConfigPath, patchedConfig);
  }

  // Run "Build Command"
  let remixConfig: RemixConfig;
  try {
    if (buildCommand) {
      debug(`Executing build command "${buildCommand}"`);
      await execCommand(buildCommand, {
        ...spawnOpts,
        cwd: entrypointFsDirname,
      });
    } else {
      const pkg = await readConfigFile<PackageJson>(
        join(entrypointFsDirname, 'package.json')
      );
      if (hasScript('vercel-build', pkg)) {
        debug(`Executing "yarn vercel-build"`);
        await runPackageJsonScript(
          entrypointFsDirname,
          'vercel-build',
          spawnOpts
        );
      } else if (hasScript('build', pkg)) {
        debug(`Executing "yarn build"`);
        await runPackageJsonScript(entrypointFsDirname, 'build', spawnOpts);
      } else {
        await execCommand('remix build', {
          ...spawnOpts,
          cwd: entrypointFsDirname,
        });
      }
    }
    remixConfig = await readConfig(entrypointFsDirname);
  } finally {
    // Clean up our patched `remix.config.js` to be polite
    if (remixConfigPath && renamedRemixConfigPath) {
      await fs.rename(renamedRemixConfigPath, remixConfigPath);
    }
  }

  const { serverBuildPath } = remixConfig;
  const remixRoutes = Object.values(remixConfig.routes);

  // Figure out which pages should be edge functions
  const edgePages = new Set<ConfigRoute>();
  const project = new Project();
  for (const route of remixRoutes) {
    const routePath = join(remixConfig.appDirectory, route.file);
    const staticConfig = getConfig(project, routePath);
    const isEdge =
      staticConfig?.runtime === 'edge' ||
      staticConfig?.runtime === 'experimental-edge';
    if (isEdge) {
      edgePages.add(route);
    }
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

  const [staticFiles, nodeFunction, edgeFunction] = await Promise.all([
    glob('**', join(entrypointFsDirname, 'public')),
    createRenderNodeFunction(
      entrypointFsDirname,
      repoRootPath,
      serverBuildPath,
      nodeVersion
    ),
    edgePages.size > 0
      ? createRenderEdgeFunction(
          entrypointFsDirname,
          repoRootPath,
          serverBuildPath
        )
      : undefined,
  ]);

  const output: BuildResultV2Typical['output'] = staticFiles;
  const routes: any[] = [
    {
      src: '^/build/(.*)$',
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      handle: 'filesystem',
    },
  ];

  for (const route of remixRoutes) {
    // Layout routes don't get a function / route added
    if (isLayoutRoute(route.id, remixRoutes)) continue;

    const path = getPathFromRoute(route, remixConfig.routes);
    const isEdge = edgePages.has(route);
    const fn =
      isEdge && edgeFunction
        ? // `EdgeFunction` currently requires the "name" property to be set.
          // Ideally this property will be removed, at which point we can
          // return the same `edgeFunction` instance instead of creating a
          // new one for each page.
          new EdgeFunction({
            ...edgeFunction,
            name: path,
          })
        : nodeFunction;
    output[path] = fn;

    // If this is a dynamic route then add a Vercel route
    const re = getRegExpFromPath(path);
    if (re) {
      routes.push({
        src: re.source,
        dest: path,
      });
    }
  }

  // Add a 404 path for not found pages to be server-side rendered by Remix.
  // Use the edge function if one was generated, otherwise use Node.js.
  if (!output['404']) {
    output['404'] = edgeFunction
      ? new EdgeFunction({ ...edgeFunction, name: '404' })
      : nodeFunction;
  }
  routes.push({
    src: '/(.*)',
    dest: '/404',
  });

  return { routes, output };
};

function hasScript(scriptName: string, pkg: PackageJson | null) {
  const scripts = (pkg && pkg.scripts) || {};
  return typeof scripts[scriptName] === 'string';
}

async function createRenderNodeFunction(
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  nodeVersion: NodeVersion
): Promise<NodejsLambda> {
  const files: Files = {};

  const relativeServerBuildPath = relative(rootDir, serverBuildPath);
  const handler = join(dirname(relativeServerBuildPath), 'server-node.mjs');
  const handlerPath = join(rootDir, handler);

  // Copy the `server-node.mjs` file into the "build" directory
  const sourceHandlerPath = join(__dirname, '../server-node.mjs');
  await fs.copyFile(sourceHandlerPath, handlerPath);

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
    experimentalResponseStreaming: true,
  });

  return fn;
}

async function createRenderEdgeFunction(
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string
): Promise<EdgeFunction> {
  const files: Files = {};

  const relativeServerBuildPath = relative(rootDir, serverBuildPath);
  const handler = join(dirname(relativeServerBuildPath), 'server-edge.mjs');
  const handlerPath = join(rootDir, handler);

  // Copy the `server-edge.mjs` file into the "build" directory
  const sourceHandlerPath = join(__dirname, '../server-edge.mjs');
  await fs.copyFile(sourceHandlerPath, handlerPath);

  // Trace the handler with `@vercel/nft`
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
    conditions: ['worker', 'browser'],
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

  for (const warning of trace.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

  for (const file of trace.fileList) {
    files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
  }

  const fn = new EdgeFunction({
    files,
    deploymentTarget: 'v8-worker',
    name: 'render',
    entrypoint: handler,
  });

  return fn;
}

async function ensureResolvable(start: string, base: string, pkgName: string) {
  try {
    const resolvedPath = _require.resolve(pkgName, { paths: [start] });
    if (!relative(base, resolvedPath).startsWith(`..${sep}`)) {
      // Resolved path is within the root of the project, so all good
      debug(`"${pkgName}" resolved to '${resolvedPath}'`);
      return;
    }
  } catch (err: any) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
  }

  // If we got to here then `pkgName` was not resolvable up to the root
  // of the project. Try a couple symlink tricks, otherwise we'll bail.

  // Attempt to find the package in `node_modules/.pnpm` (pnpm)
  const pnpmDir = await walkParentDirs({
    base,
    start,
    filename: 'node_modules/.pnpm',
  });
  if (pnpmDir) {
    const prefix = `${pkgName.replace('/', '+')}@`;
    const packages = await fs.readdir(pnpmDir);
    const match = packages.find(p => p.startsWith(prefix));
    if (match) {
      const pkgDir = join(pnpmDir, match, 'node_modules', pkgName);
      const symlinkPath = join(pnpmDir, '..', pkgName);
      const symlinkDir = dirname(symlinkPath);
      const symlinkTarget = relative(symlinkDir, pkgDir);
      await fs.mkdir(symlinkDir, { recursive: true });
      await fs.symlink(symlinkTarget, symlinkPath);
      console.warn(
        `WARN: Created symlink for "${pkgName}". To silence this warning, add "${pkgName}" to "dependencies" in your \`package.json\` file.`
      );
      return;
    }
  }

  // Attempt to find the package in `node_modules/.store` (npm 9+ linked mode)
  const npmDir = await walkParentDirs({
    base,
    start,
    filename: 'node_modules/.store',
  });
  if (npmDir) {
    const prefix = `${basename(pkgName)}@`;
    const prefixDir = join(npmDir, dirname(pkgName));
    const packages = await fs.readdir(prefixDir);
    const match = packages.find(p => p.startsWith(prefix));
    if (match) {
      const pkgDir = join(prefixDir, match, 'node_modules', pkgName);
      const symlinkPath = join(npmDir, '..', pkgName);
      const symlinkDir = dirname(symlinkPath);
      const symlinkTarget = relative(symlinkDir, pkgDir);
      await fs.mkdir(symlinkDir, { recursive: true });
      await fs.symlink(symlinkTarget, symlinkPath);
      console.warn(
        `WARN: Created symlink for "${pkgName}". To silence this warning, add "${pkgName}" to "dependencies" in your \`package.json\` file.`
      );
      return;
    }
  }

  throw new Error(
    `Failed to resolve "${pkgName}". To fix this error, add "${pkgName}" to "dependencies" in your \`package.json\` file.`
  );
}
