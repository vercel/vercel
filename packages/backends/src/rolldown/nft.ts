import type { BuildOptions, Files } from '@vercel/build-utils';
import { nodeFileTrace } from '@vercel/nft';
import { existsSync } from 'node:fs';
import { readFile, lstat, stat, readlink } from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
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

    const traceRoots = [
      ...Array.from(args.localBuildFiles).filter(
        p => existsSync(p) || virtualFiles.has(p)
      ),
      ...virtualFiles.keys(),
    ];
    const traceBase = getCommonBase(args.repoRootPath, traceRoots);
    const ignorePatterns = getIgnorePatterns({
      ignoreNodeModules: args.ignoreNodeModules,
      ignore: args.ignore,
      traceBase,
      repoRootPath: args.repoRootPath,
    });

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
      base: traceBase,
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
      const absolutePath = join(traceBase, file);
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
      const normalizedFile = normalizePath(
        relative(args.repoRootPath, absolutePath)
      );
      const outputPath = stripParentSegments(normalizedFile);
      const escapesBase = outputPath !== normalizedFile;

      // Source files that Rolldown already bundled should not be copied into
      // the lambda, but node_modules entries can be added as trace roots to
      // seed NFT for runtime CJS shims and must remain in the output.
      if (
        args.localBuildFiles.has(join(args.repoRootPath, outputPath)) &&
        !isNodeModulesPath(outputPath)
      ) {
        continue;
      }

      if (stats.isSymbolicLink() || stats.isFile()) {
        if (stats.isSymbolicLink()) {
          const symlinkTarget = await readlink(absolutePath);
          const symlinkTargetPath = normalizePath(
            relative(
              args.repoRootPath,
              resolve(dirname(absolutePath), symlinkTarget)
            )
          );

          if (isParentPath(symlinkTargetPath)) {
            const outputTargetPath = stripParentSegments(symlinkTargetPath);
            args.files[outputPath] = new FileBlob({
              data: posix.relative(posix.dirname(outputPath), outputTargetPath),
              mode: stats.mode,
            });
            continue;
          }
        }

        if (args.ignoreNodeModules || escapesBase) {
          // Symlinks may point to directories — only read actual files
          const targetStats = stats.isSymbolicLink()
            ? await stat(absolutePath)
            : stats;
          if (targetStats.isFile()) {
            // Use FileBlob so introspection can include these files. Read as
            // a Buffer (no encoding) so the bytes are preserved verbatim,
            // mirroring the `@vercel/node` builder. Decoding to UTF-8 here
            // corrupts binary files (e.g. native `.node` addons, `.wasm`),
            // which later surfaces at runtime as errors such as
            // "ELF file's phentsize not the expected size".
            args.files[outputPath] = new FileBlob({
              data: await readFile(absolutePath),
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

const getCommonBase = (base: string, paths: string[]) => {
  let commonBase = base;
  for (const path of paths) {
    while (!isPathInside(commonBase, path)) {
      const parent = dirname(commonBase);
      if (parent === commonBase) break;
      commonBase = parent;
    }
  }
  return commonBase;
};

const isPathInside = (base: string, path: string) => {
  const relPath = relative(base, path);
  return (
    relPath === '' ||
    (!isParentPath(normalizePath(relPath)) && !isAbsolute(relPath))
  );
};

const normalizePath = (path: string) => path.split(sep).join('/');

const isParentPath = (path: string) => path === '..' || path.startsWith('../');

const isNodeModulesPath = (path: string) =>
  path.split('/').includes('node_modules');

const stripParentSegments = (path: string) => {
  const segments = path.split('/');
  let index = 0;
  while (segments[index] === '..') {
    index++;
  }
  return segments.slice(index).join('/');
};

const getIgnorePatterns = ({
  ignoreNodeModules,
  ignore,
  traceBase,
  repoRootPath,
}: {
  ignoreNodeModules: boolean;
  ignore?: string | string[] | undefined;
  traceBase: string;
  repoRootPath: string;
}) => {
  const patterns = [
    ...(ignoreNodeModules ? ['**/node_modules/**'] : []),
    ...(ignore ? (Array.isArray(ignore) ? ignore : [ignore]) : []),
  ];
  const repoRootRelativeToTraceBase = normalizePath(
    relative(traceBase, repoRootPath)
  );

  if (
    !repoRootRelativeToTraceBase ||
    isParentPath(repoRootRelativeToTraceBase)
  ) {
    return patterns;
  }

  const rebasedPatterns = patterns.map(pattern => {
    const isNegated = pattern.startsWith('!');
    const patternBody = isNegated ? pattern.slice(1) : pattern;
    const rebased = posix.join(repoRootRelativeToTraceBase, patternBody);
    return isNegated ? `!${rebased}` : rebased;
  });

  return [...patterns, ...rebasedPatterns];
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
