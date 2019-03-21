import path from 'path';
import FileFsRef from '../file-fs-ref';
import { File, Files } from '../types';

export interface DownloadedFiles {
  [filePath: string]: FileFsRef
}

async function downloadFile(file: File, fsPath: string): Promise<FileFsRef> {
  const { mode } = file;
  const stream = file.toStream();
  return FileFsRef.fromStream({ mode, stream, fsPath });
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
};