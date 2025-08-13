import {
  BuildOptions,
  Config,
  execCommand,
  Files,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  PackageJson,
  scanParentDirs,
  type BuildV3,
} from '@vercel/build-utils';
// @ts-expect-error - FIXME: hono-framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { readFileSync } from 'fs';
import path, { sep } from 'path';

export const build: BuildV3 = async args => {
  const entrypoint = findEntrypoint(args.files);

  await handleBuildCommand(entrypoint, args);

  // Introducing new behavior for the node builder where Typescript errors always
  // fail the build. Previously, this relied on noEmitOnError being true in the tsconfig.json
  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeBuild({
    ...args,
    entrypoint,
  });
};

export const findEntrypoint = (files: Files) => {
  const validEntrypoints = [
    ['index.cjs'],
    ['index.js'],
    ['index.mjs'],
    ['index.mts'],
    ['index.ts'],
    ['server.cjs'],
    ['server.js'],
    ['server.mjs'],
    ['server.mts'],
    ['server.ts'],
    ['src', 'index.cjs'],
    ['src', 'index.js'],
    ['src', 'index.mjs'],
    ['src', 'index.mts'],
    ['src', 'index.ts'],
  ];

  const entrypoint = validEntrypoints.find(entrypointParts => {
    const path = entrypointParts.join(sep);
    return files[path] !== undefined;
  });

  if (!entrypoint) {
    throw new Error('No valid entrypoint found');
  }
  return entrypoint.join(sep);
};

function getPkg(workPath: string) {
  try {
    const pkgPath = path.join(workPath, 'package.json');
    const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }

  return null;
}

function getBuildCommand(pkg: PackageJson, config: Config) {
  if (config.buildCommand) {
    return config.buildCommand;
  }

  return pkg?.scripts?.build;
}

/**
 * A build command in project settings or package.json is technically supported, but
 * the node builder still needs to run on the entrypoint (src/index.ts, server.ts, etc.)
 * so if the build command compiles source code into a dist directory, we currently
 * wouldn't detect that.
 */
async function handleBuildCommand(entrypoint: string, args: BuildOptions) {
  const mountpoint = path.dirname(entrypoint);
  const entrypointDir = path.join(args.workPath, mountpoint);

  const pkg = getPkg(args.workPath);

  if (!pkg) {
    return;
  }

  const buildCommand = getBuildCommand(pkg, args.config);

  /**
   * Mostly copied from static builder
   * /vercel/packages/static-build/src/index.ts
   */
  const nodeVersion = await getNodeVersion(
    entrypointDir,
    undefined,
    args.config,
    args.meta
  );
  const spawnOpts = getSpawnOptions(args.meta || {}, nodeVersion);

  if (!spawnOpts.env) {
    spawnOpts.env = {};
  }

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
    projectCreatedAt: args.config.projectSettings?.createdAt,
  });

  if (typeof buildCommand === 'string') {
    await execCommand(buildCommand, {
      ...spawnOpts,

      // Yarn v2 PnP mode may be activated, so force
      // "node-modules" linker style
      env: {
        YARN_NODE_LINKER: 'node-modules',
        ...spawnOpts.env,
      },

      cwd: entrypointDir,
    });
  }
}
