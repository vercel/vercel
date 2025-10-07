import {
  BuildOptions,
  FileBlob,
  FileFsRef,
  Files,
  PackageJson,
} from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join, relative } from 'path';

export const nodeFileTrace = async (
  args: BuildOptions,
  rolldownResult: {
    files: Files;
    pkg: PackageJson;
    outputDir: string;
    handler: string;
  }
) => {
  const { outputDir, handler } = rolldownResult;
  const files: Files = {};
  const baseDir = args.repoRootPath || args.workPath;
  const relativeOutputDir = relative(baseDir, outputDir);
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
    const relPath = relative(baseDir, packageJsonPath);
    files[relPath] = new FileBlob({ data: source, mode });
  }

  for (const file of nftResult.fileList) {
    if (file.startsWith(relativeOutputDir)) {
      const stats = lstatSync(file);
      const relPath = relative(outputDir, file);
      files[relPath] = new FileFsRef({
        fsPath: file,
        mode: stats.mode,
      });
    } else {
      const stats = lstatSync(file);
      files[file] = new FileFsRef({ fsPath: file, mode: stats.mode });
    }
  }
  return { files };
};
