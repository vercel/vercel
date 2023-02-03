import { promises as fs } from 'fs';
import { dirname, join, relative } from 'path';
import {
  debug,
  download,
  execCommand,
  FileFsRef,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  glob,
  NodejsLambda,
  readConfigFile,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
  walkParentDirs,
} from '@vercel/build-utils';
import type {
  BuildV2,
  Files,
  NodeVersion,
  PackageJson,
} from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
import { readConfig } from '@remix-run/dev/dist/config';
import type { BuildResultV2Typical } from '@vercel/build-utils';

// Name of the Remix runtime adapter npm package for Vercel
const REMIX_RUNTIME_ADAPTER_NAME = '@remix-run/vercel';

// Pinned version of the last verified working version of the adapter
const REMIX_RUNTIME_ADAPTER_VERSION = '1.6.1';

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

  // Ensure `@remix-run/vercel` is in the project's `package.json`
  const packageJsonPath = await walkParentDirs({
    base: repoRootPath,
    start: workPath,
    filename: 'package.json',
  });
  if (packageJsonPath) {
    const packageJson: PackageJson = JSON.parse(
      await fs.readFile(packageJsonPath, 'utf8')
    );
    const { dependencies = {}, devDependencies = {} } = packageJson;

    let modified = false;
    if (REMIX_RUNTIME_ADAPTER_NAME in devDependencies) {
      dependencies[REMIX_RUNTIME_ADAPTER_NAME] =
        devDependencies[REMIX_RUNTIME_ADAPTER_NAME];
      delete devDependencies[REMIX_RUNTIME_ADAPTER_NAME];
      console.log(
        `Warning: Moving "${REMIX_RUNTIME_ADAPTER_NAME}" from \`devDependencies\` to \`dependencies\`. You should commit this change.`
      );
      modified = true;
    } else if (!(REMIX_RUNTIME_ADAPTER_NAME in dependencies)) {
      dependencies[REMIX_RUNTIME_ADAPTER_NAME] = REMIX_RUNTIME_ADAPTER_VERSION;
      console.log(
        `Warning: Adding "${REMIX_RUNTIME_ADAPTER_NAME}" v${REMIX_RUNTIME_ADAPTER_VERSION} to \`dependencies\`. You should commit this change.`
      );
      modified = true;
    }

    if (modified) {
      const packageJsonString = JSON.stringify(
        {
          ...packageJson,
          dependencies,
          devDependencies,
        },
        null,
        2
      );
      await fs.writeFile(packageJsonPath, `${packageJsonString}\n`);
    }
  } else {
    debug(`Failed to find "package.json" file in project`);
  }

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

  // Run "Build Command"
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

  const remixConfig = await readConfig(entrypointFsDirname);
  console.log(remixConfig);
  const { serverBuildPath, routes } = remixConfig;

  // If `serverBuildTarget === 'vercel'` then Remix will output a handler
  // that is already in Vercel (req, res) format, so don't inject the handler
  //if (remixConfig.serverBuildTarget) {
  //  //if (remixConfig.serverBuildTarget !== 'vercel') {
  //  //  throw new Error(
  //  //    `\`serverBuildTarget\` in Remix config must be "vercel" (got "${remixConfig.serverBuildTarget}")`
  //  //  );
  //  //}
  //  serverBuildPath = 'api/index.js';
  //  needsHandler = false;
  //}

  //if (remixConfig.serverBuildPath) {
  //  // Explicit file path where the server output file will be
  //  serverBuildPath = remixConfig.serverBuildPath;
  ////} else if (remixConfig.serverBuildDirectory) {
  ////  // Explicit directory path the server output will be
  ////  serverBuildPath = join(remixConfig.serverBuildDirectory, 'index.js');
  //}

  //// Also check for whether were in a monorepo.
  //// If we are, prepend the app root directory from config onto the build path.
  //// e.g. `/apps/my-remix-app/api/index.js`
  //const isMonorepo = repoRootPath && repoRootPath !== workPath;
  //if (isMonorepo) {
  //  const rootDirectory = relative(repoRootPath, workPath);
  //  serverBuildPath = join(rootDirectory, serverBuildPath);
  //}

  console.log({ serverBuildPath });

  const [staticFiles, renderFunction] = await Promise.all([
    glob('**', dirname(remixConfig.assetsBuildDirectory)),
    createRenderServerlessFunction(
      entrypointFsDirname,
      repoRootPath,
      serverBuildPath,
      nodeVersion
    ),
  ]);

  const output: BuildResultV2Typical['output'] = staticFiles;

  for (const route of Object.values(routes)) {
    if (!route.path) continue;
    //output[route.path] = renderFunction;
  }

  // Add a 404 path for not found pages to be server-side rendered by Remix
  output['404'] = renderFunction;

  return {
    routes: [
      {
        src: '^/build/(.*)$',
        headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        continue: true,
      },
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/404',
      },
    ],
    output,
  };
};

function hasScript(scriptName: string, pkg: PackageJson | null) {
  const scripts = (pkg && pkg.scripts) || {};
  return typeof scripts[scriptName] === 'string';
}

async function createRenderServerlessFunction(
  entrypointDir: string,
  rootDir: string,
  serverBuildPath: string,
  nodeVersion: NodeVersion
): Promise<NodejsLambda> {
  const files: Files = {};

  // Rename from `.js` to `.mjs`
  const renamedServerBuildPath = serverBuildPath.replace(/\.js$/, '.mjs');
  await fs.rename(serverBuildPath, renamedServerBuildPath);

  const relativeServerBuildPath = relative(rootDir, renamedServerBuildPath);
  console.log({ relativeServerBuildPath });
  const handler = join(dirname(relativeServerBuildPath), 'server-node.mjs');
  const handlerPath = join(rootDir, handler);
  console.log({ relativeServerBuildPath, handler, handlerPath });

  // Copy the `server-node.mjs` file into the "build" directory
  const sourceHandlerPath = join(__dirname, '../server-node.mjs');
  await fs.copyFile(sourceHandlerPath, handlerPath);

  // Trace the handler with `@vercel/nft`
  const trace = await nodeFileTrace([handlerPath], {
    base: rootDir,
    processCwd: entrypointDir,
  });

  for (const warning of trace.warnings) {
    console.log(`Warning from trace: ${warning.message}`);
  }

  for (const file of trace.fileList) {
    files[file] = await FileFsRef.fromFsPath({ fsPath: join(rootDir, file) });
  }

  const lambda = new NodejsLambda({
    files,
    handler,
    runtime: nodeVersion.runtime,
    shouldAddHelpers: false,
    shouldAddSourcemapSupport: false,
    operationType: 'SSR',
  });

  return lambda;
}
