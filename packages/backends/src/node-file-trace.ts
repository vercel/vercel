import {
  isBunVersion,
  FileBlob,
  FileFsRef,
  type BuildOptions,
  type Files,
  type NodeVersion,
  debug,
} from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join, relative } from 'path';

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
    base: outputDir,
    ignore: args.config.excludeFiles,
    conditions,
    mixedModules: true,
  });

  for (const warning of nftResult.warnings) {
    debug(`Warning from trace: ${warning.message}`);
  }

  const packageJsonPath = join(args.workPath, 'package.json');

  if (existsSync(packageJsonPath)) {
    const { mode } = lstatSync(packageJsonPath);
    const source = readFileSync(packageJsonPath);
    const relPath = relative(args.repoRootPath, packageJsonPath);
    files[relPath] = new FileBlob({ data: source, mode });
  }

  const isBundled = process.env.VERCEL_BUILDER_BUNDLE_NODE === '1';

  for (const file of nftResult.fileList) {
    // FIXME: We're losing the file structure when bundling, so we're just tracing the built files.
    // And the value of NFT traces is arguably lost at this point.
    if (isBundled) {
      const fullPath = join(outputDir, file);
      const stats = lstatSync(fullPath, {});
      files[relative(args.repoRootPath, fullPath)] = new FileFsRef({
        fsPath: fullPath,
        mode: stats.mode,
      });
    } else {
      const fullPath = join(args.repoRootPath, file);
      const stats = lstatSync(fullPath, {});
      files[file] = new FileFsRef({ fsPath: fullPath, mode: stats.mode });
    }
  }

  return { files };
};
