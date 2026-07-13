import { compileFunction } from 'vm';
import { cachedDataVersionTag } from 'v8';
import path from 'path';
import crc32 from 'buffer-crc32';
import {
  FileBlob,
  streamToBuffer,
  isSymbolicLink,
  debug,
} from '@vercel/build-utils';
import type { Files } from '@vercel/build-utils';

/**
 * Build-time generation of Node.js' built-in V8 compile cache
 * (`NODE_COMPILE_CACHE`). For every CommonJS file in the Lambda we produce the
 * V8 bytecode ahead of time and write it in the exact on-disk format Node's
 * loader expects, so the runtime deserializes the bytecode on cold start
 * instead of compiling from source.
 *
 * The format is reproduced from Node's `src/compile_cache.cc`:
 *   - Files live under `<NODE_COMPILE_CACHE>/<version>-<arch>-<tag>-<uid>/`.
 *   - Each cache file is named `crc32(<type byte> + <abs path>)` (hex).
 *   - Each file is a 20-byte header followed by the raw V8 cached data:
 *       [magic][codeSize][cacheSize][codeHash][cacheHash]
 *
 * A mismatch (different Node version, path, or uid at runtime) simply makes the
 * loader ignore the file and recompile — a safe no-op fallback.
 */

// `kCacheMagicNumber` from src/compile_cache.cc
const CACHE_MAGIC = 0x8adfdbb2;
// `CachedCodeType::kCommonJS`, hashed as a single byte in `GetCacheKey`.
const CJS_TYPE = 0;
// The CommonJS module wrapper parameters Node compiles each module with.
const CJS_PARAMS = ['exports', 'require', 'module', '__filename', '__dirname'];
// Directory (relative to the Lambda task root) holding the generated cache.
// NOTE: must NOT live under `.vercel/` — the CLI's `writeLambda` band-aid
// (packages/cli/src/util/build/write-build-result.ts) deletes the entire
// `.vercel` directory from a function's output unless it contains a `cache`
// child, which would silently drop this whole cache.
const CACHE_DIR = '.node-compile-cache';

export function isNodePrecompileEnabled(): boolean {
  return process.env.ENABLE_NODE_PRECOMPILE === '1';
}

function taskRoot(): string {
  return process.env.ENABLE_NODE_PRECOMPILE_TASK_ROOT || '/var/task';
}

/** Absolute path set as `NODE_COMPILE_CACHE` on the Lambda. */
export function nodePrecompileCacheDir(): string {
  return path.posix.join(taskRoot(), CACHE_DIR);
}

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

/**
 * The subdirectory tag Node appends under `NODE_COMPILE_CACHE`, computed from
 * the *build* process. It only matches at runtime when the Lambda runs the same
 * Node version/arch/uid, hence the `ENABLE_NODE_PRECOMPILE_UID` override.
 */
function cacheTag(): string {
  const tag =
    `${process.version}-${process.arch}-` +
    (cachedDataVersionTag() >>> 0).toString(16).padStart(8, '0');
  const uid =
    process.env.ENABLE_NODE_PRECOMPILE_UID ??
    (typeof process.getuid === 'function' ? String(process.getuid()) : '0');
  return `${tag}-${uid}`;
}

function cacheFileName(absPath: string): string {
  const key = crc32.unsigned(
    Buffer.concat([
      Buffer.from([CJS_TYPE]),
      Buffer.from(absPath, 'utf8'),
    ] as any)
  );
  return (key >>> 0).toString(16).padStart(8, '0');
}

export async function generateNodePrecompileFiles(
  files: Files
): Promise<Files> {
  const start = Date.now();
  const root = taskRoot();
  const tag = cacheTag();
  const out: Files = {};
  let count = 0;
  let totalBytes = 0;

  for (const fileName of Object.keys(files)) {
    if (!/\.c?js$/.test(fileName)) continue;

    const file = files[fileName];
    if (isSymbolicLink(file.mode)) continue;

    let source: Buffer;
    try {
      source = await streamToBuffer(file.toStream());
    } catch {
      continue;
    }

    // Files with a shebang are stripped differently by Node before V8 compiles
    // them, so a naive precompile is rejected at runtime — skip them.
    if (source[0] === 0x23 /* # */ && source[1] === 0x21 /* ! */) continue;

    const absPath = path.posix.join(root, fileName);

    let payload: Buffer;
    try {
      const compiled = compileFunction(source.toString('utf8'), CJS_PARAMS, {
        filename: absPath,
        produceCachedData: true,
      }) as { cachedData?: Buffer };
      if (!compiled.cachedData?.length) continue;
      payload = compiled.cachedData;
    } catch {
      // ESM masquerading as `.js`, syntax errors, etc.
      continue;
    }

    const header = Buffer.concat([
      u32(CACHE_MAGIC),
      u32(source.length),
      u32(payload.length),
      u32(crc32.unsigned(source)),
      u32(crc32.unsigned(payload)),
    ] as any);
    const cacheFile = Buffer.concat([header, payload] as any);

    out[`${CACHE_DIR}/${tag}/${cacheFileName(absPath)}`] = new FileBlob({
      data: cacheFile,
    });
    count++;
    totalBytes += cacheFile.length;
  }

  if (count === 0) return {};

  debug(
    `Node precompile: generated V8 compile cache for ${count} files ` +
      `(${totalBytes} bytes) in ${Date.now() - start}ms`
  );
  return out;
}
