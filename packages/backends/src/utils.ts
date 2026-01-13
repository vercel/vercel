import { delimiter } from 'path';
import { dirname, join } from 'path';
import {
  download,
  runNpmInstall,
  runPackageJsonScript,
  execCommand,
  getEnvForPackageManager,
  scanParentDirs,
  getNodeBinPaths,
} from '@vercel/build-utils';
import type { BuildV2 } from '@vercel/build-utils';

export async function downloadInstallAndBundle(
  args: Parameters<BuildV2>[0]
): Promise<{
  spawnEnv: {
    [x: string]: string | undefined;
  };
  entrypointFsDirname: string;
}> {
  const { entrypoint, files, workPath, meta, config, repoRootPath } = args;
  await download(files, workPath, meta);

  const entrypointFsDirname = join(workPath, dirname(entrypoint));

  const {
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    turboSupportsCorepackHome,
  } = await scanParentDirs(entrypointFsDirname, true, repoRootPath);

  const spawnEnv = getEnvForPackageManager({
    cliType,
    lockfileVersion,
    packageJsonPackageManager,
    env: process.env,
    turboSupportsCorepackHome,
    projectCreatedAt: config.projectSettings?.createdAt,
  });

  const installCommand = config.projectSettings?.installCommand;
  if (typeof installCommand === 'string') {
    if (installCommand.trim()) {
      console.log(`Running "install" command: \`${installCommand}\`...`);
      await execCommand(installCommand, {
        env: spawnEnv,
        cwd: entrypointFsDirname,
      });
    } else {
      console.log(`Skipping "install" command...`);
    }
  } else {
    await runNpmInstall(
      entrypointFsDirname,
      [],
      {
        env: spawnEnv,
      },
      meta,
      config.projectSettings?.createdAt
    );
  }
  return { entrypointFsDirname, spawnEnv };
}

export async function maybeExecBuildCommand(
  args: Parameters<BuildV2>[0],
  {
    spawnEnv,
    entrypointFsDirname,
  }: {
    spawnEnv: {
      [x: string]: string | undefined;
    };
    entrypointFsDirname: string;
  }
) {
  const projectBuildCommand = args.config.projectSettings?.buildCommand;
  if (projectBuildCommand) {
    // Add node_modules/.bin to PATH so commands like 'cervel' can be found
    const repoRoot = args.repoRootPath || args.workPath;
    const nodeBinPaths = getNodeBinPaths({
      base: repoRoot,
      start: args.workPath,
    });
    const nodeBinPath = nodeBinPaths.join(delimiter);
    const env = {
      ...spawnEnv,
      PATH: `${nodeBinPath}${delimiter}${spawnEnv?.PATH || process.env.PATH}`,
    };

    return execCommand(projectBuildCommand, {
      env,
      cwd: args.workPath,
    });
  }

  // I don't think we actually want to support vercel-build or now-build because those are hacks for controlling api folder builds
  const possibleScripts = ['build'];

  return runPackageJsonScript(
    entrypointFsDirname,
    possibleScripts,
    spawnEnv,
    args.config.projectSettings?.createdAt
  );
}
