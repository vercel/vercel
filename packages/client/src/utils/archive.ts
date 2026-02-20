import { join, relative } from 'node:path';
import { createGzip } from 'node:zlib';
import { streamToBufferChunks } from '@vercel/build-utils';
import tar from 'tar-fs';
import { hash, type FilesMap } from './hashes';

export async function createTgzFiles(
  workPath: string,
  fileList: string[],
  debug?: (message: string) => void
): Promise<FilesMap> {
  debug?.('Packing tarball');
  const tarStream = tar
    .pack(workPath, {
      entries: fileList.map(file => relative(workPath, file)),
    })
    .pipe(createGzip());
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
