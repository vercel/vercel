import { join, relative } from 'node:path';
import { createGzip } from 'node:zlib';
import fs from 'node:fs';
import { streamToBufferChunks } from '@vercel/build-utils';
import tar from 'tar-fs';
import { hash, normalizeSymlinkTarget, type FilesMap } from './hashes';

/**
 * tar-fs reads every symlink through `opts.fs.readlink` and writes the result
 * straight into the tarball, which for `--archive=tgz` *is* the upload payload
 * — it never passes through `hashes()`.
 *
 * tar-fs does normalize targets on Windows, but only by swapping separators and
 * rewriting `:` to `_`, so a junction's absolute target ships as `D_/repo/...`
 * and still dangles on the Linux runtime. Its `map` hook cannot fix that:
 * tar-fs overwrites `header.linkname` after `map` runs. Wrapping `readlink` is
 * the remaining seam, and it still has the deployment root in scope.
 */
function symlinkAwareFs(workPath: string): typeof fs {
  const patched = Object.create(fs) as typeof fs;
  patched.readlink = ((
    path: fs.PathLike,
    cb: (err: NodeJS.ErrnoException | null, linkString: string) => void
  ) => {
    fs.readlink(path, (err, link) => {
      if (err) {
        cb(err, link);
        return;
      }
      cb(null, normalizeSymlinkTarget(String(path), link, workPath));
    });
  }) as unknown as typeof fs.readlink;
  return patched;
}

export async function createTgzFiles(
  workPath: string,
  fileList: string[],
  debug?: (message: string) => void,
  exclude?: string[]
): Promise<FilesMap> {
  const filesToArchive = exclude
    ? fileList.filter(file => !exclude.includes(file))
    : fileList;
  debug?.('Packing tarball');
  // `fs` is honoured by tar-fs at runtime but missing from @types/tar-fs@1.16.
  const packOptions: tar.PackOptions & { fs?: typeof fs } = {
    entries: filesToArchive.map(file => relative(workPath, file)),
    fs: symlinkAwareFs(workPath),
  };
  const tarStream = tar.pack(workPath, packOptions).pipe(createGzip());
  const chunkedTarBuffers = await streamToBufferChunks(tarStream);
  debug?.(`Packed tarball into ${chunkedTarBuffers.length} chunks`);
  return new Map(
    chunkedTarBuffers.map((chunk, index) => [
      hash(chunk),
      {
        names: [join(workPath, `.vercel/source.tgz.part${index + 1}`)],
        data: chunk,
        mode: 0o666,
      },
    ])
  );
}
