import {
  isBunVersion,
  FileFsRef,
  type BuildOptions,
  type Files,
  type NodeVersion,
  debug,
} from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { lstatSync } from 'fs';
import { join, relative } from 'path';
import fs from 'fs/promises';

export const nodeFileTrace = async (
  args: BuildOptions,
  nodeVersion: NodeVersion,
  output: {
    dir: string;
    handler: string;
  }
) => {
  const { dir: outputDir, handler } = output;
  const entry = join(outputDir, handler);
  const files: Files = {};
  const isBun = isBunVersion(nodeVersion);
  const conditions = isBun ? ['bun'] : undefined;

  const replacedPaths = new Map<string, string>();

  const nftResult = await nft([entry], {
    base: args.repoRootPath,
    ignore: args.config.excludeFiles,
    conditions,
    mixedModules: true,
    readFile: async fsPath => {
      try {
        return await fs.readFile(fsPath);
      } catch (error) {
        const fallbackPath = join(
          args.repoRootPath,
          relative(outputDir, fsPath)
        );
        debug(
          `Unabled to find traced file at ${fsPath}, using fallback path ${fallbackPath}`
        );
        replacedPaths.set(fsPath, fallbackPath);
        return await fs.readFile(fallbackPath);
      }
    },
  });

  for (const warning of nftResult.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

  for (const file of nftResult.fileList) {
    const fullPath = join(args.repoRootPath, file);
    const fallbackPath = replacedPaths.get(fullPath);
    if (fallbackPath) {
      console.log({ fallbackPath, file });
    }
    const pathToResolve = fallbackPath ?? fullPath;
    try {
      const stats = lstatSync(pathToResolve, {});
      files[file] = new FileFsRef({ fsPath: pathToResolve, mode: stats.mode });
    } catch (e) {
      if (!fallbackPath) {
        debug(
          `Unabled to find traced file at ${fullPath}, using fallback path ${fallbackPath}`
        );
        debug(replacedPaths.toString());
      }
    }
  }

  return { files };
};
