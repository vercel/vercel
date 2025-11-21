import {
  isBunVersion,
  BuildOptions,
  FileBlob,
  FileFsRef,
  Files,
} from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { type downloadInstallAndBundle } from './utils.js';

export const nodeFileTrace = async (
  args: BuildOptions,
  downloadResult: Awaited<ReturnType<typeof downloadInstallAndBundle>>,
  output: {
    dir: string;
    handler: string;
  }
) => {
  const { dir: outputDir, handler } = output;
  const entry = join(outputDir, handler);
  const files: Files = {};
  const isBun = isBunVersion(downloadResult.nodeVersion);
  const conditions = isBun ? ['bun'] : undefined;
  const nftResult = await nft([entry], {
    base: args.repoRootPath,
    ignore: args.config.excludeFiles,
    conditions,
    mixedModules: true,
  });

  const packageJsonPath = join(args.workPath, 'package.json');

  if (existsSync(packageJsonPath)) {
    const { mode } = lstatSync(packageJsonPath);
    const source = readFileSync(packageJsonPath);
    const relPath = relative(args.repoRootPath, packageJsonPath);
    files[relPath] = new FileBlob({ data: source, mode });
  }

  for (const file of nftResult.fileList) {
    const fullPath = join(args.repoRootPath, file);
    const stats = lstatSync(fullPath, {});
    files[file] = new FileFsRef({ fsPath: fullPath, mode: stats.mode });
  }

  return { files };
};
