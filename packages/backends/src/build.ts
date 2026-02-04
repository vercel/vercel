import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Files, glob, type BuildOptions } from '@vercel/build-utils';
import { findEntrypoint } from './find-entrypoint.js';
import {
  maybeExecBuildCommand,
  type downloadInstallAndBundle,
} from './utils.js';

export const maybeDoBuildCommand = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) => {
  const buildCommandResult = await maybeExecBuildCommand(args, downloadResult);
  const outputSetting = args.config.outputDirectory;

  let outputDir: string | undefined;
  let entrypoint: string | undefined;
  if (buildCommandResult && outputSetting) {
    const _outputDir = join(args.workPath, outputSetting);
    const _entrypoint = await findEntrypoint(_outputDir);
    outputDir = _outputDir;
    entrypoint = _entrypoint;
  }
  const commonOutputDirectories = ['dist', 'build', 'output'];
  if (buildCommandResult && !outputSetting) {
    for (const outputDirectory of commonOutputDirectories) {
      const _outputDir = join(args.workPath, outputDirectory);
      if (existsSync(_outputDir)) {
        const _entrypoint = await findEntrypoint(_outputDir);
        outputDir = _outputDir;
        entrypoint = _entrypoint;
      }
    }
  }
  const localBuildFiles = new Set<string>();
  let files: Files | undefined;
  if (outputDir && entrypoint) {
    files = await glob('**', outputDir);
    for (const file of Object.keys(files)) {
      localBuildFiles.add(join(outputDir, file));
    }
  }
  return { localBuildFiles, files, handler: entrypoint, outputDir };
};
