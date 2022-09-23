import convertSourceMap from 'convert-source-map';
import path from 'path';
import type { Loader, Plugin } from 'esbuild';
import { fileToSource } from './sourcemapped';
import { replaceAssetImports } from './replace-asset-imports';

/**
 * An async storage.
 * This allows to abstract the way we read and resolve files:
 * * Standard file system
 * * In-memory file system
 * * ... or even S3-backed file system.
 */
export interface FileSystem {
  /**
   * Resolve a path from a given importer to the importee.
   * This can be used when implementing file systems that
   * do not have a real file system. For instance: this can resolve to a URL,
   * and let `readFile` handle the HTTP request.
   *
   * Returns `undefined` if the path cannot be resolved.
   */
  resolveImportPath(
    importer: string,
    importee: string
  ): Promise<string | undefined>;

  /**
   * Read a file from the given `path` and return its contents.
   */
  readFile(path: string): Promise<Buffer>;
}

/**
 * This function gets a file path
 * and returns a sorted array of all paths that can be resolved
 * using the Node.js resolution algorithm
 */
function resolvablePaths(importee: string): string[] {
  return [
    importee,
    `${importee}.js`,
    `${importee}.ts`,
    `${importee}.jsx`,
    `${importee}.tsx`,
    `${importee}/index.js`,
    `${importee}/index.ts`,
    `${importee}/index.jsx`,
    `${importee}/index.tsx`,
  ];
}

/**
 * Creates an ESBuild plugin that resolves all files
 * with the provided file system. This allows us to a memory-backed
 * file storage and traverse them without copying files to disk.
 */
export function createFileSystemPlugin(fileSystem: FileSystem): Plugin {
  return {
    name: 'vc:file-system',
    setup(b) {
      b.onResolve({ filter: /.+/ }, async args => {
        const [givenPath] = args.path.split('?', 1);
        const search = args.path.slice(givenPath.length + 1);
        const searchParams = new URLSearchParams(search);

        for (const resolvablePath of resolvablePaths(givenPath)) {
          const resolvedPath = await fileSystem.resolveImportPath(
            args.importer,
            resolvablePath
          );

          if (resolvedPath) {
            return {
              path: resolvedPath,
              namespace: FILE_SYSTEM_NAMESPACE,
              pluginData: { searchParams },
            };
          }
        }
      });

      b.onLoad(
        { filter: /.+/, namespace: FILE_SYSTEM_NAMESPACE },
        async args => {
          const buffer = await fileSystem.readFile(args.path);
          let fileSource = await fileToSource(buffer, args.path, args.path, {
            readFile: fileSystem.readFile,
          });
          const extension = path.extname(args.path);

          const loader = LOADERS_BY_EXTENSION[extension];
          if (loader) {
            fileSource = replaceAssetImports(fileSource);
          }

          const { map, source } = fileSource.sourceAndMap();
          const comment = !map
            ? ''
            : convertSourceMap.fromObject(map).toComment();

          return {
            contents: Buffer.concat([
              Buffer.from(source),
              Buffer.from(`\n${comment}`.trim()),
            ]),
            resolveDir: path.dirname(args.path),
            loader,
          };
        }
      );
    },
  };
}

export const FILE_SYSTEM_NAMESPACE = 'vc-file-system';

const LOADERS_BY_EXTENSION: Partial<Record<string, Loader>> = {
  '.js': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
};
