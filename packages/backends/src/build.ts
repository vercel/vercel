import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Files, glob, type BuildOptions } from '@vercel/build-utils';
import { findEntrypoint } from './find-entrypoint.js';
import {
  maybeExecBuildCommand,
  type downloadInstallAndBundle,
} from './utils.js';

/**
 * `outputDirectory` is usually the same project setting the static builder uses
 * (Vite/Webpack/etc. client output). We only reuse it for the Node lambda when we
 * find a known server entry file under that folder; otherwise we bundle from
 * source with rolldown. Errors here are swallowed so static-only output trees do
 * not fail the build.
 */
async function findEntrypointInOutputDir(
  dir: string
): Promise<string | undefined> {
  try {
    return await findEntrypoint(dir);
  } catch {
    return undefined;
  }
}

export const maybeDoBuildCommand = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>
) => {
  const buildCommandResult = await maybeExecBuildCommand(args, downloadResult);
  const outputSetting = args.config.outputDirectory;

  let outputDir: string | undefined;
  let entrypoint: string | undefined;
  if (buildCommandResult && outputSetting) {
    if (outputSetting) {
      const _outputDir = join(args.workPath, outputSetting);
      const _entrypoint = await findEntrypointInOutputDir(_outputDir);
      if (_entrypoint) {
        outputDir = _outputDir;
        entrypoint = _entrypoint;
      }
    } else {
      const commonOutputDirectories = ['dist', 'build', 'output'];
      for (const outputDirectory of commonOutputDirectories) {
        const _outputDir = join(args.workPath, outputDirectory);
        if (existsSync(_outputDir)) {
          const _entrypoint = await findEntrypointInOutputDir(_outputDir);
          if (_entrypoint) {
            outputDir = _outputDir;
            entrypoint = _entrypoint;
            break;
          }
        }
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
