import {
  isBunVersion,
  FileBlob,
  FileFsRef,
  type BuildOptions,
  type Files,
  type NodeVersion,
} from '@vercel/build-utils';
import { nodeFileTrace as nft } from '@vercel/nft';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { readFile as fsReadFile } from 'fs/promises';
import { join, relative } from 'path';
import { resolve as nftResolveDependency } from '@vercel/nft';

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
    resolve(id, parent, job, cjsResolve) {
      return nftResolveDependency(id, parent, job, cjsResolve);
    },
    async readFile(path) {
      const content = await fsReadFile(path).catch(() => null);
      if (!content) return content;

      const code = content.toString('utf8');

      // Transform rolldown's __require calls to regular require calls
      // so that node-file-trace can properly analyze them
      if (code.includes('__require(')) {
        const transformed = code.replace(/__require\(/g, 'require(');
        return Buffer.from(transformed, 'utf8');
      }

      return content;
    },
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
