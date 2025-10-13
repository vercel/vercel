import { BuildOptions, FileBlob, FileFsRef, Files } from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join, relative } from 'path';

export const nodeFileTrace = async (
  args: BuildOptions,
  output: {
    dir: string;
    handler: string;
  }
) => {
  const { dir: outputDir, handler } = output;
  const files: Files = {};
  const nftResult = await nft([join(outputDir, handler)], {
    // This didn't work as I expected it to, didn't find node_modules
    // base: outputDir,
    // processCwd: outputDir,
    ignore: args.config.excludeFiles,
  });

  const packageJsonPath = join(args.workPath, 'package.json');

  if (existsSync(packageJsonPath)) {
    const { mode } = lstatSync(packageJsonPath);
    const source = readFileSync(packageJsonPath);
    const relPath = relative(args.repoRootPath, packageJsonPath);
    files[relPath] = new FileBlob({ data: source, mode });
  }

  for (const file of nftResult.fileList) {
    const stats = lstatSync(file);
    files[file] = new FileFsRef({ fsPath: file, mode: stats.mode });
  }

  return { files };
};
