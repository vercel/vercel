import path from 'path';
import FileFsRef from '../file-fs-ref';
import { File, Files } from '../types';
import { mkdirp, readlink, symlink } from 'fs-extra';

export interface DownloadedFiles {
  [filePath: string]: FileFsRef
}

const S_IFMT = 61440;   /* 0170000 type of file */
const S_IFLNK = 40960;  /* 0120000 symbolic link */

export function isSymbolicLink(mode: number): boolean {
  return (mode & S_IFMT) === S_IFLNK;
}

async function downloadFile(file: File, fsPath: string): Promise<FileFsRef> {
  const { mode } = file;
  if (mode && isSymbolicLink(mode) && file.type === 'FileFsRef') {
    const [ target ] = await Promise.all([
      readlink((file as FileFsRef).fsPath),
      mkdirp(path.dirname(fsPath))
    ]);
    await symlink(target, fsPath);
    return FileFsRef.fromFsPath({ mode, fsPath });
  } else {
    const stream = file.toStream();
    return FileFsRef.fromStream({ mode, stream, fsPath });
  }
}

export default async function download(files: Files, basePath: string): Promise<DownloadedFiles> {
  const files2: DownloadedFiles = {};

  await Promise.all(
    Object.keys(files).map(async (name) => {
      const file = files[name];
      const fsPath = path.join(basePath, name);
      files2[name] = await downloadFile(file, fsPath);
    }),
  );

  return files2;
}
