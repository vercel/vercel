import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';
import { createGzip } from 'node:zlib';
import { streamToBufferChunks } from '@vercel/build-utils';
import tar from 'tar-fs';
import { hash, type FilesMap } from './hashes';
import type { ArchiveFormat } from '../types';

export async function createTgzFiles(
  workPath: string,
  fileList: string[],
  debug?: (message: string) => void,
  exclude?: string[]
): Promise<FilesMap> {
  return createArchiveFiles(workPath, fileList, 'tgz', debug, exclude);
}

/**
 * Create archive files for a given format (tgz or zstd).
 *
 * For tgz, pipes tar through gzip. For zstd, spawns the system `zstd` binary
 * directly — no shell, no npm dependency. Requires `zstd` to be installed on
 * PATH when using the zstd format.
 */
export async function createArchiveFiles(
  workPath: string,
  fileList: string[],
  archiveFormat: ArchiveFormat,
  debug?: (message: string) => void,
  exclude?: string[]
): Promise<FilesMap> {
  const filesToArchive = exclude
    ? fileList.filter(file => !exclude.includes(file))
    : fileList;

  const entries = filesToArchive.map(file => relative(workPath, file));

  if (archiveFormat === 'zstd') {
    return createZstdFiles(workPath, entries, debug);
  }

  // Default: tgz (tar + gzip)
  debug?.('Packing tarball');
  const tarStream = tar.pack(workPath, { entries }).pipe(createGzip());
  const chunkedTarBuffers = await streamToBufferChunks(tarStream);
  debug?.(`Packed tarball into ${chunkedTarBuffers.length} chunks`);
  return new Map(
    chunkedTarBuffers.map((chunk: Buffer, index: number) => [
      hash(chunk),
      {
        names: [join(workPath, `.vercel/source.tgz.part${index + 1}`)],
        data: chunk,
        mode: 0o666,
      },
    ])
  );
}

async function createZstdFiles(
  workPath: string,
  entries: string[],
  debug?: (message: string) => void
): Promise<FilesMap> {
  debug?.('Packing tarball with zstd');
  const tarStream = tar.pack(workPath, { entries });
  const child = spawn(
    'zstd',
    ['--compress', '--stdout', '--no-progress', '-3'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });

  const childExit = new Promise<void>((resolve, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'The `zstd` binary is not installed or not found on PATH. ' +
              'It is required for --compress zstd. Install it via your system ' +
              'package manager (e.g. `apt install zstd`, `brew install zstd`, ' +
              '`pacman -S zstd`, `choco install zstandard`, or ' +
              '`winget install Facebook.Zstandard`). Use --archive=tgz for a portable fallback.'
          )
        );
        return;
      }
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`zstd process was terminated with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim();
        reject(
          new Error(
            `zstd exited with code ${code}.${detail ? ` ${detail}` : ''}`
          )
        );
        return;
      }
      resolve();
    });
  });

  tarStream.on('error', err => {
    child.stdin.destroy(err);
  });
  tarStream.pipe(child.stdin);
  const [chunkedTarBuffers] = await Promise.all([
    streamToBufferChunks(child.stdout),
    childExit,
  ]);
  debug?.(`Packed tarball into ${chunkedTarBuffers.length} chunks`);
  return new Map(
    chunkedTarBuffers.map((chunk: Buffer, index: number) => [
      hash(chunk),
      {
        names: [join(workPath, `.vercel/source.tar.zst.part${index + 1}`)],
        data: chunk,
        mode: 0o666,
      },
    ])
  );
}
