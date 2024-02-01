import { FileFsRef } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Files } from '@vercel/build-utils';

export type Fs = Record<string, Buffer | string | { copy: string }>;

export type Filesystem = {
  workPath: string;
  repoRootPath: string;
  files: Files;
};

export async function prepareFilesystem(
  files: Fs,
  folderPrefix = 'vercel-node-tests'
): Promise<Filesystem> {
  const directory = join(tmpdir(), `${folderPrefix}-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const fileRefs: Files = {};
  for (const [key, value] of Object.entries(files)) {
    const fullPath = join(directory, key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    if (typeof value === 'string' || value instanceof Buffer) {
      await fs.writeFile(join(directory, key), value);
    } else if (typeof value.copy === 'string') {
      await fs.copyFile(join(directory, value.copy), join(directory, key));
    }
    fileRefs[key] = await FileFsRef.fromFsPath({
      fsPath: join(directory, key),
    });
  }
  return {
    workPath: directory,
    repoRootPath: directory,
    files: fileRefs,
  };
}
