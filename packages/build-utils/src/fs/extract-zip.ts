import { createWriteStream, promises as fs } from 'fs';
import { dirname, isAbsolute, normalize, resolve, sep } from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import yauzl from 'yauzl-promise';
import { NowBuildError } from '../errors';

const streamPipeline = promisify(pipeline);

// DOS external file attribute codes — the high 16 bits of `externalFileAttributes`
// encode the POSIX mode when created on a Unix system. These are the flags we
// care about to refuse symlink entries.
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export interface ExtractZipOptions {
  /**
   * Number of leading path components to strip from each entry (matches
   * `tar --strip-components=N`). Useful for archives where every entry is
   * nested under a single top-level directory.
   */
  strip?: number;
  /**
   * Override the detection of symlink-mode entries. Defaults to rejecting any
   * entry whose POSIX mode indicates a symlink (`S_IFLNK`).
   */
  allowSymlinks?: boolean;
}

/**
 * Safely extracts a zip archive at `zipPath` into `destDir`.
 *
 * - Rejects any entry whose resolved destination path escapes `destDir`
 *   (zip-slip protection).
 * - Rejects entries containing NUL bytes in file names.
 * - Rejects symlink entries by default (set `allowSymlinks: true` to permit).
 * - Creates intermediate directories as needed.
 *
 * The archive is read from disk via {@link yauzl.open}; callers are expected
 * to have fully persisted the file before invoking this function (e.g. via
 * {@link VerifiedDownloader}).
 */
export async function extractZip(
  zipPath: string,
  destDir: string,
  options: ExtractZipOptions = {}
): Promise<void> {
  const { strip = 0, allowSymlinks = false } = options;

  if (!Number.isInteger(strip) || strip < 0) {
    throw new NowBuildError({
      code: 'EXTRACT_ZIP_INVALID_STRIP',
      message: 'extractZip: `strip` must be a non-negative integer.',
    });
  }

  const destAbsolute = resolve(destDir);
  await fs.mkdir(destAbsolute, { recursive: true });
  const destPrefix = destAbsolute.endsWith(sep)
    ? destAbsolute
    : destAbsolute + sep;

  const zip = await yauzl.open(zipPath);
  try {
    let entry;
    try {
      entry = await zip.readEntry();
    } catch (err) {
      throw wrapZipError(err);
    }
    while (entry) {
      const entryName = entry.fileName;

      if (entryName.includes('\0')) {
        throw new NowBuildError({
          code: 'EXTRACT_ZIP_INVALID_ENTRY',
          message: `Refusing to extract zip entry with NUL byte in name: ${JSON.stringify(entryName)}`,
        });
      }

      // Normalize path separators; zip entries always use forward slashes.
      const normalized = normalize(entryName.replace(/\\/g, '/'));

      // Strip leading components if requested.
      const segments = normalized.split(/[\\/]/).filter(s => s.length > 0);
      if (segments.length <= strip) {
        // Entry is the stripped-away parent directory itself — skip it.
        entry = await zip.readEntry();
        continue;
      }
      const stripped = segments.slice(strip).join('/');

      if (isAbsolute(stripped) || stripped.startsWith('..')) {
        throw new NowBuildError({
          code: 'EXTRACT_ZIP_TRAVERSAL',
          message: `Refusing to extract zip entry that escapes destination: ${entryName}`,
        });
      }

      const resolvedDest = resolve(destAbsolute, stripped);
      if (
        resolvedDest !== destAbsolute &&
        !resolvedDest.startsWith(destPrefix)
      ) {
        throw new NowBuildError({
          code: 'EXTRACT_ZIP_TRAVERSAL',
          message: `Refusing to extract zip entry that escapes destination: ${entryName}`,
        });
      }

      // Detect symlinks via the POSIX mode bits in the external file attrs
      // (upper 16 bits). Also treat a trailing slash on the original name as
      // a directory (matching zip convention).
      const externalAttrs = (
        entry as unknown as {
          externalFileAttributes: number;
        }
      ).externalFileAttributes;
      const posixMode =
        typeof externalAttrs === 'number' ? (externalAttrs >>> 16) & 0xffff : 0;
      const isSymlink = (posixMode & S_IFMT) === S_IFLNK;
      const isDirectory = /\/$/.test(entryName);

      if (isSymlink && !allowSymlinks) {
        throw new NowBuildError({
          code: 'EXTRACT_ZIP_SYMLINK',
          message: `Refusing to extract symlink zip entry: ${entryName}`,
        });
      }

      if (isDirectory) {
        await fs.mkdir(resolvedDest, { recursive: true });
      } else {
        await fs.mkdir(dirname(resolvedDest), { recursive: true });
        const entryStream = await entry.openReadStream();
        await streamPipeline(entryStream, createWriteStream(resolvedDest));
      }

      try {
        entry = await zip.readEntry();
      } catch (err) {
        throw wrapZipError(err);
      }
    }
  } finally {
    try {
      await zip.close();
    } catch {
      // ignore
    }
  }
}

function wrapZipError(err: unknown): NowBuildError {
  const message =
    err instanceof Error ? err.message : 'Unknown zip extraction error';
  if (/invalid relative path|invalid file name|\.\./i.test(message)) {
    return new NowBuildError({
      code: 'EXTRACT_ZIP_TRAVERSAL',
      message: `Refusing to extract zip entry that escapes destination: ${message}`,
    });
  }
  return new NowBuildError({
    code: 'EXTRACT_ZIP_READ_ERROR',
    message: `Failed to read zip entry: ${message}`,
  });
}
