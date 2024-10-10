import { promises as fs } from 'fs';
import { dirname, join, relative } from 'path';
import {
  debug,
  download,
  EdgeFunction,
  execCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getPrefixedEnvVars,
  getSpawnOptions,
  glob,
  readConfigFile,
  runNpmInstall,
  runPackageJsonScript,
  scanParentDirs,
} from '@vercel/build-utils';
import type { BuildV2, PackageJson } from '@vercel/build-utils';
import { getConfig } from '@vercel/static-config';
import { Project } from 'ts-morph';

export const build: BuildV2 = async ({
  entrypoint,
  files,
  workPath,
  config,
  meta = {},
}) => {
  const { installCommand, buildCommand } = config;

  await download(files, workPath, meta);

  const prefixedEnvs = getPrefixedEnvVars({
    envPrefix: 'PUBLIC_',
    envs: process.env,
  });

  for (const [key, value] of Object.entries(prefixedEnvs)) {
    process.env[key] = value;
  }

  const mountpoint = dirname(entrypoint);
  const entrypointDir = join(workPath, mountpoint);

  // Run "Install Command"
  const nodeVersion = await getNodeVersion(
    entrypointDir,
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
  } = await scanParentDirs(entrypointDir, true);

  spawnOpts.env = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    nodeVersion,
    env: spawnOpts.env || {},
    turboSupportsCorepackHome,
  });

  if (typeof installCommand === 'string') {
    if (installCommand.trim()) {
      console.log(`Running "install" command: \`${installCommand}\`...`);
      await execCommand(installCommand, {
        ...spawnOpts,
        cwd: entrypointDir,
      });
    } else {
      console.log(`Skipping "install" command...`);
    }
  } else {
    await runNpmInstall(entrypointDir, [], spawnOpts, meta, nodeVersion);
  }

  // Copy the edge entrypoint file into `.vercel/cache`
  const edgeEntryDir = join(workPath, '.vercel/cache/hydrogen');
  const edgeEntryRelative = relative(edgeEntryDir, workPath);
  const edgeEntryDest = join(edgeEntryDir, 'edge-entry.js');
  let edgeEntryContents = await fs.readFile(
    join(__dirname, '..', 'edge-entry.js'),
    'utf8'
  );
  edgeEntryContents = edgeEntryContents.replace(
    /__RELATIVE__/g,
    edgeEntryRelative
  );
  await fs.mkdir(edgeEntryDir, { recursive: true });
  await fs.writeFile(edgeEntryDest, edgeEntryContents);

  // Make `shopify hydrogen build` output a Edge Function compatible bundle
  spawnOpts.env.SHOPIFY_FLAG_BUILD_TARGET = 'worker';

  // Use this file as the entrypoint for the Edge Function bundle build
  spawnOpts.env.SHOPIFY_FLAG_BUILD_SSR_ENTRY = edgeEntryDest;

  // Run "Build Command"
  if (buildCommand) {
    debug(`Executing build command "${buildCommand}"`);
    await execCommand(buildCommand, {
      ...spawnOpts,
      cwd: entrypointDir,
    });
  } else {
    const pkg = await readConfigFile<PackageJson>(
      join(entrypointDir, 'package.json')
    );
    if (hasScript('vercel-build', pkg)) {
      debug(`Executing "yarn vercel-build"`);
      await runPackageJsonScript(entrypointDir, 'vercel-build', spawnOpts);
    } else if (hasScript('build', pkg)) {
      debug(`Executing "yarn build"`);
      await runPackageJsonScript(entrypointDir, 'build', spawnOpts);
    } else {
      await execCommand('shopify hydrogen build', {
        ...spawnOpts,
        cwd: entrypointDir,
      });
    }
  }

  const [staticFiles, edgeFunctionFiles] = await Promise.all([
    glob('**', join(entrypointDir, 'dist/client')),
    glob('**', join(entrypointDir, 'dist/worker')),
  ]);

  const edgeFunction = new EdgeFunction({
    deploymentTarget: 'v8-worker',
    entrypoint: 'index.js',
    files: edgeFunctionFiles,
    regions: (() => {
      try {
        const project = new Project();
        const config = getConfig(project, edgeFunctionFiles['index.js'].fsPath);
        return config?.regions;
      } catch {
        return undefined;
      }
    })(),
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
