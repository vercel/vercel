import path from 'path';
import debug from '../debug';
import FileFsRef from '../file-fs-ref';
import { File, Files, Meta } from '../types';
import { remove, mkdirp, readlink, symlink } from 'fs-extra';
import streamToBuffer from './stream-to-buffer';

export interface DownloadedFiles {
  [filePath: string]: FileFsRef;
}

const S_IFMT = 61440; /* 0170000 type of file */
const S_IFLNK = 40960; /* 0120000 symbolic link */

export function isSymbolicLink(mode: number): boolean {
  return (mode & S_IFMT) === S_IFLNK;
}

async function prepareSymlinkTarget(
  file: File,
  fsPath: string
): Promise<string> {
  const mkdirPromise = mkdirp(path.dirname(fsPath));
  if (file.type === 'FileFsRef') {
    const [target] = await Promise.all([readlink(file.fsPath), mkdirPromise]);
    return target;
  }

  if (file.type === 'FileRef' || file.type === 'FileBlob') {
    const targetPathBufferPromise = await streamToBuffer(
      await file.toStreamAsync()
    );
    const [targetPathBuffer] = await Promise.all([
      targetPathBufferPromise,
      mkdirPromise,
    ]);
    return targetPathBuffer.toString('utf8');
  }

  throw new Error(
    `file.type "${(file as any).type}" not supported for symlink`
  );
}

async function downloadFile(file: File, fsPath: string): Promise<FileFsRef> {
  const { mode } = file;

  if (isSymbolicLink(mode)) {
    const target = await prepareSymlinkTarget(file, fsPath);
    console.log('Found symlink', { target, fsPath });

    try {
      await symlink(target, fsPath);
    } catch (error: any) {
      if (error?.code === 'EEXIST') {
        const fsLink = await readlink(fsPath).catch((err: Error) => err);
        console.log('Symlink already exists', { target, fsPath, fsLink });
      } else {
        throw error;
      }
    }

    return FileFsRef.fromFsPath({ mode, fsPath });
  } else {
    console.log('Found file', { fsPath });
  }

  const stream = file.toStream();
  return FileFsRef.fromStream({ mode, stream, fsPath });
}

async function removeFile(basePath: string, fileMatched: string) {
  const file = path.join(basePath, fileMatched);
  await remove(file);
}

export default async function download(
  files: Files,
  basePath: string,
  meta?: Meta
): Promise<DownloadedFiles> {
  const {
    isDev = false,
    skipDownload = false,
    filesChanged = null,
    filesRemoved = null,
  } = meta || {};

  if (isDev || skipDownload) {
    // In `vercel dev`, the `download()` function is a no-op because
    // the `basePath` matches the `cwd` of the dev server, so the
    // source files are already available.
    return files as DownloadedFiles;
  }
  debug('Downloading deployment source files to ', basePath);

  const start = Date.now();
  const files2: DownloadedFiles = {};
  const entries = Object.entries(files);

  await Promise.all(
    entries.map(async ([name, file]) => {
      // If the file does not exist anymore, remove it.
      if (Array.isArray(filesRemoved) && filesRemoved.includes(name)) {
        await removeFile(basePath, name);
        return;
      }

      // If a file didn't change, do not re-download it.
      if (Array.isArray(filesChanged) && !filesChanged.includes(name)) {
        return;
      }

      const fsPath = path.join(basePath, name);

      files2[name] = await downloadFile(file, fsPath);
    })
  );

  const duration = Date.now() - start;
  debug(`Downloaded ${entries.length} source files: ${duration}ms`);

  return files2;
}
