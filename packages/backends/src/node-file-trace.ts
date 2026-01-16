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
  const nftResult = await nft([entry], {
    base: args.repoRootPath,
    ignore: args.config.excludeFiles,
    conditions,
    mixedModules: true,
    readFile: async fsPath => {
      try {
        return await fs.readFile(fsPath);
      } catch (error) {
        // Return empty buffer for files that don't exist
        // Returning null causes NFT to throw "File does not exist" error
        // An empty buffer lets NFT continue processing, we'll resolve
        // the real location when building up the files object below
        return Buffer.from('');
      }
    },
  });

  for (const warning of nftResult.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

  for (const file of nftResult.fileList) {
    const fullPath = join(args.repoRootPath, file);
    try {
      const stats = lstatSync(fullPath, {});
      files[file] = new FileFsRef({ fsPath: fullPath, mode: stats.mode });
    } catch (error) {
      const relativePath = relative(outputDir, fullPath);
      const fallbackPath = join(args.repoRootPath, relativePath);

      debug(
        `Unabled to find traced file at ${fullPath}, using fallback path ${fallbackPath}`,
        fallbackPath
      );
      const stats = lstatSync(fallbackPath, {});
      files[file] = new FileFsRef({ fsPath: fallbackPath, mode: stats.mode });
    }
  }

  return { files };
};
