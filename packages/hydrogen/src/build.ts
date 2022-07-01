import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import {
  debug,
  download,
  EdgeFunction,
  execCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  glob,
  readConfigFile,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
} from '@vercel/build-utils';
import type { BuildV2, PackageJson } from '@vercel/build-utils';

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
  const entrypointDirname = join(workPath, mountpoint);

  // Run "Install Command"
  const nodeVersion = await getNodeVersion(
    entrypointDirname,
    undefined,
    config,
    meta
  );

  const spawnOpts = getSpawnOptions(meta, nodeVersion);
  const { cliType, lockfileVersion } = await scanParentDirs(entrypointDirname);

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
        cwd: entrypointDirname,
      });
    } else {
      console.log(`Skipping "install" command...`);
    }
  } else {
    await runNpmInstall(entrypointDirname, [], spawnOpts, meta, nodeVersion);
  }

  // Copy the edge entrypoint file into `.vercel/cache`
  await fs.mkdir(join(repoRootPath, '.vercel/cache/hydrogen', mountpoint), {
    recursive: true,
  });
  await fs.copyFile(
    join(__dirname, '..', 'edge-entry.js'),
    join(repoRootPath, '.vercel/cache/hydrogen', mountpoint, 'edge-entry.js')
  );

  // Make `shopify hydrogen build` output a Edge Function compatible bundle
  spawnOpts.env.SHOPIFY_FLAG_BUILD_TARGET = 'worker';

  // Use this file as the entrypoint for the Edge Function bundle build
  spawnOpts.env.SHOPIFY_FLAG_BUILD_SSR_ENTRY =
    '.vercel/cache/hydrogen/edge-entry.js';

  // Run "Build Command"
  if (buildCommand) {
    debug(`Executing build command "${buildCommand}"`);
    await execCommand(buildCommand, {
      ...spawnOpts,
      cwd: entrypointDirname,
    });
  } else {
    const pkg = await readConfigFile<PackageJson>(
      join(entrypointDirname, 'package.json')
    );
    if (hasScript('vercel-build', pkg)) {
      debug(`Executing "yarn vercel-build"`);
      await runPackageJsonScript(entrypointDirname, 'vercel-build', spawnOpts);
    } else if (hasScript('build', pkg)) {
      debug(`Executing "yarn build"`);
      await runPackageJsonScript(entrypointDirname, 'build', spawnOpts);
    } else {
      await execCommand('shopify hydrogen build', {
        ...spawnOpts,
        cwd: entrypointDirname,
      });
    }
  }

  const [staticFiles, edgeFunctionFiles] = await Promise.all([
    glob('**', join(entrypointDirname, 'dist/client')),
    glob('**', join(entrypointDirname, 'dist/worker')),
  ]);

  const edgeFunction = new EdgeFunction({
    name: 'hydrogen',
    deploymentTarget: 'v8-worker',
    entrypoint: 'index.js',
    files: edgeFunctionFiles,
  });

  // The `index.html` file is a template, but we want to serve the
  // SSR version instead, so omit this static file from the output
  delete staticFiles['index.html'];

  return {
    routes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/hydrogen',
      },
    ],
    output: {
      hydrogen: edgeFunction,
      ...staticFiles,
    },
  };
};

function hasScript(scriptName: string, pkg: PackageJson | null) {
  const scripts = pkg?.scripts || {};
  return typeof scripts[scriptName] === 'string';
}
