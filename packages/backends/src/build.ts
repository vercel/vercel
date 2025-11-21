import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildOptions } from '@vercel/build-utils';
import {
  build as cervelBuild,
  findEntrypoint,
  getBuildSummary,
} from '@vercel/cervel';
import {
  maybeExecBuildCommand,
  type downloadInstallAndBundle,
} from './utils.js';

export const version = 2;

const defaultOutputDirectory = join('.vercel', 'node');

export const doBuild = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) => {
  const buildCommandResult = await maybeExecBuildCommand(args, downloadResult);
  const outputSetting = args.config.outputDirectory;
  const buildCommand = args.config.projectSettings?.buildCommand;
  let tsPromise: Promise<void> | undefined;

  // If a build command ran but no output directory was configured, that's an error
  // Exception: if the build command is a cervel command, it handles output internally
  const isCervelCommand = buildCommand?.trim().startsWith('cervel');
  // if (buildCommandResult && !outputSetting && !isCervelCommand) {
  //   throw new Error(
  //     'Build command ran successfully, but no "outputDirectory" was configured. ' +
  //       'Please specify where your build outputs files by setting "outputDirectory" in your vercel.json.'
  //   );
  // }

  // If there's no output directory configured
  if (!outputSetting) {
    // If cervel was run as build command, use its default output location
    if (isCervelCommand) {
      // Cervel defaults to outputting to a `dist` directory
      const cervelOutputDir = join(args.workPath, 'dist');
      const cervelJsonPath = join(cervelOutputDir, '.cervel.json');

      if (existsSync(cervelJsonPath)) {
        const { handler } = await getBuildSummary(cervelOutputDir);
        return {
          dir: cervelOutputDir,
          handler,
          tsPromise,
        };
      }

      // Cervel command ran but didn't produce expected output
      throw new Error(
        `Build command "${buildCommand}" completed, but no output was found at ${cervelOutputDir}. ` +
          'Make sure your cervel command is configured correctly.'
      );
    }

    // Check if a `dist` directory exists (common build output convention)
    const distDir = join(args.workPath, 'dist');
    if (existsSync(distDir)) {
      const cervelJsonPath = join(distDir, '.cervel.json');

      // If .cervel.json exists, use it
      if (existsSync(cervelJsonPath)) {
        const { handler } = await getBuildSummary(distDir);
        return {
          dir: distDir,
          handler,
          tsPromise,
        };
      }

      // Otherwise, detect entrypoint in dist directory
      let handler: string;
      try {
        handler = await findEntrypoint(distDir);
      } catch (error) {
        handler = await findEntrypoint(distDir, { ignoreRegex: true });
      }

      await writeFile(cervelJsonPath, JSON.stringify({ handler }, null, 2));

      return {
        dir: distDir,
        handler,
        tsPromise,
      };
    }

    // Otherwise, we need to build ourselves
    const buildResult = await cervelBuild({
      cwd: args.workPath,
      out: defaultOutputDirectory,
    });
    tsPromise = buildResult.tsPromise ?? undefined;
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
    tsPromise = buildResult.tsPromise ?? undefined;
    const { handler } = await getBuildSummary(
      buildResult.rolldownResult.outputDir
    );
    return {
      dir: buildResult.rolldownResult.outputDir,
      handler,
      tsPromise,
    };
  }

  // Build command ran and output directory is configured
  // Check if .cervel.json exists (meaning cervel already processed it)
  const cervelJsonPath = join(outputDir, '.cervel.json');
  if (existsSync(cervelJsonPath)) {
    const { handler } = await getBuildSummary(outputDir);
    return {
      dir: outputDir,
      handler,
      tsPromise,
    };
  }

  // User's build command ran, detect the entrypoint in their output
  let handler: string;
  try {
    // First try to find entrypoint with framework regex check
    handler = await findEntrypoint(outputDir);
  } catch (error) {
    // Fallback: find any matching filename without regex check
    handler = await findEntrypoint(outputDir, { ignoreRegex: true });
  }

  // Write the build summary for consistency
  await writeFile(cervelJsonPath, JSON.stringify({ handler }, null, 2));

  return {
    dir: outputDir,
    handler,
    tsPromise,
  };
};
