import { relative, join } from 'node:path';
import {
  FileFsRef,
  glob,
  isSymbolicLink,
  type Files,
  type File,
  FileBlob,
  debug,
} from '@vercel/build-utils';
import {
  nodeFileTrace as nft,
  resolve as nftResolveDependency,
} from '@vercel/nft';
import { transform } from 'oxc-transform';
import { lstatSync, readFileSync } from 'node:fs';
import { isNativeError } from 'node:util/types';
import type { NodeFileTraceOptions } from './types.js';

export const nodeFileTrace = async (args: NodeFileTraceOptions) => {
  const files: Files = {};
  const { tracedPaths } = args;
  // For compiled output files: use paths directly from glob (top-level, no .vercel/node prefix)
  const compiledSourceFiles = await glob('**/*', {
    cwd: args.outDir,
    follow: true,
    includeDirectories: true,
  });
  for (const file of Object.keys(compiledSourceFiles)) {
    files[file] = compiledSourceFiles[file];
  }

  /**
   * While we're not using NFT to process source code, we are using it
   * to tree shake node deps, and include an fs reads for files that are
   * not part of the traced paths.
   */
  const result = await nft(Array.from(tracedPaths), {
    base: args.repoRootPath,
    processCwd: args.workPath,
    ts: true,
    mixedModules: true,
    async resolve(id, parent, job, cjsResolve) {
      return nftResolveDependency(id, parent, job, cjsResolve);
    },
    async readFile(fsPath) {
      try {
        let entry: File | undefined;
        let source: string | Buffer = readFileSync(fsPath);

        const { mode } = lstatSync(fsPath);
        if (isSymbolicLink(mode)) {
          entry = new FileFsRef({ fsPath, mode });
        }

        if (
          (fsPath.endsWith('.ts') && !fsPath.endsWith('.d.ts')) ||
          fsPath.endsWith('.tsx') ||
          fsPath.endsWith('.mts') ||
          fsPath.endsWith('.cts')
        ) {
          const result = await transform(fsPath, source.toString());
          source = result.code;
        }

        if (!entry) {
          entry = new FileBlob({ data: source, mode });
        }
        return source;
      } catch (error: unknown) {
        if (
          isNativeError(error) &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'EISDIR')
        ) {
          return null;
        }
        throw error;
      }
    },
  });

  if (!args.keepTracedPaths) {
    for (const file of tracedPaths) {
      const relativeFile = relative(args.repoRootPath, file);
      result.fileList.delete(relativeFile);
    }
  }

  // Process nft results - keep node_modules unchanged from filesystem
  const { lstat } = await import('node:fs/promises');

  debug('NFT traced files count:', result.fileList.size);

  for (const file of result.fileList) {
    const absolutePath = join(args.repoRootPath, file);
    try {
      const stats = await lstat(absolutePath);
      // Keep the file path exactly as it is in the filesystem (repo-relative)
      const outputPath = file;

      if (stats.isSymbolicLink() || stats.isFile()) {
        files[outputPath] = new FileFsRef({
          fsPath: absolutePath,
          mode: stats.mode,
        });
      }
      // Skip directories
    } catch (err) {
      debug(`Warning: Could not stat file ${absolutePath}:`, err);
    }
  }

  debug('Total files in context:', Object.keys(files).length);
  return files;
};
