export const version = 2;
import { BuildOptions } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { build as cervelBuild, getBuildSummary } from '@vercel/cervel-beta';
import { join } from 'path';

export const doBuild = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) => {
  const result = await maybeExecBuildCommand(args, downloadResult);
  const outputSetting = args.config.outputDirectory;
  if (!outputSetting) {
    if (result) {
      console.warn(
        `Output directory not specified. Falling back to @vercel/express builder.`
      );
    }
    const buildResult = await cervelBuild({
      cwd: args.workPath,
      out: join('.vercel', 'node'),
    });
    const { handler } = await getBuildSummary(
      buildResult.rolldownResult.outputDir
    );
    return {
      dir: buildResult.rolldownResult.outputDir,
      handler,
    };
  }
  const outputDir = join(args.workPath, outputSetting);
  const { handler } = await getBuildSummary(outputDir);
  return {
    dir: outputDir,
    handler,
  };
};
