import type { BuildOptions, Files } from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { isNativeError } from 'node:util/types';
import { FileFsRef, FileBlob, type Span } from '@vercel/build-utils';
import { transform } from 'oxc-transform';

export const nft = async (
  args: Pick<BuildOptions, 'workPath' | 'repoRootPath'> & {
    ignoreNodeModules: boolean;
    localBuildFiles: Set<string>;
    files: Files;
    span: Span;
    conditions?: string[];
  }
) => {
  const nftSpan = args.span.child('vc.builder.backends.nft');

  const runNft = async () => {
    const nftResult = await nodeFileTrace(Array.from(args.localBuildFiles), {
      base: args.repoRootPath,
      processCwd: args.workPath,
      ts: true,
      mixedModules: true,
      conditions: args.conditions,
      ignore: args.ignoreNodeModules
        ? path => path.includes('node_modules')
        : undefined,
      async readFile(fsPath) {
        try {
          let source: string | Buffer = await readFile(fsPath);

          // NFT doesn't support TypeScript, so we need to transform the source code.
          if (isTypeScriptFile(fsPath)) {
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
    for (const file of nftResult.fileList) {
      const absolutePath = join(args.repoRootPath, file);
      const stats = await lstat(absolutePath);
      const outputPath = file;

      if (args.localBuildFiles.has(join(args.repoRootPath, outputPath))) {
        continue;
      }

      if (stats.isSymbolicLink() || stats.isFile()) {
        if (args.ignoreNodeModules) {
          // Use FileBlob so introspection can include these files
          const content = await readFile(absolutePath, 'utf-8');
          args.files[outputPath] = new FileBlob({
            data: content,
            mode: stats.mode,
          });
        } else {
          args.files[outputPath] = new FileFsRef({
            fsPath: absolutePath,
            mode: stats.mode,
          });
        }
      }
    }
  };

  await nftSpan.trace(runNft);
};
const isTypeScriptFile = (fsPath: string) => {
  return (
    fsPath.endsWith('.ts') ||
    fsPath.endsWith('.tsx') ||
    fsPath.endsWith('.mts') ||
    fsPath.endsWith('.cts')
  );
};
