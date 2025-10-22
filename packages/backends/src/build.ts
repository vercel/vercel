export const version = 2;
import type { BuildOptions } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils.js';
import { build as cervelBuild, getBuildSummary } from '@vercel/cervel-beta';
import { join } from 'path';

const defaultOutputDirectory = join('.vercel', 'node');

export const doBuild = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) => {
  const buildCommandResult = await maybeExecBuildCommand(args, downloadResult);
  const outputSetting = args.config.outputDirectory;
  let tsPromise: Promise<void> | undefined;

  // If there's no output directory configured, we need to build ourselves
  if (!outputSetting) {
    const buildResult = await cervelBuild({
      cwd: args.workPath,
      out: defaultOutputDirectory,
    });
    tsPromise = buildResult.tsPromise;
    const { handler } = await getBuildSummary(
      buildResult.rolldownResult.outputDir
    );
    return {
      dir: buildResult.rolldownResult.outputDir,
      handler,
      tsPromise,
    };
  }

  // If there's an output directory configured but no build command result, build ourselves
  const outputDir = join(args.workPath, outputSetting);
  if (!buildCommandResult) {
    const buildResult = await cervelBuild({
      cwd: args.workPath,
      out: outputDir,
    });
    tsPromise = buildResult.tsPromise;
    const { handler } = await getBuildSummary(
      buildResult.rolldownResult.outputDir
    );
    return {
      dir: buildResult.rolldownResult.outputDir,
      handler,
      tsPromise,
    };
  }

  // Build command ran and output directory is configured, use the output
  const { handler } = await getBuildSummary(outputDir);
  return {
    dir: outputDir,
    handler,
    tsPromise,
  };
};
