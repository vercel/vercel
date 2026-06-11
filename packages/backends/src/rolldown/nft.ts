import type { BuildOptions, Files } from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
import { existsSync } from 'node:fs';
import { readFile, lstat, stat, readlink } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { isNativeError } from 'node:util/types';
import { FileFsRef, FileBlob, type Span } from '@vercel/build-utils';
import { transform } from 'oxc-transform';

export const nft = async (
  args: Pick<BuildOptions, 'workPath' | 'repoRootPath'> & {
    ignoreNodeModules: boolean;
    ignore?: string | string[] | undefined;
    localBuildFiles: Set<string>;
    files: Files;
    span: Span;
    conditions?: string[];
    traceFiles?: boolean;
  }
) => {
  const nftSpan = args.span.child('vc.builder.backends.nft');

  const runNft = async () => {
    const virtualFiles = new Map<string, string | Buffer>();
    if (args.traceFiles) {
      for (const [relPath, file] of Object.entries(args.files)) {
        if (!isJsLikeExtension(relPath) || file.type !== 'FileBlob') continue;

        virtualFiles.set(
          join(args.repoRootPath, relPath),
          typeof file.data === 'string'
            ? file.data
            : Buffer.from(new Uint8Array(file.data))
        );
      }
    }

    const ignorePatterns = [
      ...(args.ignoreNodeModules ? ['**/node_modules/**'] : []),
      ...(args.ignore
        ? Array.isArray(args.ignore)
          ? args.ignore
          : [args.ignore]
        : []),
    ];
    const traceRoots = [
      ...Array.from(args.localBuildFiles).filter(
        p => existsSync(p) || virtualFiles.has(p)
      ),
      ...virtualFiles.keys(),
    ];

    // Overriding these replaces nft's internal CachedFileSystem, so we only
    // override stat/readlink when there are virtual files to serve and memoize
    // every override (including ENOENT results) to keep nft's caching.
    const statOverride = memoize(async (fsPath: string) => {
      const virtual = virtualFiles.get(fsPath);
      if (virtual !== undefined) return createVirtualFileStat(virtual);

      try {
        return await stat(fsPath);
      } catch (error: unknown) {
        if (
          isNativeError(error) &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
          return null;
        }
        throw error;
      }
    });

    const readlinkOverride = memoize(async (fsPath: string) => {
      if (virtualFiles.has(fsPath)) return null;

      try {
        return await readlink(fsPath);
      } catch (error: unknown) {
        if (
          isNativeError(error) &&
          'code' in error &&
          (error.code === 'EINVAL' ||
            error.code === 'ENOENT' ||
            error.code === 'ENOTDIR')
        ) {
          return null;
        }
        throw error;
      }
    });

    // `readFile` is always overridden: nft can't parse TypeScript (we transform
    // it here) and it also serves virtual files.
    const readFileOverride = memoize(async (fsPath: string) => {
      const virtual = virtualFiles.get(fsPath);
      if (virtual !== undefined) return virtual;

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
    });

    const nftResult = await nodeFileTrace(traceRoots, {
      base: args.repoRootPath,
      processCwd: args.workPath,
      ts: true,
      mixedModules: true,
      moduleSyncCatchall: true,
      conditions: args.conditions,
      ignore: ignorePatterns.length > 0 ? ignorePatterns : undefined,
      readFile: readFileOverride,
      ...(virtualFiles.size > 0
        ? { stat: statOverride, readlink: readlinkOverride }
        : {}),
    });
    for (const file of nftResult.fileList) {
      const absolutePath = join(args.repoRootPath, file);
      if (virtualFiles.has(absolutePath)) continue;

      let stats;
      try {
        stats = await lstat(absolutePath);
      } catch (error: unknown) {
        if (
          isNativeError(error) &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          continue;
        }
        throw error;
      }
      // Lambda `files` map keys are always forward-slash separated,
      // regardless of the build host OS. NFT returns paths using the host
      // separator (backslashes on Windows), so normalize to POSIX.
      const outputPath = file.split(sep).join('/');

      if (args.localBuildFiles.has(join(args.repoRootPath, outputPath))) {
        continue;
      }

      if (stats.isSymbolicLink() || stats.isFile()) {
        if (args.ignoreNodeModules) {
          // Symlinks may point to directories — only read actual files
          const targetStats = stats.isSymbolicLink()
            ? await stat(absolutePath)
            : stats;
          if (targetStats.isFile()) {
            // Use FileBlob so introspection can include these files
            const content = await readFile(absolutePath, 'utf-8');
            args.files[outputPath] = new FileBlob({
              data: content,
              mode: stats.mode,
            });
          }
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

/** Memoizes an async fs lookup by path, caching negative/ENOENT results too. */
const memoize = <T>(fn: (path: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return (path: string): Promise<T> => {
    let cached = cache.get(path);
    if (cached === undefined) {
      cached = fn(path);
      cache.set(path, cached);
    }
    return cached;
  };
};

const JS_LIKE_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
  '.tsx',
  '.jsx',
  '.json',
  '.node',
]);

const isJsLikeExtension = (path: string) => {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return JS_LIKE_EXTENSIONS.has(path.slice(dot).toLowerCase());
};

const createVirtualFileStat = (data: string | Buffer) => {
  const now = new Date();
  return {
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0o100644,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: typeof data === 'string' ? Buffer.byteLength(data) : data.length,
    blksize: 4096,
    blocks: 1,
    atimeMs: now.getTime(),
    mtimeMs: now.getTime(),
    ctimeMs: now.getTime(),
    birthtimeMs: now.getTime(),
    atime: now,
    mtime: now,
    ctime: now,
    birthtime: now,
  };
};

const isTypeScriptFile = (fsPath: string) => {
  if (
    fsPath.endsWith('.d.ts') ||
    fsPath.endsWith('.d.mts') ||
    fsPath.endsWith('.d.cts')
  ) {
    return false;
  }
  return (
    fsPath.endsWith('.ts') ||
    fsPath.endsWith('.tsx') ||
    fsPath.endsWith('.mts') ||
    fsPath.endsWith('.cts')
  );
};
