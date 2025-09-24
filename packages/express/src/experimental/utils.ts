import { dirname, join } from 'path';
import {
  download,
  runNpmInstall,
  runPackageJsonScript,
  getNodeVersion,
  getSpawnOptions,
  execCommand,
  getEnvForPackageManager,
  scanParentDirs,
} from '@vercel/build-utils';
import type { BuildV2 } from '@vercel/build-utils';

export async function downloadInstallAndBundle(args: Parameters<BuildV2>[0]) {
  const { entrypoint, files, workPath, meta, config } = args;
  await download(files, workPath, meta);
  const entrypointFsDirname = join(workPath, dirname(entrypoint));
  const nodeVersion = await getNodeVersion(
    entrypointFsDirname,
    undefined,
    config,
    meta
  );
  const spawnOpts = getSpawnOptions(meta || {}, nodeVersion);

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
    await runNpmInstall(
      entrypointFsDirname,
      [],
      spawnOpts,
      meta,
      nodeVersion,
      config.projectSettings?.createdAt
    );
  }
  return { entrypointFsDirname, nodeVersion, spawnOpts };
}

export async function maybeExecBuildCommand(
  args: Parameters<BuildV2>[0],
  options: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) {
  const projectBuildCommand = args.config.projectSettings?.buildCommand;
  if (projectBuildCommand) {
    await execCommand(projectBuildCommand, {
      ...options.spawnOpts,
      cwd: args.workPath,
    });
  } else {
    // I don't think we actually want to support vercel-build or now-build because those are hacks for controlling api folder builds
    const possibleScripts = ['build'];

    await runPackageJsonScript(
      options.entrypointFsDirname,
      possibleScripts,
      options.spawnOpts,
      args.config.projectSettings?.createdAt
    );
  }
}
