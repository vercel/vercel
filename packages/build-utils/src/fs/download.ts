import path from 'path';
import debug from '../debug';
import FileFsRef from '../file-fs-ref';
import { File, Files, Meta } from '../types';
import { remove, mkdirp, readlink, symlink, chmod } from 'fs-extra';
import streamToBuffer from './stream-to-buffer';

export interface DownloadedFiles {
  [filePath: string]: FileFsRef;
}

const S_IFDIR = 16384; /* 0040000 directory */
const S_IFLNK = 40960; /* 0120000 symbolic link */
const S_IFMT = 61440; /* 0170000 type of file */

export function isDirectory(mode: number): boolean {
  return (mode & S_IFMT) === S_IFDIR;
}

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
    const targetPathBufferPromise = streamToBuffer(await file.toStreamAsync());
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

export async function downloadFile(
  file: File | FileFsRef,
  fsPath: string
): Promise<FileFsRef> {
  const { mode } = file;

  if (isDirectory(mode)) {
    await mkdirp(fsPath);
    await chmod(fsPath, mode);
    return FileFsRef.fromFsPath({ mode, fsPath });
  }

  // If the source is a symlink, try to create it instead of copying the file.
  // Note: creating symlinks on Windows requires admin priviliges or symlinks
  // enabled in the group policy. We may want to improve the error message.
  if (isSymbolicLink(mode)) {
    const target = await prepareSymlinkTarget(file, fsPath);

    await symlink(target, fsPath);
    return FileFsRef.fromFsPath({ mode, fsPath });
  }

  const stream = file instanceof FileFsRef ? await file.toStreamAsync() : file.toStream();
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
  debug('Downloading deployment source files...');

  const start = Date.now();
  const files2: DownloadedFiles = {};
  const filenames = Object.keys(files);

  await Promise.all(
    filenames.map(async name => {
      // If the file does not exist anymore, remove it.
      if (Array.isArray(filesRemoved) && filesRemoved.includes(name)) {
        await removeFile(basePath, name);
        return;
      }
      // If a file didn't change, do not re-download it.
      if (Array.isArray(filesChanged) && !filesChanged.includes(name)) {
        return;
      }

      // Some builders resolve symlinks and return both
      // a file, node_modules/<symlink>/package.json, and
      // node_modules/<symlink>, a symlink.
      // Removing the file matches how the yazl lambda zip
      // behaves so we can use download() with `vercel build`.
      const parts = name.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        const parent = files[dir];
        if (parent && isSymbolicLink(parent.mode)) {
          console.warn(
            `Warning: file "${name}" is within a symlinked directory "${dir}" and will be ignored`
          );
          return;
        }
      }

      const file = files[name];
      const fsPath = path.join(basePath, name);

      files2[name] = await downloadFile(file, fsPath);
    })
  );

  const duration = Date.now() - start;
  debug(`Downloaded ${filenames.length} source files: ${duration}ms`);

  return files2;
}
