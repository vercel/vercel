import { relative, join } from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { isNativeError } from 'node:util/types';
import { FileFsRef, glob, debug, type Files } from '@vercel/build-utils';
import {
  nodeFileTrace as nft,
  resolve as nftResolveDependency,
} from '@vercel/nft';
import { transform } from 'oxc-transform';
import type { NodeFileTraceOptions } from './types.js';

export const nodeFileTrace = async (args: NodeFileTraceOptions) => {
  const { span } = args;
  const files: Files = {};
  const { tracedPaths } = args;

  // Rolldown builds source files into the outDir, node_modules are not included.
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
   * to tree shake node deps, and include any fs reads for files that are
   * not part of the traced paths or compiled source files.
   * Most of this is identical to the `@vercel/node` implementation
   */
  const runNft = () =>
    nft(Array.from(tracedPaths), {
      base: args.repoRootPath,
      processCwd: args.workPath,
      ts: true,
      mixedModules: true,
      async resolve(id, parent, job, cjsResolve) {
        return nftResolveDependency(id, parent, job, cjsResolve);
      },
      async readFile(fsPath) {
        try {
          let source: string | Buffer = await readFile(fsPath);

          // NFT doesn't support TypeScript, so we need to transform the source code.
          if (
            (fsPath.endsWith('.ts') && !fsPath.endsWith('.d.ts')) ||
            fsPath.endsWith('.tsx') ||
            fsPath.endsWith('.mts') ||
            fsPath.endsWith('.cts')
          ) {
            const transformResult = await transform(fsPath, source.toString());
            source = transformResult.code;
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

  const nftSpan = span?.child('vc.builder.backends.nft');
  const result = nftSpan ? await nftSpan.trace(runNft) : await runNft();

  // When running this against a built output (eg, the user-provided output directory the
  // traced paths are the same as the compiled source files), so keep them in the result.
  if (!args.keepTracedPaths) {
    // Don't include source files like `server.ts` in the result.
    for (const file of tracedPaths) {
      const relativeFile = relative(args.repoRootPath, file);
      result.fileList.delete(relativeFile);
    }
  }

  debug('NFT traced files count:', result.fileList.size);

  for (const file of result.fileList) {
    const absolutePath = join(args.repoRootPath, file);
    const stats = await lstat(absolutePath);
    const outputPath = file;

    if (stats.isSymbolicLink() || stats.isFile()) {
      files[outputPath] = new FileFsRef({
        fsPath: absolutePath,
        mode: stats.mode,
      });
    }
  }

  debug('Total files in context:', Object.keys(files).length);
  return files;
};
